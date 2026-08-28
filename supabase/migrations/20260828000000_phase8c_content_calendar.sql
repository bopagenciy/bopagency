-- =============================================================================
-- BopIAgency — Migración Phase 8C: Content Calendar
-- Archivo: 20260828000000_phase8c_content_calendar.sql
-- Rama: feat/phase-8-campaign-operations
-- Requiere: Phase 7B (campaigns), Phase 8A.1 (campaign_activations, campaign_activation_targets),
--           Phase 8B.1 (campaign_publication_jobs)
-- =============================================================================

-- =============================================================================
-- SECCIÓN A — PRERREQ: RESTRICCIONES DE UNICIDAD CANDIDATAS EN TABLAS PADRE
-- Para permitir composite FK (col, organization_id)
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_campaigns_id_org'
  ) THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT uq_campaigns_id_org UNIQUE (id, organization_id);
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_activations_id_org'
  ) THEN
    ALTER TABLE public.campaign_activations ADD CONSTRAINT uq_activations_id_org UNIQUE (id, organization_id);
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_targets_id_org'
  ) THEN
    ALTER TABLE public.campaign_activation_targets ADD CONSTRAINT uq_targets_id_org UNIQUE (id, organization_id);
  END IF;
END; $$;

-- =============================================================================
-- SECCIÓN B — TABLA: public.content_calendar_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.content_calendar_items (
  id                       uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid                        NOT NULL
                               REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id              uuid                        NOT NULL,
  activation_id            uuid                            NULL,
  target_id                uuid                            NULL,
  channel                  text                        NOT NULL,
  provider                 text                        NOT NULL,
  title                    text                        NOT NULL
                               CHECK (char_length(btrim(title)) > 0 AND char_length(title) <= 300),
  content_summary          text                            NULL
                               CHECK (content_summary IS NULL OR char_length(content_summary) <= 2000),
  scheduled_for            timestamptz                 NOT NULL,
  timezone                 text                        NOT NULL
                               CHECK (char_length(btrim(timezone)) > 0),
  status                   text                        NOT NULL
                               CHECK (status IN ('planned', 'scheduled', 'cancelled')),
  reschedule_reason        text                            NULL
                               CHECK (reschedule_reason IS NULL OR char_length(reschedule_reason) <= 1000),
  notes                    text                            NULL
                               CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by               uuid                        NOT NULL
                               REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by               uuid                            NULL
                               REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz                 NOT NULL DEFAULT now(),
  updated_at               timestamptz                 NOT NULL DEFAULT now(),

  -- Composite FKs con validación de tenant
  CONSTRAINT fk_content_calendar_items_campaign
    FOREIGN KEY (campaign_id, organization_id)
    REFERENCES public.campaigns(id, organization_id) ON DELETE RESTRICT,

  CONSTRAINT fk_content_calendar_items_activation
    FOREIGN KEY (activation_id, organization_id)
    REFERENCES public.campaign_activations(id, organization_id) ON DELETE RESTRICT,

  CONSTRAINT fk_content_calendar_items_target
    FOREIGN KEY (target_id, organization_id)
    REFERENCES public.campaign_activation_targets(id, organization_id) ON DELETE RESTRICT,

  -- Invariante de ciclo de vida
  CONSTRAINT ck_content_calendar_items_lifecycle CHECK (
    (status = 'planned' AND activation_id IS NULL AND target_id IS NULL)
    OR
    (status = 'scheduled' AND activation_id IS NOT NULL AND target_id IS NOT NULL)
    OR
    (status = 'cancelled')
  )
);

-- Indexación de consultas comunes por tenant y rango
CREATE INDEX IF NOT EXISTS idx_content_calendar_items_org_scheduled
  ON public.content_calendar_items (organization_id, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_content_calendar_items_campaign
  ON public.content_calendar_items (organization_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_content_calendar_items_target
  ON public.content_calendar_items (organization_id, target_id)
  WHERE target_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_content_calendar_items_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_content_calendar_items_updated_at ON public.content_calendar_items;
CREATE TRIGGER trg_set_content_calendar_items_updated_at
  BEFORE UPDATE ON public.content_calendar_items
  FOR EACH ROW EXECUTE FUNCTION public.set_content_calendar_items_updated_at();

-- =============================================================================
-- SECCIÓN C — SEGURIDAD / RLS / PERMISOS TABLA
-- =============================================================================

ALTER TABLE public.content_calendar_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_calendar_items_select_member ON public.content_calendar_items;
CREATE POLICY content_calendar_items_select_member ON public.content_calendar_items
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Revocar permisos de escritura directa en la tabla a authenticated
GRANT SELECT ON public.content_calendar_items TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.content_calendar_items FROM authenticated;

-- =============================================================================
-- SECCIÓN D — RPCs AUTORITATIVAS DE ESCRITURA (SECURITY DEFINER)
-- Owner: postgres
-- =============================================================================

-- D.1: create_content_calendar_item (operator+)
CREATE OR REPLACE FUNCTION public.create_content_calendar_item(
  p_organization_id UUID,
  p_campaign_id UUID,
  p_channel TEXT,
  p_provider TEXT,
  p_title TEXT,
  p_content_summary TEXT DEFAULT NULL,
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL,
  p_timezone TEXT DEFAULT 'UTC',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
  v_item_id UUID;
  v_record RECORD;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED', 'message', 'Usuario no autenticado');
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'El usuario no pertenece a la organización');
  END IF;

  IF NOT public.has_organization_role(p_organization_id, 'operator') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'Se requiere rol operator o superior');
  END IF;

  -- Validar campaña
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns WHERE id = p_campaign_id AND organization_id = p_organization_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'La campaña no existe o no pertenece a la organización');
  END IF;

  IF p_scheduled_for IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION_ERROR', 'message', 'Fecha scheduled_for es requerida');
  END IF;

  INSERT INTO public.content_calendar_items (
    organization_id, campaign_id, channel, provider, title, content_summary,
    scheduled_for, timezone, status, notes, created_by
  ) VALUES (
    p_organization_id, p_campaign_id, p_channel, p_provider, btrim(p_title), p_content_summary,
    p_scheduled_for, btrim(p_timezone), 'planned', p_notes, v_actor_id
  ) RETURNING id INTO v_item_id;

  SELECT * INTO v_record FROM public.content_calendar_items WHERE id = v_item_id;

  RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_record));
END;
$$;

-- D.2: reschedule_content_calendar_item (operator+)
CREATE OR REPLACE FUNCTION public.reschedule_content_calendar_item(
  p_calendar_item_id UUID,
  p_organization_id UUID,
  p_scheduled_for TIMESTAMPTZ,
  p_timezone TEXT,
  p_reschedule_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
  v_item RECORD;
  v_job_status TEXT;
  v_record RECORD;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED', 'message', 'Usuario no autenticado');
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'El usuario no pertenece a la organización');
  END IF;

  IF NOT public.has_organization_role(p_organization_id, 'operator') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'Se requiere rol operator o superior');
  END IF;

  IF p_reschedule_reason IS NULL OR char_length(btrim(p_reschedule_reason)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION_ERROR', 'message', 'Se requiere motivo de reprogramación');
  END IF;

  SELECT * INTO v_item FROM public.content_calendar_items
  WHERE id = p_calendar_item_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'El elemento de calendario no existe');
  END IF;

  IF v_item.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'No se puede reprogramar un elemento cancelado');
  END IF;

  -- Si tiene target asociado, verificar si hay un job en estado bloqueante
  IF v_item.target_id IS NOT NULL THEN
    SELECT status INTO v_job_status
    FROM public.campaign_publication_jobs
    WHERE target_id = v_item.target_id
    ORDER BY retry_count DESC, created_at DESC, id DESC
    LIMIT 1;

    IF v_job_status IN ('queued', 'claimed', 'in_progress', 'succeeded', 'unknown_outcome') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Programación bloqueada por job en ejecución o finalizado');
    END IF;
  END IF;

  UPDATE public.content_calendar_items
  SET scheduled_for = p_scheduled_for,
      timezone = COALESCE(NULLIF(btrim(p_timezone), ''), timezone),
      reschedule_reason = btrim(p_reschedule_reason),
      updated_by = v_actor_id
  WHERE id = p_calendar_item_id;

  SELECT * INTO v_record FROM public.content_calendar_items WHERE id = p_calendar_item_id;
  RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_record));
END;
$$;

-- D.3: cancel_content_calendar_item (strategist+)
CREATE OR REPLACE FUNCTION public.cancel_content_calendar_item(
  p_calendar_item_id UUID,
  p_organization_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
  v_item RECORD;
  v_record RECORD;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED', 'message', 'Usuario no autenticado');
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'El usuario no pertenece a la organización');
  END IF;

  IF NOT public.has_organization_role(p_organization_id, 'strategist') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'Se requiere rol strategist o superior para cancelar');
  END IF;

  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION_ERROR', 'message', 'Se requiere motivo de cancelación');
  END IF;

  SELECT * INTO v_item FROM public.content_calendar_items
  WHERE id = p_calendar_item_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'El elemento de calendario no existe');
  END IF;

  IF v_item.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'El elemento ya está cancelado');
  END IF;

  UPDATE public.content_calendar_items
  SET status = 'cancelled',
      notes = COALESCE(notes, '') || ' [Cancelación: ' || btrim(p_reason) || ']',
      updated_by = v_actor_id
  WHERE id = p_calendar_item_id;

  SELECT * INTO v_record FROM public.content_calendar_items WHERE id = p_calendar_item_id;
  RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_record));
END;
$$;

-- D.4: link_content_calendar_item_target (operator+)
CREATE OR REPLACE FUNCTION public.link_content_calendar_item_target(
  p_calendar_item_id UUID,
  p_organization_id UUID,
  p_target_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
  v_item RECORD;
  v_target RECORD;
  v_record RECORD;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED', 'message', 'Usuario no autenticado');
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'El usuario no pertenece a la organización');
  END IF;

  IF NOT public.has_organization_role(p_organization_id, 'operator') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'Se requiere rol operator o superior');
  END IF;

  SELECT * INTO v_item FROM public.content_calendar_items
  WHERE id = p_calendar_item_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'El elemento de calendario no existe');
  END IF;

  IF v_item.status != 'planned' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Solo elementos en estado planned pueden vincularse');
  END IF;

  -- Buscar target y verificar que pertenezca a la misma org, campaña y canal
  SELECT t.*, a.campaign_id
  INTO v_target
  FROM public.campaign_activation_targets t
  JOIN public.campaign_activations a ON a.id = t.activation_id
  WHERE t.id = p_target_id AND t.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'El target de activación no existe');
  END IF;

  IF v_target.campaign_id != v_item.campaign_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION_ERROR', 'message', 'El target no pertenece a la misma campaña del elemento');
  END IF;

  IF v_target.channel::text != v_item.channel THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION_ERROR', 'message', 'El canal del target no coincide con el elemento');
  END IF;

  IF v_target.provider::text != v_item.provider THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION_ERROR', 'message', 'El proveedor del target no coincide con el elemento');
  END IF;

  UPDATE public.content_calendar_items
  SET activation_id = v_target.activation_id,
      target_id = v_target.id,
      status = 'scheduled',
      updated_by = v_actor_id
  WHERE id = p_calendar_item_id;

  SELECT * INTO v_record FROM public.content_calendar_items WHERE id = p_calendar_item_id;
  RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_record));
END;
$$;

-- D.5: list_content_calendar_items_by_range (SECURITY INVOKER — lectura en rango)
CREATE OR REPLACE FUNCTION public.list_content_calendar_items_by_range(
  p_organization_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_campaign_id UUID DEFAULT NULL,
  p_channel TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  campaign_id UUID,
  campaign_name TEXT,
  client_id UUID,
  client_name TEXT,
  activation_id UUID,
  target_id UUID,
  channel TEXT,
  provider TEXT,
  title TEXT,
  content_summary TEXT,
  scheduled_for TIMESTAMPTZ,
  timezone TEXT,
  calendar_status TEXT,
  reschedule_reason TEXT,
  notes TEXT,
  campaign_status TEXT,
  target_status TEXT,
  publication_job_status TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    ci.id,
    ci.organization_id,
    ci.campaign_id,
    c.name AS campaign_name,
    c.client_id,
    cl.name AS client_name,
    ci.activation_id,
    ci.target_id,
    ci.channel,
    ci.provider,
    ci.title,
    ci.content_summary,
    ci.scheduled_for,
    ci.timezone,
    ci.status AS calendar_status,
    ci.reschedule_reason,
    ci.notes,
    c.status::text AS campaign_status,
    t.status AS target_status,
    pj.status AS publication_job_status,
    ci.created_by,
    ci.created_at,
    ci.updated_at
  FROM public.content_calendar_items ci
  JOIN public.campaigns c ON c.id = ci.campaign_id AND c.organization_id = ci.organization_id
  JOIN public.clients cl ON cl.id = c.client_id AND cl.organization_id = ci.organization_id
  LEFT JOIN public.campaign_activation_targets t ON t.id = ci.target_id AND t.organization_id = ci.organization_id
  LEFT JOIN LATERAL (
    SELECT status
    FROM public.campaign_publication_jobs
    WHERE target_id = ci.target_id AND organization_id = ci.organization_id
    ORDER BY retry_count DESC, created_at DESC, id DESC
    LIMIT 1
  ) pj ON ci.target_id IS NOT NULL
  WHERE ci.organization_id = p_organization_id
    AND ci.scheduled_for >= p_start_at
    AND ci.scheduled_for <= p_end_at
    AND (p_campaign_id IS NULL OR ci.campaign_id = p_campaign_id)
    AND (p_channel IS NULL OR ci.channel = p_channel)
  ORDER BY ci.scheduled_for ASC, ci.id ASC;
$$;

-- Permisos de RPCs
REVOKE ALL ON FUNCTION public.create_content_calendar_item FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reschedule_content_calendar_item FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_content_calendar_item FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_content_calendar_item_target FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_content_calendar_items_by_range FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_content_calendar_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_content_calendar_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_content_calendar_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_content_calendar_item_target TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_content_calendar_items_by_range TO authenticated;
