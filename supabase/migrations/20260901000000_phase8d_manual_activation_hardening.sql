-- ============================================================================
-- BOPIAGENCY — PHASE 8D: MANUAL ACTIVATION HARDENING MIGRATION
-- Migration: 20260901000000_phase8d_manual_activation_hardening.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. LIMPIEZA DE SOBRECARGAS LEGACY (Phase 8A signatures without p_organization_id)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.mark_activation_target_published(uuid, text, text);
DROP FUNCTION IF EXISTS public.cancel_activation_target(uuid, text);

-- ----------------------------------------------------------------------------
-- 1. FORWARD-ONLY HARDENING: create_publication_job (JOB -> TARGET Compliance)
-- Re-declaración de la RPC de Phase 8B.1 para garantizar estricto orden de locks
-- (JOB -> TARGET) antes de insertar un nuevo job o reintentar un job fallido.
-- Preserva idéntica firma, validaciones de rol, reglas de idempotencia y eventos.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_publication_job(
  p_target_id uuid,
  p_retry_of_job_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor              uuid := auth.uid();
  v_target_org_id      uuid;
  v_target_client_id   uuid;
  v_target_activation_id uuid;
  v_target_channel     public.activation_channel;
  v_target_provider    public.activation_provider;
  v_target_integration uuid;
  v_target_status      public.activation_target_status;
  v_existing_active    uuid;
  v_prev_status        public.publication_job_status;
  v_prev_failure_cat   text;
  v_prev_target_id     uuid;
  v_retry_count        integer := 0;
  v_idempotency_key    text;
  v_job_id             uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'create_publication_job: authentication required';
  END IF;

  -- 1. LOCK JOB LEVEL FIRST (Si existe job activo o job a reintentar)
  SELECT id INTO v_existing_active
  FROM public.campaign_publication_jobs
  WHERE target_id = p_target_id
    AND status NOT IN ('succeeded', 'failed', 'cancelled')
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'create_publication_job: target % already has an active publication job (%)',
      p_target_id, v_existing_active;
  END IF;

  IF p_retry_of_job_id IS NOT NULL THEN
    SELECT status, failure_category, target_id, retry_count
      INTO v_prev_status, v_prev_failure_cat, v_prev_target_id, v_retry_count
    FROM public.campaign_publication_jobs
    WHERE id = p_retry_of_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'create_publication_job: retry_of_job_id not found (id: %)', p_retry_of_job_id;
    END IF;

    IF v_prev_target_id IS DISTINCT FROM p_target_id THEN
      RAISE EXCEPTION 'create_publication_job: retry_of_job_id % does not belong to target %',
        p_retry_of_job_id, p_target_id;
    END IF;

    IF v_prev_status <> 'failed' OR v_prev_failure_cat IS NULL OR v_prev_failure_cat NOT IN (
      'INTEGRATION_NOT_AVAILABLE', 'RATE_LIMITED', 'DISPATCH_FAILED', 'PROVIDER_OUTAGE',
      'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED'
    ) THEN
      RAISE EXCEPTION
        'create_publication_job: job % is not eligible for retry (status: %, failure_category: %)',
        p_retry_of_job_id, v_prev_status, v_prev_failure_cat;
    END IF;

    v_retry_count := v_retry_count + 1;
  ELSE
    v_retry_count := 0;
  END IF;

  -- 2. LOCK TARGET LEVEL SECOND
  SELECT organization_id, client_id, activation_id, channel, provider, client_integration_id, status
    INTO v_target_org_id, v_target_client_id, v_target_activation_id, v_target_channel,
         v_target_provider, v_target_integration, v_target_status
  FROM public.campaign_activation_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_publication_job: target not found (id: %)', p_target_id;
  END IF;

  IF NOT public.has_organization_role(v_target_org_id, 'operator') THEN
    RAISE EXCEPTION 'create_publication_job: actor lacks operator+ role (target_id: %)', p_target_id;
  END IF;

  IF v_target_provider = 'manual' THEN
    RAISE EXCEPTION 'create_publication_job: target % is manual, does not use publication jobs', p_target_id;
  END IF;

  IF v_target_status NOT IN ('ready', 'scheduled') THEN
    RAISE EXCEPTION 'create_publication_job: target % is not ready/scheduled (current status: %)',
      p_target_id, v_target_status;
  END IF;

  v_idempotency_key := 'publish:' || v_target_org_id::text || ':' || p_target_id::text || ':' || v_retry_count::text;

  INSERT INTO public.campaign_publication_jobs (
    organization_id, client_id, activation_id, target_id, channel, provider,
    client_integration_id, status, idempotency_key, retry_of_job_id, retry_count, created_by
  ) VALUES (
    v_target_org_id, v_target_client_id, v_target_activation_id, p_target_id, v_target_channel,
    v_target_provider, v_target_integration, 'queued', v_idempotency_key, p_retry_of_job_id,
    v_retry_count, v_actor
  )
  RETURNING id INTO v_job_id;

  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, event_type, actor_user_id, is_system, note)
  VALUES
    (v_target_org_id, v_job_id, 'job_queued', v_actor, false, NULL);

  RETURN v_job_id;
END;
$$;

COMMENT ON FUNCTION public.create_publication_job(uuid, uuid) IS
  'RPC: crea un CampaignPublicationJob en queued para un target automatizado '
  'ready/scheduled (re-declaración Phase 8D con orden de locks JOB -> TARGET).';


-- ----------------------------------------------------------------------------
-- 2. mark_activation_target_published
-- Confirmación MANUAL (atestación humana) en el nivel de target de activación.
-- Rol mínimo: operator+. Exige canal/proveedor manual y al menos un campo de evidencia.
-- NUNCA crea un CampaignPublicationJob.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_activation_target_published(
  p_target_id uuid,
  p_organization_id uuid,
  p_external_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id        uuid := auth.uid();
  v_target          record;
  v_active_job      uuid;
  v_ref_clean       text;
  v_note_clean      text;
  v_updated_record  record;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED', 'message', 'Usuario no autenticado');
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'El usuario no pertenece a la organización');
  END IF;

  IF NOT public.has_organization_role(p_organization_id, 'operator') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'Se requiere rol operator o superior para atestar la publicación manual');
  END IF;

  v_ref_clean  := NULLIF(btrim(p_external_reference), '');
  v_note_clean := NULLIF(btrim(p_note), '');

  IF v_ref_clean IS NULL AND v_note_clean IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VALIDATION_ERROR',
      'message', 'Se requiere al menos un campo de evidencia (referencia externa o nota explicativa)'
    );
  END IF;

  IF v_ref_clean IS NOT NULL AND char_length(v_ref_clean) > 300 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VALIDATION_ERROR',
      'message', 'La referencia externa excede la longitud máxima de 300 caracteres'
    );
  END IF;

  IF v_note_clean IS NOT NULL AND char_length(v_note_clean) > 2000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VALIDATION_ERROR',
      'message', 'La nota excede la longitud máxima de 2000 caracteres'
    );
  END IF;

  -- Defense-in-depth: Verificar que no exista job de publicación activo
  SELECT id INTO v_active_job
  FROM public.campaign_publication_jobs
  WHERE target_id = p_target_id AND organization_id = p_organization_id
    AND status NOT IN ('succeeded', 'failed', 'cancelled')
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'STATE_CONFLICT',
      'message', 'El target tiene un job de publicación automatizado activo y no puede ser publicado manualmente'
    );
  END IF;

  -- Lock del target
  SELECT * INTO v_target
  FROM public.campaign_activation_targets
  WHERE id = p_target_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'El target de activación no existe');
  END IF;

  IF v_target.channel <> 'manual'::public.activation_channel OR v_target.provider <> 'manual'::public.activation_provider THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VALIDATION_ERROR',
      'message', 'Solo targets con canal y proveedor manual pueden usar confirmación manual'
    );
  END IF;

  IF v_target.status = 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'El target ya se encuentra publicado');
  END IF;

  IF v_target.status NOT IN ('ready', 'scheduled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'STATE_CONFLICT',
      'message', format('No se puede publicar manualmente un target en estado %s (debe estar ready o scheduled)', v_target.status)
    );
  END IF;

  -- Mutación del target
  UPDATE public.campaign_activation_targets
  SET status = 'published',
      published_at = now(),
      published_by = v_actor_id,
      external_reference = v_ref_clean
  WHERE id = p_target_id;

  -- Evento de auditoría de activación
  INSERT INTO public.campaign_activation_events (
    organization_id,
    activation_id,
    target_id,
    event_type,
    actor_user_id,
    is_system,
    from_status,
    to_status,
    note,
    metadata
  ) VALUES (
    p_organization_id,
    v_target.activation_id,
    p_target_id,
    'target_status_changed',
    v_actor_id,
    false,
    v_target.status::text,
    'published',
    v_note_clean,
    jsonb_build_object(
      'user_attestation', true,
      'external_reference', v_ref_clean,
      'timestamp', extract(epoch from now())
    )
  );

  SELECT * INTO v_updated_record FROM public.campaign_activation_targets WHERE id = p_target_id;
  RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_updated_record));
END;
$$;

COMMENT ON FUNCTION public.mark_activation_target_published(uuid, uuid, text, text) IS
  'RPC: Atestación manual humana de publicación para targets manual/manual en estado ready/scheduled. Rol operator+.';


-- ----------------------------------------------------------------------------
-- 3. cancel_activation_target
-- Cancelación atómica de target de activación y su job asociado (si existe).
-- Rol mínimo: strategist+. Exige motivo no vacío. Orden de locks: JOB -> TARGET.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_activation_target(
  p_target_id uuid,
  p_organization_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id        uuid := auth.uid();
  v_target          record;
  v_job             record;
  v_reason_clean    text;
  v_updated_record  record;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED', 'message', 'Usuario no autenticado');
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'El usuario no pertenece a la organización');
  END IF;

  IF NOT public.has_organization_role(p_organization_id, 'strategist') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'Se requiere rol strategist o superior para cancelar un target');
  END IF;

  v_reason_clean := NULLIF(btrim(p_reason), '');
  IF v_reason_clean IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION_ERROR', 'message', 'Se requiere motivo de cancelación no vacío');
  END IF;

  -- 1. LOCK JOB LEVEL FIRST (Cumplimiento de orden global JOB -> TARGET)
  SELECT * INTO v_job
  FROM public.campaign_publication_jobs
  WHERE target_id = p_target_id AND organization_id = p_organization_id
  ORDER BY retry_count DESC, created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  -- 2. LOCK TARGET LEVEL SECOND
  SELECT * INTO v_target
  FROM public.campaign_activation_targets
  WHERE id = p_target_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'El target de activación no existe');
  END IF;

  IF v_target.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'El target ya se encuentra cancelado');
  END IF;

  IF v_target.status = 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'No se puede cancelar un target en estado publicado');
  END IF;

  -- 3. REVALIDAR Y PROCESAR JOB ASOCIADO
  IF v_job IS NOT NULL THEN
    IF v_job.status = 'in_progress' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Job de publicación en curso. Cancele el job primero o espere a su finalización.');
    ELSIF v_job.status = 'unknown_outcome' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Resultado de publicación indeterminado. Requiere reconciliación previa.');
    ELSIF v_job.status IN ('queued', 'claimed') THEN
      -- Reutilizar el helper autoritativo de cancelación de job de Phase 8B
      PERFORM public.cancel_publication_job(v_job.id, v_reason_clean);
    END IF;
  END IF;

  -- 4. MUTACIÓN DEL TARGET
  UPDATE public.campaign_activation_targets
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor_id
  WHERE id = p_target_id;

  -- 5. EVENTO DE AUDITORÍA DE ACTIVACIÓN
  INSERT INTO public.campaign_activation_events (
    organization_id,
    activation_id,
    target_id,
    event_type,
    actor_user_id,
    is_system,
    from_status,
    to_status,
    note
  ) VALUES (
    p_organization_id,
    v_target.activation_id,
    p_target_id,
    'target_status_changed',
    v_actor_id,
    false,
    v_target.status::text,
    'cancelled',
    v_reason_clean
  );

  SELECT * INTO v_updated_record FROM public.campaign_activation_targets WHERE id = p_target_id;
  RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_updated_record));
END;
$$;

COMMENT ON FUNCTION public.cancel_activation_target(uuid, uuid, text) IS
  'RPC: Cancelación atómica de target de activación (strategist+). Reutiliza cancel_publication_job para jobs queued/claimed con orden JOB -> TARGET.';


-- ----------------------------------------------------------------------------
-- 4. PERMISOS Y PRIVILEGIOS DE SEGURIDAD (Grant / Revoke)
-- ----------------------------------------------------------------------------

-- create_publication_job
REVOKE ALL ON FUNCTION public.create_publication_job(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_publication_job(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_publication_job(uuid, uuid) TO authenticated;

-- mark_activation_target_published
REVOKE ALL ON FUNCTION public.mark_activation_target_published(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_activation_target_published(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_activation_target_published(uuid, uuid, text, text) TO authenticated;

-- cancel_activation_target
REVOKE ALL ON FUNCTION public.cancel_activation_target(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_activation_target(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_activation_target(uuid, uuid, text) TO authenticated;
