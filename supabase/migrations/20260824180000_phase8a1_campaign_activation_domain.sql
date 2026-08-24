-- =============================================================================
-- BopIAgency — Migración Phase 8A.1: Campaign Activation Domain + Persistence
-- Archivo: 20260824180000_phase8a1_campaign_activation_domain.sql
-- Rama: feat/phase-8-campaign-operations
-- Requiere: 20260816130000 (campaigns, campaign_approvals) y 20260816140000
--           (approve_campaign/reject_campaign) aplicadas. Requiere también
--           20260730120000 (clients, client_integrations, has_organization_role,
--           is_organization_member).
--
-- ⚠️  ACCIÓN MANUAL: Aplicar en Supabase Dashboard → SQL Editor → Run, o
--     localmente vía psql/docker contra `supabase_db_BopIAgency`. NO ejecutar
--     contra Supabase remoto/producción desde esta tarea. Este puente no tiene
--     `supabase`/`docker`/`psql` disponibles — NO se aplicó localmente como
--     parte de esta tarea (ver PHASE_8A1_ACTIVATION_DOMAIN_PERSISTENCE_REPORT.md
--     §"Local Supabase validation").
--
-- ALCANCE (Phase 8A.1 — SOLO dominio + persistencia, ver kickoff §1/§30):
--   • Crea 3 tablas: campaign_activations, campaign_activation_targets,
--     campaign_activation_events (audit
--     docs/implementation/phase-8/PHASE_8A_ACTIVATION_AUDIT.md §15).
--   • Crea 5 RPCs SECURITY DEFINER de transición crítica (mismo patrón que
--     approve_campaign/reject_campaign):
--       prepare_activation_target, mark_activation_target_ready,
--       mark_activation_target_published, cancel_activation_target,
--       cancel_campaign_activation.
--   • NO crea RPC de creación de activation — la creación es un INSERT
--     directo autorizado por RLS + trigger de validación (ver SECCIÓN F),
--     siguiendo la decisión explícita del kickoff §14: "crear la tabla con
--     RLS y constraints, pero reservar la creación segura real (use case) a
--     8A.2". El trigger `check_activation_source()` YA impide crear una
--     activation válida desde una campaña que no esté 'approved' o cuya
--     campaign_approval_id no sea una aprobación real de esa campaña — no es
--     un bypass inseguro, es la misma barrera que tendría una RPC, solo que
--     expresada como trigger sobre INSERT en vez de como función invocada.
--   • NO crea schedule_activation (activation-level scheduling) — el camino
--     manual de 8A.1 no lo necesita (ready → published directo); diferido a
--     8A.2/8D. Documentado como desviación en el reporte de esta subfase.
--   • NO crea publication_jobs/execution_jobs, NO credenciales de proveedor,
--     NO tablas de automatización nuevas.
--   • NO publica campañas a Meta/Google/YouTube.
--   • NO cambia campaigns.status, NO cambia el state machine de Campaign,
--     NO cambia la semántica de aprobación de Phase 7C.
--
-- DISEÑO — recompute de status derivado (audit §6.A):
-- El status de `campaign_activations` NO se setea libremente por el
-- aplicativo: se DERIVA de los status de sus targets vía la función
-- `compute_campaign_activation_status()`, invocada automáticamente por el
-- trigger `trg_activation_targets_recompute_status` en cada INSERT/UPDATE
-- (status)/DELETE de `campaign_activation_targets`. La única transición
-- COMANDADA directamente sobre la activation es `cancelled` (vía
-- `cancel_campaign_activation`, que también cancela en cascada los targets
-- no-terminales). Esto es un espejo SQL deliberado de
-- `deriveActivationStatus()`/`canTransitionActivation()` en
-- packages/domain/src/entities/campaign-activation.ts — cualquier cambio a
-- una de las dos implementaciones DEBE reflejarse en la otra (documentado
-- también en el dominio).
--
-- DISEÑO — grants column-level (defensa en profundidad más allá de RLS):
-- `authenticated` solo tiene GRANT UPDATE sobre columnas no-críticas
-- (notes/metadata en activations; readiness_checklist/metadata en targets).
-- Los campos de status/timestamps de transición NUNCA son alcanzables por un
-- UPDATE directo de `authenticated` — ni siquiera con el rol adecuado — solo
-- las funciones SECURITY DEFINER (que corren como el dueño de la tabla y por
-- tanto no están sujetas a estos GRANT column-level) pueden escribirlos.
-- `campaign_activation_events` no tiene NINGÚN grant de escritura para
-- `authenticated` — los eventos se insertan EXCLUSIVAMENTE desde triggers
-- SECURITY DEFINER, nunca desde una Server Action ni un use case.
--
-- service_role: sin GRANT explícito — ningún consumidor server-side (n8n,
-- webhook) existe todavía para estas tablas en 8A.1, mismo criterio que
-- 20260816130000/20260816140000.
-- =============================================================================

-- =============================================================================
-- SECCIÓN A — ENUMS (idempotentes)
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'activation_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.activation_status AS ENUM (
      'pending', 'preparing', 'ready', 'scheduled', 'executing',
      'completed', 'partially_completed', 'failed', 'cancelled'
    );
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'activation_target_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.activation_target_status AS ENUM (
      'pending', 'preparing', 'ready', 'scheduled', 'publishing',
      'published', 'failed', 'cancelled'
    );
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'activation_channel' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.activation_channel AS ENUM (
      'manual', 'meta_ads', 'instagram_organic', 'facebook_organic',
      'google_ads', 'linkedin_ads', 'email'
    );
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'activation_provider' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.activation_provider AS ENUM (
      'manual', 'meta', 'google', 'linkedin', 'email'
    );
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'activation_event_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.activation_event_type AS ENUM (
      'activation_created', 'target_added', 'target_removed',
      'activation_status_changed', 'target_status_changed', 'activation_cancelled'
    );
  END IF;
END; $$;

-- =============================================================================
-- SECCIÓN B — TABLA: public.campaign_activations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_activations (
  id                    uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid                      NOT NULL
                           REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id             uuid                      NOT NULL
                           REFERENCES public.clients(id) ON DELETE RESTRICT,
  campaign_id           uuid                      NOT NULL
                           REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  campaign_approval_id  uuid                      NOT NULL
                           REFERENCES public.campaign_approvals(id) ON DELETE RESTRICT,
  status                public.activation_status  NOT NULL DEFAULT 'pending',
  -- Contenido aprobado congelado — ver audit §14. NUNCA actualizado tras el
  -- INSERT (ningún UPDATE de esta migración toca esta columna).
  approved_snapshot     jsonb                     NOT NULL
                           CHECK (jsonb_typeof(approved_snapshot) = 'object'),
  scheduled_at          timestamptz                   NULL,
  prepared_at           timestamptz                   NULL,
  ready_at              timestamptz                   NULL,
  started_at            timestamptz                   NULL,
  completed_at          timestamptz                   NULL,
  cancelled_at          timestamptz                   NULL,
  cancelled_by          uuid                          NULL
                           REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason   text                          NULL
                           CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) <= 2000),
  notes                 text                          NULL
                           CHECK (notes IS NULL OR char_length(notes) <= 5000),
  metadata              jsonb                     NOT NULL DEFAULT '{}'
                           CHECK (jsonb_typeof(metadata) = 'object'),
  created_by            uuid                      NOT NULL
                           REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by            uuid                          NULL
                           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz               NOT NULL DEFAULT now(),
  updated_at            timestamptz               NOT NULL DEFAULT now(),
  -- Regla de negocio: cancelar exige razón no vacía (mismo criterio que
  -- ck_campaign_approvals_rejection_note en Phase 7B).
  CONSTRAINT ck_campaign_activations_cancellation_reason CHECK (
    status <> 'cancelled' OR (cancellation_reason IS NOT NULL AND char_length(trim(cancellation_reason)) > 0)
  )
);

COMMENT ON TABLE public.campaign_activations IS
  'Phase 8A.1 — frontera explícita y auditable entre "campaign approved" y '
  'ejecución externa/manual. approved_snapshot congela el contenido aprobado '
  'en el momento de creación — inmutable, nunca actualizado. status se DERIVA '
  'de campaign_activation_targets vía compute_campaign_activation_status() '
  '(trigger), salvo la transición explícita a "cancelled". Ver '
  'docs/implementation/phase-8/PHASE_8A_ACTIVATION_AUDIT.md.';

-- Solo una activation NO-terminal por campaña a la vez (audit §5/§9/§15).
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_activations_active_per_campaign
  ON public.campaign_activations(campaign_id)
  WHERE status NOT IN ('completed', 'partially_completed', 'failed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_campaign_activations_org
  ON public.campaign_activations(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_activations_client
  ON public.campaign_activations(client_id);
CREATE INDEX IF NOT EXISTS idx_campaign_activations_campaign
  ON public.campaign_activations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_activations_status
  ON public.campaign_activations(status);
CREATE INDEX IF NOT EXISTS idx_campaign_activations_org_created
  ON public.campaign_activations(organization_id, created_at DESC);

-- =============================================================================
-- SECCIÓN C — TABLA: public.campaign_activation_targets
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_activation_targets (
  id                     uuid                              PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_id          uuid                              NOT NULL
                            REFERENCES public.campaign_activations(id) ON DELETE CASCADE,
  organization_id        uuid                              NOT NULL
                            REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id              uuid                              NOT NULL
                            REFERENCES public.clients(id) ON DELETE RESTRICT,
  channel                public.activation_channel         NOT NULL,
  provider               public.activation_provider        NOT NULL,
  placement              text                                  NULL
                            CHECK (placement IS NULL OR char_length(placement) <= 100),
  client_integration_id  uuid                                  NULL
                            REFERENCES public.client_integrations(id) ON DELETE RESTRICT,
  status                 public.activation_target_status   NOT NULL DEFAULT 'pending',
  readiness_checklist    jsonb                             NOT NULL DEFAULT '{}'
                            CHECK (jsonb_typeof(readiness_checklist) = 'object'),
  scheduled_at           timestamptz                           NULL,
  published_at           timestamptz                           NULL,
  published_by           uuid                                  NULL
                            REFERENCES auth.users(id) ON DELETE SET NULL,
  external_reference     text                                  NULL
                            CHECK (external_reference IS NULL OR char_length(external_reference) <= 300),
  failed_at              timestamptz                           NULL,
  failure_code           text                                  NULL
                            CHECK (failure_code IS NULL OR char_length(failure_code) <= 100),
  failure_message        text                                  NULL
                            CHECK (failure_message IS NULL OR char_length(failure_message) <= 500),
  cancelled_at           timestamptz                           NULL,
  cancelled_by           uuid                                  NULL
                            REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata               jsonb                             NOT NULL DEFAULT '{}'
                            CHECK (jsonb_typeof(metadata) = 'object'),
  created_at             timestamptz                       NOT NULL DEFAULT now(),
  updated_at             timestamptz                       NOT NULL DEFAULT now(),
  -- channel/provider deben corresponder (audit §7 — no es una elección libre).
  CONSTRAINT ck_activation_targets_channel_provider CHECK (
    (channel = 'manual'             AND provider = 'manual')  OR
    (channel = 'meta_ads'           AND provider = 'meta')    OR
    (channel = 'instagram_organic'  AND provider = 'meta')    OR
    (channel = 'facebook_organic'   AND provider = 'meta')    OR
    (channel = 'google_ads'         AND provider = 'google')  OR
    (channel = 'linkedin_ads'       AND provider = 'linkedin') OR
    (channel = 'email'              AND provider = 'email')
  ),
  -- manual nunca referencia una integración; cualquier otro canal la requiere
  -- (audit §8/§11 — hoy no hay ningún escritor de client_integrations, así
  -- que en la práctica NINGÚN target no-manual puede crearse hasta 8E/8F,
  -- comportamiento correcto y esperado en 8A.1).
  CONSTRAINT ck_activation_targets_manual_integration CHECK (
    (channel = 'manual' AND client_integration_id IS NULL) OR
    (channel <> 'manual' AND client_integration_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.campaign_activation_targets IS
  'Phase 8A.1 — un canal de distribución dentro de una campaign_activation. '
  'El canal "manual" es de primera clase (mismo modelo, sin '
  'client_integration_id, sin fase "publishing" obligatoria — ver audit §8).';

-- Evita target duplicado por doble click (audit §9).
CREATE UNIQUE INDEX IF NOT EXISTS uq_activation_targets_dedupe
  ON public.campaign_activation_targets(activation_id, channel, provider, COALESCE(placement, ''));

CREATE INDEX IF NOT EXISTS idx_activation_targets_activation
  ON public.campaign_activation_targets(activation_id);
CREATE INDEX IF NOT EXISTS idx_activation_targets_org
  ON public.campaign_activation_targets(organization_id);
CREATE INDEX IF NOT EXISTS idx_activation_targets_status
  ON public.campaign_activation_targets(status);
CREATE INDEX IF NOT EXISTS idx_activation_targets_client_integration
  ON public.campaign_activation_targets(client_integration_id);

-- =============================================================================
-- SECCIÓN D — TABLA: public.campaign_activation_events (append-only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_activation_events (
  id               uuid                              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid                              NOT NULL
                      REFERENCES public.organizations(id) ON DELETE CASCADE,
  activation_id    uuid                              NOT NULL
                      REFERENCES public.campaign_activations(id) ON DELETE CASCADE,
  -- NULL = evento a nivel activation. No-NULL = evento de un target específico.
  target_id        uuid                                  NULL
                      REFERENCES public.campaign_activation_targets(id) ON DELETE CASCADE,
  event_type       public.activation_event_type     NOT NULL,
  actor_user_id    uuid                                  NULL
                      REFERENCES auth.users(id) ON DELETE SET NULL,
  is_system        boolean                           NOT NULL DEFAULT false,
  from_status      text                                  NULL,
  to_status        text                                  NULL,
  note             text                                  NULL
                      CHECK (note IS NULL OR char_length(note) <= 2000),
  metadata         jsonb                             NOT NULL DEFAULT '{}'
                      CHECK (jsonb_typeof(metadata) = 'object'),
  created_at       timestamptz                       NOT NULL DEFAULT now(),
  -- actor_user_id es NULL únicamente cuando is_system = true (evento generado
  -- por un trigger sin auth.uid(), ej. contexto de servicio) — nunca al revés.
  CONSTRAINT ck_activation_events_actor CHECK (
    (is_system = true) OR (actor_user_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.campaign_activation_events IS
  'Phase 8A.1 — audit trail append-only de campaign_activations/targets '
  '(audit §10). Escrito EXCLUSIVAMENTE por triggers/funciones SECURITY '
  'DEFINER — authenticated no tiene ningún GRANT de escritura sobre esta '
  'tabla (ni INSERT, ni UPDATE, ni DELETE). Metadata sanitizada — nunca '
  'secretos, tokens, ni payload crudo de proveedor.';

CREATE INDEX IF NOT EXISTS idx_activation_events_activation_created
  ON public.campaign_activation_events(activation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activation_events_org
  ON public.campaign_activation_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_activation_events_target
  ON public.campaign_activation_events(target_id);

-- =============================================================================
-- SECCIÓN E — TRIGGERS DE INTEGRIDAD, TENENCIA Y AUDITORÍA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- E1. manage_campaign_activation_write()
--
-- BEFORE INSERT OR UPDATE en campaign_activations. Asigna created_by/
-- updated_by desde auth.uid(). Protege campos inmutables: id,
-- organization_id, client_id, campaign_id, campaign_approval_id,
-- approved_snapshot, created_at, created_by. NUNCA protege `status` ni las
-- columnas de timestamp de transición — esas SÍ cambian, pero solo vía las
-- funciones SECURITY DEFINER de esta migración (que, al ejecutarse como el
-- dueño de la tabla, no están sujetas a los GRANT column-level de
-- `authenticated` definidos en la SECCIÓN H).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.manage_campaign_activation_write()
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

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'campaign_activations: id is immutable';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'campaign_activations: organization_id is immutable';
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'campaign_activations: client_id is immutable';
  END IF;
  IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id THEN
    RAISE EXCEPTION 'campaign_activations: campaign_id is immutable';
  END IF;
  IF NEW.campaign_approval_id IS DISTINCT FROM OLD.campaign_approval_id THEN
    RAISE EXCEPTION 'campaign_activations: campaign_approval_id is immutable';
  END IF;
  IF NEW.approved_snapshot IS DISTINCT FROM OLD.approved_snapshot THEN
    RAISE EXCEPTION 'campaign_activations: approved_snapshot is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'campaign_activations: created_at is immutable';
  END IF;
  NEW.created_by := OLD.created_by;

  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.manage_campaign_activation_write() IS
  'BEFORE INSERT OR UPDATE en campaign_activations. Auditoría + protección '
  'de campos inmutables, incluido approved_snapshot (nunca se actualiza).';

-- ---------------------------------------------------------------------------
-- E2. check_activation_source()
--
-- BEFORE INSERT en campaign_activations. Verifica la frontera de aprobación
-- (audit §13/§15) DENTRO de la transacción, no solo en el use case de
-- aplicación:
--   1. La campaña referenciada existe, su organization_id/client_id
--      coinciden con NEW.organization_id/NEW.client_id, y su status es
--      EXACTAMENTE 'approved' en el momento del INSERT.
--   2. La campaign_approval referenciada existe, pertenece a la MISMA
--      campaña, y su action es EXACTAMENTE 'approved' — nunca se acepta un
--      registro de rechazo como origen de una activation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_activation_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_org_id    uuid;
  v_campaign_client_id uuid;
  v_campaign_status    public.campaign_status;
  v_approval_campaign_id uuid;
  v_approval_action    public.campaign_approval_action;
BEGIN
  SELECT organization_id, client_id, status
    INTO v_campaign_org_id, v_campaign_client_id, v_campaign_status
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_activation_source: campaign not found (id: %)', NEW.campaign_id;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_campaign_org_id THEN
    RAISE EXCEPTION
      'check_activation_source: organization_id mismatch (campaign_id: %, expected: %, got: %)',
      NEW.campaign_id, v_campaign_org_id, NEW.organization_id;
  END IF;

  IF NEW.client_id IS DISTINCT FROM v_campaign_client_id THEN
    RAISE EXCEPTION
      'check_activation_source: client_id mismatch (campaign_id: %, expected: %, got: %)',
      NEW.campaign_id, v_campaign_client_id, NEW.client_id;
  END IF;

  IF v_campaign_status <> 'approved' THEN
    RAISE EXCEPTION
      'check_activation_source: campaign % is not approved (current status: %)',
      NEW.campaign_id, v_campaign_status;
  END IF;

  SELECT campaign_id, action
    INTO v_approval_campaign_id, v_approval_action
  FROM public.campaign_approvals
  WHERE id = NEW.campaign_approval_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'check_activation_source: campaign_approval not found (id: %)', NEW.campaign_approval_id;
  END IF;

  IF v_approval_campaign_id IS DISTINCT FROM NEW.campaign_id THEN
    RAISE EXCEPTION
      'check_activation_source: campaign_approval % does not belong to campaign %',
      NEW.campaign_approval_id, NEW.campaign_id;
  END IF;

  IF v_approval_action <> 'approved' THEN
    RAISE EXCEPTION
      'check_activation_source: campaign_approval % is not an approval (action: %)',
      NEW.campaign_approval_id, v_approval_action;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_activation_source() IS
  'BEFORE INSERT en campaign_activations. Impide crear una activation desde '
  'una campaña que no esté approved, o desde un campaign_approval que no sea '
  'una aprobación real de esa misma campaña (nunca un rechazo).';

-- ---------------------------------------------------------------------------
-- E3. activation_created_event()
--
-- AFTER INSERT en campaign_activations. Inserta el evento inicial
-- 'activation_created' de forma atómica — el caller no necesita (ni puede)
-- insertarlo por su cuenta.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activation_created_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.campaign_activation_events
    (organization_id, activation_id, target_id, event_type, actor_user_id, is_system, from_status, to_status)
  VALUES
    (NEW.organization_id, NEW.id, NULL, 'activation_created', NEW.created_by, false, NULL, NEW.status);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- E4. activation_status_changed_event()
--
-- AFTER UPDATE OF status en campaign_activations. Registra cada cambio de
-- status EXCEPTO la transición a 'cancelled' (esa la registra
-- cancel_campaign_activation() con el evento más específico
-- 'activation_cancelled', que incluye la razón — evita un evento genérico
-- duplicado sin contexto para la misma transición).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activation_status_changed_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    INSERT INTO public.campaign_activation_events
      (organization_id, activation_id, target_id, event_type, actor_user_id, is_system, from_status, to_status)
    VALUES
      (NEW.organization_id, NEW.id, NULL, 'activation_status_changed', auth.uid(), auth.uid() IS NULL, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- E5. check_activation_target_match()
--
-- BEFORE INSERT OR UPDATE OF client_id, organization_id, client_integration_id
-- en campaign_activation_targets. Verifica:
--   1. organization_id/client_id de NEW coinciden con los de la activation
--      padre (nunca confiados al caller — audit §11, R-ACT-04).
--   2. Si client_integration_id no es NULL, la client_integration
--      referenciada pertenece al MISMO client_id/organization_id — cierra
--      exactamente la vía de fuga cross-tenant de credenciales descrita en
--      el risk register (R-ACT-04).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_activation_target_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation_org_id    uuid;
  v_activation_client_id uuid;
  v_integration_org_id    uuid;
  v_integration_client_id uuid;
BEGIN
  SELECT organization_id, client_id
    INTO v_activation_org_id, v_activation_client_id
  FROM public.campaign_activations
  WHERE id = NEW.activation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'check_activation_target_match: activation not found (id: %)', NEW.activation_id;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_activation_org_id THEN
    RAISE EXCEPTION
      'check_activation_target_match: organization_id mismatch (activation_id: %, expected: %, got: %)',
      NEW.activation_id, v_activation_org_id, NEW.organization_id;
  END IF;

  IF NEW.client_id IS DISTINCT FROM v_activation_client_id THEN
    RAISE EXCEPTION
      'check_activation_target_match: client_id mismatch (activation_id: %, expected: %, got: %)',
      NEW.activation_id, v_activation_client_id, NEW.client_id;
  END IF;

  IF NEW.client_integration_id IS NOT NULL THEN
    SELECT organization_id, client_id
      INTO v_integration_org_id, v_integration_client_id
    FROM public.client_integrations
    WHERE id = NEW.client_integration_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'check_activation_target_match: client_integration not found (id: %)', NEW.client_integration_id;
    END IF;

    IF v_integration_org_id IS DISTINCT FROM NEW.organization_id
       OR v_integration_client_id IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION
        'check_activation_target_match: client_integration % does not belong to the same org/client',
        NEW.client_integration_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- E6. protect_activation_target_immutable_fields()
--
-- BEFORE UPDATE en campaign_activation_targets. Protege id, activation_id,
-- organization_id, client_id, channel, provider, created_at — cambiar de
-- canal requiere quitar el target y agregar uno nuevo, nunca mutar uno
-- existente (evita reescribir silenciosamente a qué canal apunta un target
-- que ya pudo haber sido publicado).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_activation_target_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'campaign_activation_targets: id is immutable';
  END IF;
  IF NEW.activation_id IS DISTINCT FROM OLD.activation_id THEN
    RAISE EXCEPTION 'campaign_activation_targets: activation_id is immutable';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'campaign_activation_targets: organization_id is immutable';
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'campaign_activation_targets: client_id is immutable';
  END IF;
  IF NEW.channel IS DISTINCT FROM OLD.channel THEN
    RAISE EXCEPTION 'campaign_activation_targets: channel is immutable';
  END IF;
  IF NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'campaign_activation_targets: provider is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'campaign_activation_targets: created_at is immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- E7. target_added_removed_event()
--
-- AFTER INSERT / BEFORE DELETE en campaign_activation_targets. Registra
-- 'target_added'/'target_removed'. BEFORE DELETE (no AFTER) porque tras un
-- AFTER DELETE la fila ya no existe para satisfacer la FK target_id de
-- campaign_activation_events — se registra con target_id NULL y el detalle
-- del canal en metadata en su lugar, para no requerir ON DELETE CASCADE
-- especial ni dejar una FK colgante.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.target_added_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.campaign_activation_events
    (organization_id, activation_id, target_id, event_type, actor_user_id, is_system, to_status, metadata)
  VALUES
    (NEW.organization_id, NEW.activation_id, NEW.id, 'target_added', auth.uid(), auth.uid() IS NULL, NEW.status,
     jsonb_build_object('channel', NEW.channel, 'provider', NEW.provider));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.target_removed_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.campaign_activation_events
    (organization_id, activation_id, target_id, event_type, actor_user_id, is_system, from_status, metadata)
  VALUES
    (OLD.organization_id, OLD.activation_id, NULL, 'target_removed', auth.uid(), auth.uid() IS NULL, OLD.status,
     jsonb_build_object('channel', OLD.channel, 'provider', OLD.provider, 'removed_target_id', OLD.id));
  RETURN OLD;
END;
$$;

-- Solo se permite eliminar un target mientras la activation padre sigue
-- 'pending' — audit §16 (nota de DELETE físico limitado).
CREATE OR REPLACE FUNCTION public.check_activation_target_deletable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation_status public.activation_status;
BEGIN
  SELECT status INTO v_activation_status
  FROM public.campaign_activations
  WHERE id = OLD.activation_id;

  IF v_activation_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION
      'campaign_activation_targets: cannot delete target once the activation left "pending" (activation_id: %, status: %). Use cancel_activation_target instead.',
      OLD.activation_id, v_activation_status;
  END IF;

  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- E8. target_status_changed_event()
--
-- AFTER UPDATE OF status en campaign_activation_targets. Registra cada
-- cambio de status del target (incluye 'cancelled' — a diferencia de la
-- activation, no hay un evento más específico para cancelación de target en
-- 8A.1, así que este SÍ cubre esa transición).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.target_status_changed_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.campaign_activation_events
      (organization_id, activation_id, target_id, event_type, actor_user_id, is_system, from_status, to_status)
    VALUES
      (NEW.organization_id, NEW.activation_id, NEW.id, 'target_status_changed', auth.uid(), auth.uid() IS NULL, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- E9. compute_campaign_activation_status() — espejo SQL de
-- deriveActivationStatus() en packages/domain/src/entities/campaign-activation.ts
-- (audit §6.A). Ver nota de diseño en el encabezado de esta migración.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_campaign_activation_status(p_activation_id uuid)
RETURNS public.activation_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total      int;
  v_pending    int;
  v_ready      int;
  v_scheduled  int;
  v_publishing int;
  v_published  int;
  v_failed     int;
  v_cancelled  int;
  v_nonterminal int;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'ready'),
    count(*) FILTER (WHERE status = 'scheduled'),
    count(*) FILTER (WHERE status = 'publishing'),
    count(*) FILTER (WHERE status = 'published'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status = 'cancelled')
  INTO v_total, v_pending, v_ready, v_scheduled, v_publishing, v_published, v_failed, v_cancelled
  FROM public.campaign_activation_targets
  WHERE activation_id = p_activation_id;

  IF v_total = 0 THEN
    RETURN 'pending';
  END IF;

  IF (v_published + v_failed + v_cancelled) = v_total THEN
    IF v_published > 0 AND v_failed = 0 THEN RETURN 'completed'; END IF;
    IF v_published > 0 AND v_failed > 0 THEN RETURN 'partially_completed'; END IF;
    IF v_published = 0 AND v_failed > 0 THEN RETURN 'failed'; END IF;
    RETURN 'cancelled';
  END IF;

  IF v_publishing > 0 THEN RETURN 'executing'; END IF;
  IF v_scheduled > 0 THEN RETURN 'scheduled'; END IF;
  IF v_pending = v_total THEN RETURN 'pending'; END IF;

  v_nonterminal := v_total - (v_published + v_failed + v_cancelled);
  IF v_nonterminal > 0 AND v_ready = v_nonterminal THEN RETURN 'ready'; END IF;

  RETURN 'preparing';
END;
$$;

COMMENT ON FUNCTION public.compute_campaign_activation_status(uuid) IS
  'Espejo SQL de deriveActivationStatus() (domain). NO invocar directamente '
  'desde el aplicativo — se dispara automáticamente vía '
  'trg_activation_targets_recompute_status.';

-- ---------------------------------------------------------------------------
-- E10. recompute_campaign_activation_status_trigger()
--
-- AFTER INSERT OR UPDATE OF status OR DELETE en campaign_activation_targets.
-- Recalcula y persiste campaign_activations.status, asignando además la
-- primera vez que se alcanza cada hito (prepared_at/ready_at/started_at/
-- completed_at) — nunca sobrescribe un timestamp ya asignado. NO recalcula
-- si la activation ya está 'cancelled' (transición comandada, no derivada —
-- no se reabre por un cambio posterior en un target).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_campaign_activation_status_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation_id uuid;
  v_current_status public.activation_status;
  v_new_status public.activation_status;
BEGIN
  -- NEW/OLD no están ambos "asignados" simultáneamente en un trigger
  -- combinado (INSERT OR UPDATE OR DELETE) — referenciar NEW en una
  -- operación DELETE (o OLD en un INSERT) lanza "record is not assigned
  -- yet" en PL/pgSQL. Se resuelve explícitamente por TG_OP.
  IF TG_OP = 'DELETE' THEN
    v_activation_id := OLD.activation_id;
  ELSE
    v_activation_id := NEW.activation_id;
  END IF;

  SELECT status INTO v_current_status
  FROM public.campaign_activations
  WHERE id = v_activation_id
  FOR UPDATE;

  -- Retorno ignorado por Postgres en triggers AFTER — RETURN NULL es válido
  -- y evita cualquier referencia a NEW/OLD como registro completo (que
  -- tendría el mismo problema de "not assigned" que los campos individuales
  -- en el trigger combinado INSERT/UPDATE/DELETE).
  IF NOT FOUND OR v_current_status = 'cancelled' THEN
    RETURN NULL;
  END IF;

  v_new_status := public.compute_campaign_activation_status(v_activation_id);

  UPDATE public.campaign_activations
  SET
    status       = v_new_status,
    prepared_at  = CASE WHEN prepared_at  IS NULL AND v_new_status IN ('preparing','ready','scheduled','executing','completed','partially_completed','failed') THEN now() ELSE prepared_at  END,
    ready_at     = CASE WHEN ready_at     IS NULL AND v_new_status IN ('ready','scheduled','executing','completed','partially_completed','failed')             THEN now() ELSE ready_at     END,
    started_at   = CASE WHEN started_at   IS NULL AND v_new_status IN ('executing','completed','partially_completed','failed')                                  THEN now() ELSE started_at   END,
    completed_at = CASE WHEN completed_at IS NULL AND v_new_status IN ('completed','partially_completed','failed')                                              THEN now() ELSE completed_at END,
    updated_at   = now()
  WHERE id = v_activation_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.recompute_campaign_activation_status_trigger() IS
  'Recalcula campaign_activations.status tras cualquier cambio en sus '
  'targets. No reabre una activation ya cancelled. Ver compute_campaign_activation_status().';

-- ---------------------------------------------------------------------------
-- Wiring de triggers — campaign_activations
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_campaign_activations_write ON public.campaign_activations;
CREATE TRIGGER trg_campaign_activations_write
  BEFORE INSERT OR UPDATE ON public.campaign_activations
  FOR EACH ROW EXECUTE FUNCTION public.manage_campaign_activation_write();

DROP TRIGGER IF EXISTS trg_campaign_activations_source ON public.campaign_activations;
CREATE TRIGGER trg_campaign_activations_source
  BEFORE INSERT ON public.campaign_activations
  FOR EACH ROW EXECUTE FUNCTION public.check_activation_source();

DROP TRIGGER IF EXISTS trg_campaign_activations_updated_at ON public.campaign_activations;
CREATE TRIGGER trg_campaign_activations_updated_at
  BEFORE UPDATE ON public.campaign_activations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_campaign_activations_created_event ON public.campaign_activations;
CREATE TRIGGER trg_campaign_activations_created_event
  AFTER INSERT ON public.campaign_activations
  FOR EACH ROW EXECUTE FUNCTION public.activation_created_event();

DROP TRIGGER IF EXISTS trg_campaign_activations_status_event ON public.campaign_activations;
CREATE TRIGGER trg_campaign_activations_status_event
  AFTER UPDATE OF status ON public.campaign_activations
  FOR EACH ROW EXECUTE FUNCTION public.activation_status_changed_event();

-- ---------------------------------------------------------------------------
-- Wiring de triggers — campaign_activation_targets
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_activation_targets_match ON public.campaign_activation_targets;
CREATE TRIGGER trg_activation_targets_match
  BEFORE INSERT OR UPDATE OF organization_id, client_id, client_integration_id ON public.campaign_activation_targets
  FOR EACH ROW EXECUTE FUNCTION public.check_activation_target_match();

DROP TRIGGER IF EXISTS trg_activation_targets_immutable ON public.campaign_activation_targets;
CREATE TRIGGER trg_activation_targets_immutable
  BEFORE UPDATE ON public.campaign_activation_targets
  FOR EACH ROW EXECUTE FUNCTION public.protect_activation_target_immutable_fields();

DROP TRIGGER IF EXISTS trg_activation_targets_updated_at ON public.campaign_activation_targets;
CREATE TRIGGER trg_activation_targets_updated_at
  BEFORE UPDATE ON public.campaign_activation_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_activation_targets_deletable ON public.campaign_activation_targets;
CREATE TRIGGER trg_activation_targets_deletable
  BEFORE DELETE ON public.campaign_activation_targets
  FOR EACH ROW EXECUTE FUNCTION public.check_activation_target_deletable();

DROP TRIGGER IF EXISTS trg_activation_targets_added_event ON public.campaign_activation_targets;
CREATE TRIGGER trg_activation_targets_added_event
  AFTER INSERT ON public.campaign_activation_targets
  FOR EACH ROW EXECUTE FUNCTION public.target_added_event();

DROP TRIGGER IF EXISTS trg_activation_targets_removed_event ON public.campaign_activation_targets;
CREATE TRIGGER trg_activation_targets_removed_event
  BEFORE DELETE ON public.campaign_activation_targets
  FOR EACH ROW EXECUTE FUNCTION public.target_removed_event();

DROP TRIGGER IF EXISTS trg_activation_targets_status_event ON public.campaign_activation_targets;
CREATE TRIGGER trg_activation_targets_status_event
  AFTER UPDATE OF status ON public.campaign_activation_targets
  FOR EACH ROW EXECUTE FUNCTION public.target_status_changed_event();

-- IMPORTANTE: este trigger debe correr DESPUÉS de target_status_changed_event
-- para ese mismo evento (orden alfabético de nombre dentro del mismo timing
-- AFTER — Postgres ejecuta triggers AFTER en orden alfabético de nombre;
-- 'trg_activation_targets_recompute_status' > 'trg_activation_targets_status_event'
-- alfabéticamente, así que corre después, correcto).
DROP TRIGGER IF EXISTS trg_activation_targets_recompute_status ON public.campaign_activation_targets;
CREATE TRIGGER trg_activation_targets_recompute_status
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.campaign_activation_targets
  FOR EACH ROW EXECUTE FUNCTION public.recompute_campaign_activation_status_trigger();

-- =============================================================================
-- SECCIÓN F — RPCs SECURITY DEFINER (transiciones críticas — audit §16)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- F1. prepare_activation_target(p_target_id, p_checklist)
-- Transición: pending → preparing. Rol mínimo: operator.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_activation_target(p_target_id uuid, p_checklist jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_org_id uuid;
  v_status public.activation_target_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'prepare_activation_target: authentication required';
  END IF;

  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaign_activation_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prepare_activation_target: target not found (id: %)', p_target_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'operator') THEN
    RAISE EXCEPTION 'prepare_activation_target: actor lacks operator+ role (target_id: %)', p_target_id;
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'prepare_activation_target: target % is not pending (current status: %)', p_target_id, v_status;
  END IF;

  IF p_checklist IS NOT NULL AND jsonb_typeof(p_checklist) <> 'object' THEN
    RAISE EXCEPTION 'prepare_activation_target: checklist must be a JSON object';
  END IF;

  UPDATE public.campaign_activation_targets
  SET status = 'preparing',
      readiness_checklist = COALESCE(p_checklist, readiness_checklist)
  WHERE id = p_target_id;
END;
$$;

COMMENT ON FUNCTION public.prepare_activation_target(uuid, jsonb) IS
  'RPC: pending → preparing en campaign_activation_targets. Rol operator+.';

-- ---------------------------------------------------------------------------
-- F2. mark_activation_target_ready(p_target_id)
-- Transición: preparing → ready. Rol mínimo: operator.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_activation_target_ready(p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_org_id uuid;
  v_status public.activation_target_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'mark_activation_target_ready: authentication required';
  END IF;

  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaign_activation_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_activation_target_ready: target not found (id: %)', p_target_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'operator') THEN
    RAISE EXCEPTION 'mark_activation_target_ready: actor lacks operator+ role (target_id: %)', p_target_id;
  END IF;

  IF v_status <> 'preparing' THEN
    RAISE EXCEPTION 'mark_activation_target_ready: target % is not preparing (current status: %)', p_target_id, v_status;
  END IF;

  UPDATE public.campaign_activation_targets
  SET status = 'ready'
  WHERE id = p_target_id;
END;
$$;

COMMENT ON FUNCTION public.mark_activation_target_ready(uuid) IS
  'RPC: preparing → ready en campaign_activation_targets. Rol operator+.';

-- ---------------------------------------------------------------------------
-- F3. mark_activation_target_published(p_target_id, p_external_reference, p_note)
-- Transición: ready|scheduled → published. Rol mínimo: operator.
-- Cubre tanto el camino manual (ready → published directo) como el futuro
-- automatizado (scheduled → published, sin pasar por 'publishing' aquí —
-- el estado 'publishing' en 8A.1 solo se alcanza si un futuro adapter de
-- 8B lo setea explícitamente; esta RPC no lo requiere como paso intermedio).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_activation_target_published(
  p_target_id uuid,
  p_external_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_org_id uuid;
  v_status public.activation_target_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'mark_activation_target_published: authentication required';
  END IF;

  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaign_activation_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_activation_target_published: target not found (id: %)', p_target_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'operator') THEN
    RAISE EXCEPTION 'mark_activation_target_published: actor lacks operator+ role (target_id: %)', p_target_id;
  END IF;

  IF v_status NOT IN ('ready', 'scheduled') THEN
    RAISE EXCEPTION
      'mark_activation_target_published: target % is not ready/scheduled (current status: %)',
      p_target_id, v_status;
  END IF;

  IF p_external_reference IS NOT NULL AND char_length(p_external_reference) > 300 THEN
    RAISE EXCEPTION 'mark_activation_target_published: external_reference exceeds 300 chars';
  END IF;

  UPDATE public.campaign_activation_targets
  SET status              = 'published',
      published_at        = now(),
      published_by        = v_actor,
      external_reference  = COALESCE(p_external_reference, external_reference)
  WHERE id = p_target_id;

  IF p_note IS NOT NULL AND char_length(trim(p_note)) > 0 THEN
    UPDATE public.campaign_activation_targets
    SET metadata = metadata || jsonb_build_object('publicationNote', left(p_note, 2000))
    WHERE id = p_target_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.mark_activation_target_published(uuid, text, text) IS
  'RPC: ready|scheduled → published en campaign_activation_targets. Rol '
  'operator+. Camino manual de primera clase (audit §8) — external_reference '
  'y note son opcionales, nunca credenciales.';

-- ---------------------------------------------------------------------------
-- F4. cancel_activation_target(p_target_id, p_reason)
-- Transición: cualquier no-terminal → cancelled. Rol mínimo: strategist.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_activation_target(p_target_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_org_id uuid;
  v_status public.activation_target_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'cancel_activation_target: authentication required';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'cancel_activation_target: reason is required';
  END IF;

  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaign_activation_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_activation_target: target not found (id: %)', p_target_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'strategist') THEN
    RAISE EXCEPTION 'cancel_activation_target: actor lacks strategist+ role (target_id: %)', p_target_id;
  END IF;

  IF v_status IN ('published', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'cancel_activation_target: target % is already terminal (status: %)', p_target_id, v_status;
  END IF;

  IF v_status = 'publishing' THEN
    RAISE EXCEPTION 'cancel_activation_target: cannot cancel target % while publishing', p_target_id;
  END IF;

  UPDATE public.campaign_activation_targets
  SET status       = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      metadata     = metadata || jsonb_build_object('cancellationReason', left(p_reason, 2000))
  WHERE id = p_target_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_activation_target(uuid, text) IS
  'RPC: cancela un target individual (no published/failed/cancelled/publishing). Rol strategist+.';

-- ---------------------------------------------------------------------------
-- F5. cancel_campaign_activation(p_activation_id, p_reason)
-- Transición: activation no-terminal → cancelled, cascada a targets
-- no-terminales. Rol mínimo: strategist.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_campaign_activation(p_activation_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_org_id uuid;
  v_status public.activation_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'cancel_campaign_activation: authentication required';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'cancel_campaign_activation: reason is required';
  END IF;

  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaign_activations
  WHERE id = p_activation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_campaign_activation: activation not found (id: %)', p_activation_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'strategist') THEN
    RAISE EXCEPTION 'cancel_campaign_activation: actor lacks strategist+ role (activation_id: %)', p_activation_id;
  END IF;

  IF v_status IN ('completed', 'partially_completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'cancel_campaign_activation: activation % is already terminal (status: %)', p_activation_id, v_status;
  END IF;

  IF v_status = 'executing' THEN
    RAISE EXCEPTION 'cancel_campaign_activation: cannot cancel activation % while executing (8A.1 scope)', p_activation_id;
  END IF;

  -- Cascada: cancela los targets no-terminales (evento target_status_changed
  -- se dispara automáticamente por cada uno vía su propio trigger).
  UPDATE public.campaign_activation_targets
  SET status       = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor
  WHERE activation_id = p_activation_id
    AND status NOT IN ('published', 'failed', 'cancelled');

  UPDATE public.campaign_activations
  SET status              = 'cancelled',
      cancelled_at        = now(),
      cancelled_by        = v_actor,
      cancellation_reason = p_reason
  WHERE id = p_activation_id;

  INSERT INTO public.campaign_activation_events
    (organization_id, activation_id, target_id, event_type, actor_user_id, is_system, from_status, to_status, note)
  VALUES
    (v_org_id, p_activation_id, NULL, 'activation_cancelled', v_actor, false, v_status, 'cancelled', p_reason);
END;
$$;

COMMENT ON FUNCTION public.cancel_campaign_activation(uuid, text) IS
  'RPC: cancela la activation (no completed/partially_completed/failed/'
  'cancelled/executing) y en cascada sus targets no-terminales. Rol strategist+.';

-- ---------------------------------------------------------------------------
-- Grants de las RPCs — mismo criterio que 20260816140000 (REVOKE ALL antes
-- de GRANT explícito, revoke redundante de anon, sin grant a service_role).
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.prepare_activation_target(uuid, jsonb)              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_activation_target_ready(uuid)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_activation_target_published(uuid, text, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_activation_target(uuid, text)                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_campaign_activation(uuid, text)              FROM PUBLIC;

REVOKE ALL ON FUNCTION public.prepare_activation_target(uuid, jsonb)              FROM anon;
REVOKE ALL ON FUNCTION public.mark_activation_target_ready(uuid)                  FROM anon;
REVOKE ALL ON FUNCTION public.mark_activation_target_published(uuid, text, text)  FROM anon;
REVOKE ALL ON FUNCTION public.cancel_activation_target(uuid, text)                FROM anon;
REVOKE ALL ON FUNCTION public.cancel_campaign_activation(uuid, text)              FROM anon;

GRANT EXECUTE ON FUNCTION public.prepare_activation_target(uuid, jsonb)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_activation_target_ready(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_activation_target_published(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_activation_target(uuid, text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_campaign_activation(uuid, text)             TO authenticated;

-- =============================================================================
-- SECCIÓN G — GRANTS de tabla (column-level donde aplica — ver nota de diseño)
-- =============================================================================

REVOKE ALL ON public.campaign_activations         FROM anon, authenticated;
REVOKE ALL ON public.campaign_activation_targets   FROM anon, authenticated;
REVOKE ALL ON public.campaign_activation_events    FROM anon, authenticated;

-- campaign_activations: SELECT completo; INSERT completo (columnas iniciales,
-- protegidas por trigger); UPDATE SOLO de columnas no-críticas. Sin DELETE
-- (lifecycle vía cancel, nunca borrado físico).
GRANT SELECT, INSERT ON public.campaign_activations TO authenticated;
GRANT UPDATE (notes, metadata) ON public.campaign_activations TO authenticated;

-- campaign_activation_targets: SELECT completo; INSERT completo; UPDATE solo
-- de readiness_checklist/metadata; DELETE permitido (acotado por RLS +
-- trigger check_activation_target_deletable a mientras la activation es
-- 'pending').
GRANT SELECT, INSERT, DELETE ON public.campaign_activation_targets TO authenticated;
GRANT UPDATE (readiness_checklist, metadata) ON public.campaign_activation_targets TO authenticated;

-- campaign_activation_events: SOLO SELECT. Ningún INSERT/UPDATE/DELETE para
-- authenticated bajo ninguna circunstancia — append-only real, escrito
-- exclusivamente por triggers SECURITY DEFINER.
GRANT SELECT ON public.campaign_activation_events TO authenticated;

-- =============================================================================
-- SECCIÓN H — ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.campaign_activations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_activation_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_activation_events  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS: campaign_activations
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS campaign_activations_select ON public.campaign_activations;
CREATE POLICY campaign_activations_select ON public.campaign_activations FOR SELECT TO authenticated
  USING (public.is_organization_member(campaign_activations.organization_id));

-- INSERT: rol strategist+ (audit §12). El trigger trg_campaign_activations_source
-- ya impide crear desde una campaña no-approved o un approval que no le
-- pertenezca — esta policy añade la capa de rol + el status inicial fijo.
DROP POLICY IF EXISTS campaign_activations_insert ON public.campaign_activations;
CREATE POLICY campaign_activations_insert ON public.campaign_activations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_organization_role(campaign_activations.organization_id, 'strategist')
    AND campaign_activations.status = 'pending'
  );

-- UPDATE: rol strategist+, solo mientras la activation no está en un estado
-- terminal. La columna realmente alcanzable está further acotada por el
-- GRANT column-level de la SECCIÓN G (solo notes/metadata).
DROP POLICY IF EXISTS campaign_activations_update ON public.campaign_activations;
CREATE POLICY campaign_activations_update ON public.campaign_activations FOR UPDATE TO authenticated
  USING (
    public.has_organization_role(campaign_activations.organization_id, 'strategist')
    AND campaign_activations.status NOT IN ('completed', 'partially_completed', 'failed', 'cancelled')
  )
  WITH CHECK (
    public.has_organization_role(campaign_activations.organization_id, 'strategist')
  );

-- Sin policy de DELETE: sin GRANT DELETE, cualquier intento es rechazado
-- antes de evaluar RLS — lifecycle vía cancel_campaign_activation, nunca
-- borrado físico.

-- ---------------------------------------------------------------------------
-- RLS: campaign_activation_targets
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS campaign_activation_targets_select ON public.campaign_activation_targets;
CREATE POLICY campaign_activation_targets_select ON public.campaign_activation_targets FOR SELECT TO authenticated
  USING (public.is_organization_member(campaign_activation_targets.organization_id));

-- INSERT: rol strategist+, solo mientras la activation padre no está en
-- estado terminal (evita agregar canales a una activation ya cerrada).
DROP POLICY IF EXISTS campaign_activation_targets_insert ON public.campaign_activation_targets;
CREATE POLICY campaign_activation_targets_insert ON public.campaign_activation_targets FOR INSERT TO authenticated
  WITH CHECK (
    public.has_organization_role(campaign_activation_targets.organization_id, 'strategist')
    AND campaign_activation_targets.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.campaign_activations a
      WHERE a.id = campaign_activation_targets.activation_id
        AND a.organization_id = campaign_activation_targets.organization_id
        AND a.status NOT IN ('completed', 'partially_completed', 'failed', 'cancelled')
    )
  );

-- UPDATE: rol operator+ para readiness_checklist/metadata (columnas
-- acotadas por GRANT — ver SECCIÓN G). Las transiciones de status van
-- exclusivamente por las RPCs de la SECCIÓN F.
DROP POLICY IF EXISTS campaign_activation_targets_update ON public.campaign_activation_targets;
CREATE POLICY campaign_activation_targets_update ON public.campaign_activation_targets FOR UPDATE TO authenticated
  USING (public.has_organization_role(campaign_activation_targets.organization_id, 'operator'))
  WITH CHECK (public.has_organization_role(campaign_activation_targets.organization_id, 'operator'));

-- DELETE: rol strategist+; el trigger check_activation_target_deletable
-- exige además que la activation padre siga 'pending'.
DROP POLICY IF EXISTS campaign_activation_targets_delete ON public.campaign_activation_targets;
CREATE POLICY campaign_activation_targets_delete ON public.campaign_activation_targets FOR DELETE TO authenticated
  USING (public.has_organization_role(campaign_activation_targets.organization_id, 'strategist'));

-- ---------------------------------------------------------------------------
-- RLS: campaign_activation_events (append-only real)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS campaign_activation_events_select ON public.campaign_activation_events;
CREATE POLICY campaign_activation_events_select ON public.campaign_activation_events FOR SELECT TO authenticated
  USING (public.is_organization_member(campaign_activation_events.organization_id));

-- Sin policy de INSERT/UPDATE/DELETE: sin GRANT alguno más allá de SELECT
-- (SECCIÓN G) — cualquier intento directo de authenticated es rechazado
-- antes de evaluar RLS. Las únicas escrituras posibles son las de los
-- triggers SECURITY DEFINER (E3/E4/E7/E8) y la RPC cancel_campaign_activation
-- (F5), que corren con los privilegios del dueño de la tabla.

-- =============================================================================
-- FIN DE MIGRACIÓN
-- Aplicar manualmente en: Supabase Dashboard → SQL Editor → Run (o local vía
-- psql/docker). NO ejecutada contra Supabase remoto/producción/local como
-- parte de esta tarea — este puente no tiene supabase/docker/psql
-- disponibles (ver PHASE_8A1_ACTIVATION_DOMAIN_PERSISTENCE_REPORT.md).
-- =============================================================================
