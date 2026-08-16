-- =============================================================================
-- BopIAgency — Migración Phase 7B: Campaign Studio — Persistencia
-- Archivo: 20260816130000_phase7b_campaign_studio_persistence.sql
-- Rama: feat/phase-7-campaign-studio
-- Requiere: 20260730000000 (organizations/is_organization_member/has_organization_role),
--           20260730120000 (clients, check_client_organization_match, protect_child_immutable_fields)
--           aplicadas.
--
-- ⚠️  ACCIÓN MANUAL: Aplicar en Supabase Dashboard → SQL Editor → Run,
--     o localmente vía `supabase db reset` / `supabase migration up` (ver
--     docs/implementation/phase-7/PHASE_7B_PERSISTENCE_REPORT.md).
--     NO ejecutar contra Supabase remoto/producción desde esta tarea.
--
-- ALCANCE (Phase 7B — solo persistencia):
--   • Crea public.campaigns, public.campaign_approvals, public.compliance_rules.
--   • RLS multi-tenant en las 3 tablas, reutilizando los helpers existentes
--     (is_organization_member, has_organization_role) y los triggers de
--     integridad ya usados por `clients` (check_client_organization_match,
--     protect_child_immutable_fields, set_updated_at).
--   • NO importa compliance-master-guide.md (tabla queda vacía — Phase 7C).
--   • NO crea el flujo approve/reject (use cases — Phase 7C).
--   • NO publica campañas a Meta/Google/YouTube (fase posterior).
--
-- DECISIONES DE DISEÑO (detalle completo en PHASE_7B_PERSISTENCE_REPORT.md):
--   • organization_id y client_id son NOT NULL en campaigns (regla de negocio
--     fijada: toda campaña pertenece obligatoriamente a ambos).
--   • budget/currency/start_date/end_date se conservan de la entidad Campaign
--     ya existente (Phase 1) — no son columnas nuevas inventadas.
--   • campaigns.delete() se retira del contrato de dominio: no existe concepto
--     de borrado (físico ni soft) para campañas en las reglas de negocio
--     fijadas; los estados son el mecanismo de ciclo de vida.
--   • RLS de UPDATE en campaigns restringe WITH CHECK a status IN ('draft',
--     'review') — un UPDATE genérico de un operator/strategist/admin/owner
--     JAMÁS puede fijar status='approved'/'rejected' directamente. Esa
--     transición se reserva a una función SECURITY DEFINER que Phase 7C debe
--     crear (mismo patrón que acknowledge_alert/resolve_alert), la única vía
--     autorizada para escribir approved_at/rejected_at con el actor correcto.
--   • compliance_rules.organization_id NULL = regla global. Las reglas
--     globales solo pueden insertarse/actualizarse vía service_role (no hay
--     policy de INSERT/UPDATE para organization_id IS NULL) — evita que un
--     admin de una organización sobrescriba reglas de todo el sistema.
--
-- IDEMPOTENCIA: CREATE IF NOT EXISTS / DROP POLICY IF EXISTS / DROP TRIGGER
-- IF NOT EXISTS, igual que el resto de migraciones del repo.
-- =============================================================================

-- =============================================================================
-- SECCIÓN A — ENUMS
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'campaign_status' AND n.nspname = 'public'
  ) THEN
    -- Alineado 1:1 con CAMPAIGN_STATUSES en packages/shared/src/constants/status.ts.
    -- active/paused/completed son estados post-aprobación anticipados para una
    -- fase de publicación posterior; no los usa ningún use case de Phase 7B/7C.
    CREATE TYPE public.campaign_status AS ENUM (
      'draft', 'review', 'approved', 'active', 'paused', 'completed', 'rejected'
    );
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'campaign_objective' AND n.nspname = 'public'
  ) THEN
    -- Alineado 1:1 con CampaignObjective en packages/domain/src/entities/campaign.ts.
    CREATE TYPE public.campaign_objective AS ENUM (
      'brand_awareness', 'reach', 'traffic', 'engagement',
      'lead_generation', 'conversions', 'catalog_sales'
    );
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'campaign_approval_action' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.campaign_approval_action AS ENUM ('approved', 'rejected');
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'compliance_rule_severity' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.compliance_rule_severity AS ENUM ('critical', 'high', 'medium', 'low');
  END IF;
END; $$;

-- =============================================================================
-- SECCIÓN B — TABLA: public.campaigns
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaigns (
  id                       uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid                        NOT NULL
                              REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id                uuid                        NOT NULL
                              REFERENCES public.clients(id) ON DELETE RESTRICT,
  name                     text                        NOT NULL
                              CHECK (char_length(name) BETWEEN 1 AND 200),
  -- Alineado con AD_PLATFORMS (packages/shared/src/constants/platforms.ts).
  -- Se conserva la lista completa de Phase 1 sin acotarla — decisión de
  -- producto (qué plataformas soporta realmente Campaign Studio) diferida.
  platform                 text                        NOT NULL
                              CHECK (platform IN (
                                'meta_ads','google_ads','youtube_ads','tiktok_ads',
                                'linkedin_ads','twitter_ads','snapchat_ads','pinterest_ads',
                                'amazon_ads','microsoft_ads','spotify_ads','apple_ads',
                                'ga4','shopify'
                              )),
  objective                public.campaign_objective   NOT NULL,
  status                   public.campaign_status      NOT NULL DEFAULT 'draft',
  -- Brief/input de la campaña (creativo, dirección, contexto). Nullable: un
  -- draft manual puede crearse sin brief; Phase 7D (IA) siempre lo requerirá
  -- a nivel de use case, no de columna.
  brief                    text                            NULL
                              CHECK (brief IS NULL OR char_length(brief) <= 10000),
  budget                   numeric(14,2)               NOT NULL
                              CHECK (budget >= 0),
  currency                 text                        NOT NULL DEFAULT 'COP'
                              CHECK (currency IN ('USD','COP','MXN','EUR')),
  start_date               date                            NULL,
  end_date                 date                            NULL,
  -- Contenido estructurado generado por IA (Phase 7D). NULL hasta entonces.
  -- Nunca se aprueba automáticamente por su sola presencia (regla de negocio).
  generated_content        jsonb                           NULL
                              CHECK (generated_content IS NULL OR jsonb_typeof(generated_content) = 'object'),
  metadata                 jsonb                       NOT NULL DEFAULT '{}'
                              CHECK (jsonb_typeof(metadata) = 'object'),
  -- Auditoría: asignada por trigger manage_campaign_write desde auth.uid().
  created_by               uuid                        NOT NULL
                              REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by               uuid                            NULL
                              REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Timestamps de ciclo de vida. Se preparan aquí como columnas simples;
  -- la escritura autorizada de approved_at/rejected_at queda restringida por
  -- RLS (WITH CHECK status IN ('draft','review')) + la función SECURITY
  -- DEFINER que Phase 7C debe crear. submitted_for_review_at sí puede
  -- escribirse hoy vía UPDATE normal (operator+ enviando a revisión).
  submitted_for_review_at  timestamptz                     NULL,
  approved_at              timestamptz                     NULL,
  rejected_at              timestamptz                     NULL,
  created_at               timestamptz                 NOT NULL DEFAULT now(),
  updated_at               timestamptz                 NOT NULL DEFAULT now(),
  CONSTRAINT ck_campaigns_dates CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  )
);

COMMENT ON TABLE public.campaigns IS
  'Campaign Studio (Phase 7). Distinto de client_metrics.campaigns (JSONB de '
  'métricas de campañas externas ya corriendo en Meta/Google/YouTube) — '
  'ver PHASE_7_AUDIT.md §2. La auditoría (created_by/updated_by) la asigna '
  'el trigger manage_campaign_write desde auth.uid().';

CREATE INDEX IF NOT EXISTS idx_campaigns_org
  ON public.campaigns(organization_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_client
  ON public.campaigns(client_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_status
  ON public.campaigns(status);

CREATE INDEX IF NOT EXISTS idx_campaigns_org_client_status
  ON public.campaigns(organization_id, client_id, status);

CREATE INDEX IF NOT EXISTS idx_campaigns_org_created
  ON public.campaigns(organization_id, created_at DESC);

-- =============================================================================
-- SECCIÓN C — TABLA: public.campaign_approvals (audit trail append-only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_approvals (
  id               uuid                              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid                              NOT NULL
                      REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id      uuid                              NOT NULL
                      REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  action           public.campaign_approval_action   NOT NULL,
  note             text                                  NULL
                      CHECK (note IS NULL OR char_length(note) <= 5000),
  actor_user_id    uuid                              NOT NULL
                      REFERENCES auth.users(id) ON DELETE RESTRICT,
  metadata         jsonb                             NOT NULL DEFAULT '{}'
                      CHECK (jsonb_typeof(metadata) = 'object'),
  created_at       timestamptz                       NOT NULL DEFAULT now(),
  -- Regla de negocio fijada #7: el rechazo exige nota no vacía.
  CONSTRAINT ck_campaign_approvals_rejection_note CHECK (
    action <> 'rejected' OR (note IS NOT NULL AND char_length(trim(note)) > 0)
  )
);

COMMENT ON TABLE public.campaign_approvals IS
  'Audit trail append-only de decisiones de aprobación/rechazo de campañas. '
  'No se sobrescriben decisiones históricas: sin UPDATE ni DELETE para '
  'authenticated (ni por RLS ni por GRANT). actor_user_id + created_at '
  'registran quién decidió y cuándo; el use case approveCampaign/rejectCampaign '
  '(Phase 7C) es responsable de validar que el actor sea owner/admin antes de '
  'insertar la fila (reforzado también por RLS INSERT).';

CREATE INDEX IF NOT EXISTS idx_campaign_approvals_campaign
  ON public.campaign_approvals(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_approvals_org
  ON public.campaign_approvals(organization_id);

CREATE INDEX IF NOT EXISTS idx_campaign_approvals_org_campaign_created
  ON public.campaign_approvals(organization_id, campaign_id, created_at DESC);

-- =============================================================================
-- SECCIÓN D — TABLA: public.compliance_rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.compliance_rules (
  id               uuid                                PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = regla global (aplica a todas las organizaciones). Ver PHASE_7_AUDIT.md §5:
  -- la guía maestra de compliance es global; los archivos compliance-rules.md
  -- por cliente son la evidencia de que también existen reglas client-scoped.
  organization_id  uuid                                    NULL
                      REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id        uuid                                    NULL
                      REFERENCES public.clients(id) ON DELETE CASCADE,
  -- NULL = aplica a todas las plataformas.
  platform         text                                    NULL
                      CHECK (platform IS NULL OR platform IN (
                        'meta_ads','google_ads','youtube_ads','tiktok_ads',
                        'linkedin_ads','twitter_ads','snapchat_ads','pinterest_ads',
                        'amazon_ads','microsoft_ads','spotify_ads','apple_ads',
                        'ga4','shopify'
                      )),
  -- Ver PHASE_7_AUDIT.md §5: la guía maestra no está organizada sistemáticamente
  -- por jurisdicción (solo menciona FTC/EE.UU. de forma incidental). Columna
  -- libre, sin CHECK contra una lista cerrada, para no bloquear la importación
  -- futura con un valor que no anticipamos hoy.
  jurisdiction     text                                    NULL
                      CHECK (jurisdiction IS NULL OR char_length(jurisdiction) <= 50),
  rule_key         text                                NOT NULL
                      CHECK (rule_key ~ '^[a-z0-9][a-z0-9_.-]{0,148}[a-z0-9]$' OR rule_key ~ '^[a-z0-9]$'),
  title            text                                NOT NULL
                      CHECK (char_length(title) BETWEEN 1 AND 200),
  description      text                                NOT NULL
                      CHECK (char_length(description) BETWEEN 1 AND 5000),
  severity         public.compliance_rule_severity     NOT NULL DEFAULT 'medium',
  -- Industria/tema de la regla (ej. 'salud_general', 'finanzas', 'meta_special_category').
  -- Texto libre — la guía maestra tiene 10 categorías (§ÍNDICE RÁPIDO) que no
  -- se fijan aquí como enum para no bloquear categorías nuevas al importar.
  category         text                                NOT NULL DEFAULT 'general'
                      CHECK (char_length(category) <= 100),
  active           boolean                             NOT NULL DEFAULT true,
  -- Trazabilidad de origen (ej. 'compliance-master-guide.md#section-1',
  -- '.agencia-ai/clients/bop-soluciones/compliance-rules.md'). NULL si la
  -- regla se crea manualmente en el futuro, no importada.
  source           text                                    NULL
                      CHECK (source IS NULL OR char_length(source) <= 500),
  metadata         jsonb                               NOT NULL DEFAULT '{}'
                      CHECK (jsonb_typeof(metadata) = 'object'),
  created_at       timestamptz                         NOT NULL DEFAULT now(),
  updated_at       timestamptz                         NOT NULL DEFAULT now(),
  CONSTRAINT ck_compliance_rules_client_requires_org CHECK (
    client_id IS NULL OR organization_id IS NOT NULL
  )
);

COMMENT ON TABLE public.compliance_rules IS
  'Persistencia preparada para Phase 7C. NO se importa compliance-master-guide.md '
  'en Phase 7B — la tabla queda vacía. organization_id IS NULL = regla global; '
  'client_id IS NOT NULL = override específico de cliente (siempre requiere '
  'organization_id). Solo desactivar (active=false), nunca borrar — ver '
  'PHASE_7B_PERSISTENCE_REPORT.md.';

CREATE INDEX IF NOT EXISTS idx_compliance_rules_org
  ON public.compliance_rules(organization_id);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_client
  ON public.compliance_rules(client_id);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_active
  ON public.compliance_rules(active);

-- rule_key único por nivel de scope (global / org / cliente).
CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_rules_global_key
  ON public.compliance_rules(rule_key)
  WHERE organization_id IS NULL AND client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_rules_org_key
  ON public.compliance_rules(organization_id, rule_key)
  WHERE organization_id IS NOT NULL AND client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_rules_client_key
  ON public.compliance_rules(client_id, rule_key)
  WHERE client_id IS NOT NULL;

-- =============================================================================
-- SECCIÓN E — TRIGGERS DE INTEGRIDAD Y AUDITORÍA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- E1. manage_campaign_write()
--
-- BEFORE INSERT OR UPDATE en campaigns.
-- Asigna created_by/updated_by desde auth.uid() (nunca desde el cliente).
-- Protege id/organization_id/client_id/created_at de modificación en UPDATE.
-- Mismo patrón que manage_client_write(), sin la lógica de soft-delete
-- (campaigns no tiene deleted_at — ver decisión de diseño en el encabezado).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.manage_campaign_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
      NEW.updated_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: campos inmutables
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'campaigns: id is immutable';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'campaigns: organization_id is immutable';
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'campaigns: client_id is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'campaigns: created_at is immutable';
  END IF;
  NEW.created_by := OLD.created_by;

  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.manage_campaign_write() IS
  'BEFORE INSERT OR UPDATE en campaigns. Gestiona auditoría (created_by/updated_by '
  'desde auth.uid()) y protege id/organization_id/client_id/created_at.';

-- ---------------------------------------------------------------------------
-- E2. check_campaign_organization_match()
--
-- BEFORE INSERT en campaign_approvals.
-- Verifica que la campaña padre exista y que su organization_id coincida
-- con NEW.organization_id. Análogo a check_client_organization_match(),
-- pero apuntando a `campaigns` (esa función no es reutilizable tal cual
-- porque está escrita específicamente contra `public.clients`).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_campaign_organization_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_org_id uuid;
BEGIN
  SELECT organization_id INTO v_campaign_org_id
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'check_campaign_organization_match: campaign not found (id: %)',
      NEW.campaign_id;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_campaign_org_id THEN
    RAISE EXCEPTION
      'check_campaign_organization_match: organization_id mismatch '
      '(campaign_id: %, expected: %, got: %)',
      NEW.campaign_id, v_campaign_org_id, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_campaign_organization_match() IS
  'BEFORE INSERT en campaign_approvals. Verifica que organization_id coincida '
  'con el organization_id real de la campaña referenciada.';

-- ---------------------------------------------------------------------------
-- Triggers — campaigns
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_campaigns_write ON public.campaigns;
CREATE TRIGGER trg_campaigns_write
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.manage_campaign_write();

DROP TRIGGER IF EXISTS trg_campaigns_org_match ON public.campaigns;
CREATE TRIGGER trg_campaigns_org_match
  BEFORE INSERT OR UPDATE OF organization_id, client_id ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.check_client_organization_match();

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Triggers — campaign_approvals (sin updated_at: tabla append-only)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_campaign_approvals_org_match ON public.campaign_approvals;
CREATE TRIGGER trg_campaign_approvals_org_match
  BEFORE INSERT ON public.campaign_approvals
  FOR EACH ROW EXECUTE FUNCTION public.check_campaign_organization_match();

-- ---------------------------------------------------------------------------
-- Triggers — compliance_rules
-- ---------------------------------------------------------------------------

-- Reutiliza check_client_organization_match(), pero solo cuando client_id
-- no es NULL (la función no tolera client_id NULL — asume registros hijos
-- de cliente siempre vinculados, cierto para client_contacts/client_documents
-- pero no para compliance_rules globales/org-level).
DROP TRIGGER IF EXISTS trg_compliance_rules_org_match ON public.compliance_rules;
CREATE TRIGGER trg_compliance_rules_org_match
  BEFORE INSERT OR UPDATE OF organization_id, client_id ON public.compliance_rules
  FOR EACH ROW
  WHEN (NEW.client_id IS NOT NULL)
  EXECUTE FUNCTION public.check_client_organization_match();

-- Reutiliza protect_child_immutable_fields() (protege id/organization_id/
-- client_id/created_at). Tolera NULLs — NEW.x IS DISTINCT FROM OLD.x es
-- false cuando ambos son NULL, así que una regla global no se rompe.
DROP TRIGGER IF EXISTS trg_compliance_rules_immutable ON public.compliance_rules;
CREATE TRIGGER trg_compliance_rules_immutable
  BEFORE UPDATE ON public.compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.protect_child_immutable_fields();

DROP TRIGGER IF EXISTS trg_compliance_rules_updated_at ON public.compliance_rules;
CREATE TRIGGER trg_compliance_rules_updated_at
  BEFORE UPDATE ON public.compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SECCIÓN F — GRANTS
-- =============================================================================
-- REVOKE ALL antes de GRANT explícito (mismo patrón que Phase 3/4/6B).
-- service_role: sin grants nuevos — no hay ningún consumidor server-side real
-- en código para estas 3 tablas en Phase 7B (no hay webhook n8n, no hay import
-- job). service_role sigue bypaseando RLS por defecto en Supabase; no se
-- necesita ni se otorga ningún privilegio adicional explícito aquí.

REVOKE ALL ON public.campaigns          FROM anon, authenticated;
REVOKE ALL ON public.campaign_approvals FROM anon, authenticated;
REVOKE ALL ON public.compliance_rules   FROM anon, authenticated;

-- campaigns: sin DELETE (no existe concepto de borrado — ver decisión de diseño).
GRANT SELECT, INSERT, UPDATE ON public.campaigns TO authenticated;

-- campaign_approvals: append-only — sin UPDATE ni DELETE, ni siquiera a nivel
-- de GRANT (defensa en profundidad más allá de RLS).
GRANT SELECT, INSERT ON public.campaign_approvals TO authenticated;

-- compliance_rules: sin DELETE (preferir active=false — ver decisión de diseño).
GRANT SELECT, INSERT, UPDATE ON public.compliance_rules TO authenticated;

-- =============================================================================
-- SECCIÓN G — ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rules   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS: campaigns
-- ---------------------------------------------------------------------------

-- SELECT: cualquier miembro activo de la organización. Se excluyen campañas
-- cuyo cliente padre esté soft-deleted (mismo patrón que tasks/automations).
DROP POLICY IF EXISTS campaigns_select ON public.campaigns;
CREATE POLICY campaigns_select ON public.campaigns FOR SELECT TO authenticated
  USING (
    public.is_organization_member(campaigns.organization_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id              = campaigns.client_id
        AND c.organization_id = campaigns.organization_id
        AND c.deleted_at      IS NULL
    )
  );

-- INSERT: owner/admin/strategist/operator (matriz aprobada — viewer no).
-- Toda campaña nace en 'draft'. Cliente padre debe existir, activo, y en la
-- misma organización (reforzado también por el trigger trg_campaigns_org_match).
DROP POLICY IF EXISTS campaigns_insert ON public.campaigns;
CREATE POLICY campaigns_insert ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (
    public.has_organization_role(campaigns.organization_id, 'operator')
    AND campaigns.status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id              = campaigns.client_id
        AND c.organization_id = campaigns.organization_id
        AND c.deleted_at      IS NULL
    )
  );

-- UPDATE: owner/admin/strategist/operator, solo mientras la campaña está en
-- 'draft' (regla de negocio #4). WITH CHECK acota el nuevo status a
-- ('draft','review') — permite la transición "enviar a revisión" (regla #5)
-- dentro de esta misma policy, pero bloquea a CUALQUIER actor (incluido
-- admin/owner) fijar 'approved'/'rejected' vía UPDATE genérico: esa escritura
-- se reserva a una función SECURITY DEFINER que Phase 7C debe crear (mismo
-- patrón que acknowledge_alert/resolve_alert). Ver nota "Cambios de estado
-- sensibles" en PHASE_7B_PERSISTENCE_REPORT.md.
DROP POLICY IF EXISTS campaigns_update ON public.campaigns;
CREATE POLICY campaigns_update ON public.campaigns FOR UPDATE TO authenticated
  USING (
    public.has_organization_role(campaigns.organization_id, 'operator')
    AND campaigns.status = 'draft'
  )
  WITH CHECK (
    public.has_organization_role(campaigns.organization_id, 'operator')
    AND campaigns.status IN ('draft', 'review')
  );

-- No hay policy de DELETE: sin GRANT DELETE, cualquier intento es rechazado
-- antes de evaluar RLS.

-- ---------------------------------------------------------------------------
-- RLS: campaign_approvals
-- ---------------------------------------------------------------------------

-- SELECT: miembros de la organización.
DROP POLICY IF EXISTS campaign_approvals_select ON public.campaign_approvals;
CREATE POLICY campaign_approvals_select ON public.campaign_approvals FOR SELECT TO authenticated
  USING (public.is_organization_member(campaign_approvals.organization_id));

-- INSERT: solo owner/admin (regla de negocio #6). El trigger
-- trg_campaign_approvals_org_match verifica que organization_id coincida con
-- la campaña; el CHECK ck_campaign_approvals_rejection_note exige nota en
-- rechazos a nivel de tabla (no solo de use case).
DROP POLICY IF EXISTS campaign_approvals_insert ON public.campaign_approvals;
CREATE POLICY campaign_approvals_insert ON public.campaign_approvals FOR INSERT TO authenticated
  WITH CHECK (
    public.has_organization_role(campaign_approvals.organization_id, 'admin')
    AND campaign_approvals.actor_user_id = auth.uid()
  );

-- Sin policy de UPDATE ni DELETE — append-only. Sin GRANT tampoco (Sección F),
-- doble barrera.

-- ---------------------------------------------------------------------------
-- RLS: compliance_rules
-- ---------------------------------------------------------------------------

-- SELECT: reglas globales (organization_id IS NULL) visibles para cualquier
-- usuario autenticado; reglas org/client-scoped visibles solo a miembros de
-- esa organización.
DROP POLICY IF EXISTS compliance_rules_select ON public.compliance_rules;
CREATE POLICY compliance_rules_select ON public.compliance_rules FOR SELECT TO authenticated
  USING (
    compliance_rules.organization_id IS NULL
    OR public.is_organization_member(compliance_rules.organization_id)
  );

-- INSERT/UPDATE: owner/admin de la organización, solo para reglas de su
-- propia organización o de sus clientes (organization_id NOT NULL exigido —
-- las reglas globales solo las gestiona service_role, fuera de RLS).
DROP POLICY IF EXISTS compliance_rules_insert ON public.compliance_rules;
CREATE POLICY compliance_rules_insert ON public.compliance_rules FOR INSERT TO authenticated
  WITH CHECK (
    compliance_rules.organization_id IS NOT NULL
    AND public.has_organization_role(compliance_rules.organization_id, 'admin')
    AND (
      compliance_rules.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = compliance_rules.client_id
          AND c.organization_id = compliance_rules.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

DROP POLICY IF EXISTS compliance_rules_update ON public.compliance_rules;
CREATE POLICY compliance_rules_update ON public.compliance_rules FOR UPDATE TO authenticated
  USING (
    compliance_rules.organization_id IS NOT NULL
    AND public.has_organization_role(compliance_rules.organization_id, 'admin')
  )
  WITH CHECK (
    compliance_rules.organization_id IS NOT NULL
    AND public.has_organization_role(compliance_rules.organization_id, 'admin')
  );

-- Sin policy de DELETE: preferir active=false (Sección F sin GRANT DELETE).

-- =============================================================================
-- FIN DE MIGRACIÓN
-- Aplicar manualmente en: Supabase Dashboard → SQL Editor → Run (o local, ver
-- PHASE_7B_PERSISTENCE_REPORT.md §"Instrucciones para aplicar/verificar").
-- NO ejecutada contra Supabase remoto/producción como parte de esta tarea.
-- =============================================================================
