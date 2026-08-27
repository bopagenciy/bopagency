-- =============================================================================
-- BopIAgency -- Migracion Phase 8B.1: Publication Domain + Persistence
-- Archivo: 20260825120000_phase8b1_publication_domain_persistence.sql
-- Rama: feat/phase-8-campaign-operations
-- Requiere: 20260824180000 (campaign_activations, campaign_activation_targets,
--           campaign_activation_events, has_organization_role,
--           is_organization_member) aplicada.
--
-- ACCION MANUAL: Aplicar en Supabase Dashboard -> SQL Editor -> Run, o
-- localmente via psql/docker contra supabase_db_BopIAgency. Este puente NO
-- tiene supabase/docker/psql disponibles (mismo bloqueo que 8A.1) -- NO se
-- aplico localmente como parte de esta tarea. Ver
-- docs/implementation/phase-8/PHASE_8B1_PUBLICATION_DOMAIN_PERSISTENCE_REPORT.md
-- seccion "Local Supabase validation" para el detalle de la revision estatica
-- realizada en su lugar.
--
-- ALCANCE (Phase 8B.1 -- SOLO dominio + persistencia, ver audit S16):
--   * Crea 4 tablas: campaign_publication_jobs, campaign_publication_attempts,
--     campaign_publication_events, campaign_publication_webhook_events
--     (audit docs/implementation/phase-8/PHASE_8B_PUBLISHING_GATEWAY_AUDIT.md
--     S3/S15).
--   * Crea 2 transiciones nuevas de campaign_activation_targets
--     (mark_activation_target_publishing, mark_activation_target_failed) --
--     NO modifica el state machine ya cerrado de 8A.1 (publishing/failed ya
--     existian en el enum y en ACTIVATION_TARGET_TRANSITIONS, sin caller
--     hasta ahora -- audit S1.1).
--   * Crea 12 RPCs SECURITY DEFINER nuevas (SECCION F) para el ciclo de vida
--     del job de publicacion + recepcion de webhook.
--   * NO implementa ningun ChannelPublisherPort, ningun adapter de proveedor
--     real, ningun endpoint HTTP de webhook (la tabla de dedupe se crea, la
--     ruta HTTP no -- diferida a 8B.3).
--   * NO cambia el state machine de CampaignActivation/CampaignActivationTarget
--     ya cerrado en 8A.1 -- solo AGREGA 2 transiciones que el propio 8A.1 ya
--     habia reservado en el enum/grafo.
--   * NO publica campanas a Meta/Google/LinkedIn.
--   * NO crea ningun acoplamiento a n8n (dominio/DB permanecen autoritativos).
--
-- DISENO -- job vs attempt (audit S3.1): un target automatizado tiene como
-- maximo UN job no-terminal a la vez (constraint UNIQUE parcial); un job
-- puede tener 1..N attempts (rate limit, timeout, retry manual) -- cada
-- attempt es un hecho historico inmutable, nunca sobrescrito (mismo criterio
-- que AutomationExecution retry = fila nueva).
--
-- DISENO -- unknown_outcome (CRITICO, audit S4.1/S11): estado NO terminal,
-- separado de `failed`. Ningun codigo/RPC de esta migracion permite
-- reinterpretar `unknown_outcome` como `failed` sin pasar por
-- `reconcile_publication_job` (strategist+, ver locked decision #1). Ninguna
-- RPC reintenta automaticamente un job en `unknown_outcome`.
--
-- DISENO -- autorizacion por capa de RPC (defensa en profundidad, audit S15.2):
--   * create_publication_job / cancel_publication_job / reconcile_publication_job:
--     GRANT a `authenticated`, gate de rol via has_organization_role() dentro
--     de la funcion (auth.uid() obligatorio, derivado -- NUNCA aceptado del
--     caller).
--   * claim_publication_job / start_publication_job / record_publication_attempt /
--     mark_publication_job_succeeded / _failed / _unknown_outcome /
--     mark_activation_target_publishing / mark_activation_target_failed /
--     append_publication_event / record_publication_webhook_receipt /
--     mark_webhook_event_processed: GRANT SOLO a `service_role` -- estas
--     transiciones son invocadas por el futuro worker/gateway (8B.3) o por el
--     callback de webhook ya-HMAC-verificado, NUNCA por un flujo de usuario
--     normal (cierra explicitamente "service_role no debe ser requerido por
--     flujos normales de la app" -- los flujos normales de usuario usan las
--     RPCs `authenticated` de arriba).
--
-- DISENO -- idempotencia (audit S5): `campaign_publication_jobs.idempotency_key`
-- formato `publish:{organizationId}:{targetId}:{retryCount}`, UNIQUE
-- (organization_id, idempotency_key) + UNIQUE (target_id) WHERE status NOT IN
-- terminal (protege doble-click/retry de red/creacion concurrente).
-- `campaign_publication_attempts.idempotency_key` UNIQUE (job_id,
-- idempotency_key) (protege doble ejecucion de worker dentro del mismo job).
-- `campaign_publication_webhook_events` UNIQUE (provider, external_event_id)
-- (protege replay de webhook).
--
-- DISENO -- tenant consistency (audit S15.2, mismo mecanismo que cerro
-- R-ACT-04 en 8A.1): organization_id/client_id/activation_id denormalizados
-- en las 4 tablas nuevas, verificados por trigger contra el target/job padre
-- REAL en cada INSERT -- nunca confiados al caller.
--
-- DESVIACION DOCUMENTADA vs audit S15.2: el audit enumera
-- "claim_publication_job, record_publication_attempt,
-- mark_publication_job_succeeded/_failed/_unknown_outcome" sin mencionar
-- explicitamente una RPC `start_publication_job` separada de `claim`. Esta
-- migracion SI la agrega, porque el propio grafo de estados del audit (S4.1)
-- distingue `claimed` (el worker tomo posesion) de `in_progress` (ya se hizo
-- la llamada HTTP) como dos estados DISTINTOS y ese es precisamente el punto
-- en que el target debe transicionar a `publishing` (S4.3 punto 4) y se debe
-- computar `reconciliation_deadline_at` (S13.3) -- sin una RPC separada, esa
-- logica tendria que vivir en `claim` (mezclando "tomar posesion" con "ya
-- llame al proveedor", justo la ambiguedad que S4.1 dice que `claimed` existe
-- para evitar) o en `record_publication_attempt` (que puede invocarse mas de
-- una vez por job en reintentos dentro del mismo job -- no es el lugar
-- correcto para una transicion de job que solo debe ocurrir una vez).
-- =============================================================================

-- =============================================================================
-- SECCION A -- ENUMS (idempotentes)
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'publication_job_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.publication_job_status AS ENUM (
      'queued', 'claimed', 'in_progress', 'succeeded', 'failed', 'cancelled', 'unknown_outcome'
    );
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'publication_attempt_outcome' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.publication_attempt_outcome AS ENUM ('confirmed', 'unknown');
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'publication_webhook_event_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.publication_webhook_event_status AS ENUM ('received', 'processed', 'failed');
  END IF;
END; $$;

-- Nota: NO se crea un enum `publication_provider` nuevo -- reutiliza
-- `public.activation_provider` (8A.1) tal cual, excluyendo 'manual' por
-- CHECK (audit S1.1 confirmado: "8B no inventa un nuevo enum de proveedor").

-- Listas cerradas via CHECK (no ENUM) -- mismo criterio que `event_type` en
-- campaign_activation_events (audit S15.1: "enum vivo en dominio, CHECK
-- contra lista fija en DB"). Mantener sincronizado con
-- packages/shared/src/constants/publication.ts.

-- =============================================================================
-- SECCION B -- TABLA: public.campaign_publication_jobs
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_publication_jobs (
  id                            uuid                              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id               uuid                              NOT NULL
                                   REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id                     uuid                              NOT NULL
                                   REFERENCES public.clients(id) ON DELETE RESTRICT,
  activation_id                 uuid                              NOT NULL
                                   REFERENCES public.campaign_activations(id) ON DELETE RESTRICT,
  target_id                     uuid                              NOT NULL
                                   REFERENCES public.campaign_activation_targets(id) ON DELETE RESTRICT,
  channel                       public.activation_channel         NOT NULL,
  provider                      public.activation_provider        NOT NULL,
  client_integration_id         uuid                                  NULL
                                   REFERENCES public.client_integrations(id) ON DELETE RESTRICT,
  status                        public.publication_job_status     NOT NULL DEFAULT 'queued',
  idempotency_key               text                              NOT NULL
                                   CHECK (char_length(idempotency_key) <= 300),
  retry_of_job_id               uuid                                  NULL
                                   REFERENCES public.campaign_publication_jobs(id) ON DELETE SET NULL,
  retry_count                   integer                           NOT NULL DEFAULT 0
                                   CHECK (retry_count >= 0),
  claimed_at                    timestamptz                           NULL,
  claimed_by_worker             text                                  NULL
                                   CHECK (claimed_by_worker IS NULL OR char_length(claimed_by_worker) <= 200),
  started_at                    timestamptz                           NULL,
  completed_at                  timestamptz                           NULL,
  reconciliation_deadline_at    timestamptz                           NULL,
  cancellation_requested_at     timestamptz                           NULL,
  cancellation_requested_by     uuid                                  NULL
                                   REFERENCES auth.users(id) ON DELETE SET NULL,
  failure_category              text                                  NULL
                                   CHECK (failure_category IS NULL OR failure_category IN (
                                     'ACTIVATION_NOT_READY', 'CHANNEL_NOT_CONFIGURED',
                                     'INTEGRATION_NOT_AVAILABLE', 'AUTH_EXPIRED', 'RATE_LIMITED',
                                     'PROVIDER_REJECTED', 'PUBLISHING_TIMEOUT', 'INVALID_ASSET',
                                     'BUDGET_INVALID', 'DISPATCH_FAILED', 'UNKNOWN_OUTCOME',
                                     'PROVIDER_OUTAGE', 'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED'
                                   )),
  reconciled_by                 uuid                                  NULL
                                   REFERENCES auth.users(id) ON DELETE SET NULL,
  reconciled_at                 timestamptz                           NULL,
  reconciliation_note           text                                  NULL
                                   CHECK (reconciliation_note IS NULL OR char_length(reconciliation_note) <= 2000),
  metadata                      jsonb                             NOT NULL DEFAULT '{}'
                                   CHECK (jsonb_typeof(metadata) = 'object'),
  created_by                    uuid                              NOT NULL
                                   REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at                    timestamptz                       NOT NULL DEFAULT now(),
  updated_at                    timestamptz                       NOT NULL DEFAULT now(),
  -- Nunca un target 'manual' obtiene un job de publicacion (audit S9 --
  -- camino manual de primera clase, no pasa por esta tabla).
  CONSTRAINT ck_publication_jobs_provider_not_manual CHECK (provider <> 'manual'),
  -- reconciled_* solo poblado cuando el job salio de unknown_outcome por accion humana.
  CONSTRAINT ck_publication_jobs_reconciliation_fields CHECK (
    (reconciled_at IS NULL AND reconciled_by IS NULL AND reconciliation_note IS NULL)
    OR (reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL)
  )
);

COMMENT ON TABLE public.campaign_publication_jobs IS
  'Phase 8B.1 -- una intencion de ejecutar publish para un '
  'campaign_activation_target automatizado (provider <> manual). Maximo un '
  'job no-terminal por target (indice unico parcial). unknown_outcome NO es '
  'terminal -- requiere reconcile_publication_job. Ver '
  'docs/implementation/phase-8/PHASE_8B_PUBLISHING_GATEWAY_AUDIT.md.';

-- Un target no puede tener dos jobs activos a la vez (audit S4.6/S5.3).
CREATE UNIQUE INDEX IF NOT EXISTS uq_publication_jobs_active_per_target
  ON public.campaign_publication_jobs(target_id)
  WHERE status NOT IN ('succeeded', 'failed', 'cancelled');

-- Defensa adicional de idempotencia a nivel organizacion (audit S5.2/S5.3).
CREATE UNIQUE INDEX IF NOT EXISTS uq_publication_jobs_org_idempotency_key
  ON public.campaign_publication_jobs(organization_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_publication_jobs_org
  ON public.campaign_publication_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_activation
  ON public.campaign_publication_jobs(activation_id);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_target
  ON public.campaign_publication_jobs(target_id);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_status
  ON public.campaign_publication_jobs(status);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_retry_of
  ON public.campaign_publication_jobs(retry_of_job_id);
-- Soporte de la reconciliacion periodica (futura, 8B.3) sobre jobs vencidos.
CREATE INDEX IF NOT EXISTS idx_publication_jobs_in_progress_deadline
  ON public.campaign_publication_jobs(reconciliation_deadline_at)
  WHERE status = 'in_progress';

-- =============================================================================
-- SECCION C -- TABLA: public.campaign_publication_attempts (append-only real)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_publication_attempts (
  id                 uuid                                  PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid                                  NOT NULL
                        REFERENCES public.campaign_publication_jobs(id) ON DELETE CASCADE,
  organization_id    uuid                                  NOT NULL
                        REFERENCES public.organizations(id) ON DELETE CASCADE,
  attempt_number     integer                               NOT NULL
                        CHECK (attempt_number >= 1),
  idempotency_key    text                                  NOT NULL
                        CHECK (char_length(idempotency_key) <= 300),
  external_id        text                                      NULL
                        CHECK (external_id IS NULL OR char_length(external_id) <= 300),
  external_url       text                                      NULL
                        CHECK (external_url IS NULL OR char_length(external_url) <= 2000),
  provider_status    text                                      NULL
                        CHECK (provider_status IS NULL OR char_length(provider_status) <= 200),
  -- SANITIZADO antes de escribir por la capa de aplicacion/RPC -- nunca el
  -- error object crudo del proveedor (puede contener tokens/headers).
  provider_error_code text                                     NULL
                        CHECK (provider_error_code IS NULL OR char_length(provider_error_code) <= 200),
  http_status        integer                                   NULL,
  outcome            public.publication_attempt_outcome           NULL,
  duration_ms        integer                                      NULL
                        CHECK (duration_ms IS NULL OR duration_ms >= 0),
  started_at         timestamptz                           NOT NULL DEFAULT now(),
  completed_at       timestamptz                               NULL,
  created_at         timestamptz                           NOT NULL DEFAULT now(),
  CONSTRAINT ck_publication_attempts_completion CHECK (
    (completed_at IS NULL AND outcome IS NULL)
    OR (completed_at IS NOT NULL AND outcome IS NOT NULL)
  )
);

COMMENT ON TABLE public.campaign_publication_attempts IS
  'Phase 8B.1 -- una llamada concreta al proveedor dentro de un job. '
  'Append-only real (sin updated_at) -- un attempt completado es un hecho '
  'historico inmutable. outcome=unknown es el caso central de '
  'unknown_outcome a nivel job (timeout sin confirmacion).';

-- Protege doble-submit dentro del mismo job (audit S5.3).
CREATE UNIQUE INDEX IF NOT EXISTS uq_publication_attempts_job_idempotency
  ON public.campaign_publication_attempts(job_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_publication_attempts_job
  ON public.campaign_publication_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_publication_attempts_org
  ON public.campaign_publication_attempts(organization_id);
CREATE INDEX IF NOT EXISTS idx_publication_attempts_external_id
  ON public.campaign_publication_attempts(external_id);

-- =============================================================================
-- SECCION D -- TABLA: public.campaign_publication_events (append-only real)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_publication_events (
  id               uuid                              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid                              NOT NULL
                      REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id           uuid                              NOT NULL
                      REFERENCES public.campaign_publication_jobs(id) ON DELETE CASCADE,
  attempt_id       uuid                                  NULL
                      REFERENCES public.campaign_publication_attempts(id) ON DELETE SET NULL,
  event_type       text                              NOT NULL
                      CHECK (event_type IN (
                        'job_queued', 'job_claimed', 'job_started', 'job_succeeded',
                        'job_failed', 'job_cancelled', 'job_marked_unknown_outcome',
                        'job_reconciled', 'webhook_received'
                      )),
  actor_user_id    uuid                                  NULL
                      REFERENCES auth.users(id) ON DELETE SET NULL,
  is_system        boolean                           NOT NULL DEFAULT false,
  note             text                                  NULL
                      CHECK (note IS NULL OR char_length(note) <= 2000),
  metadata         jsonb                             NOT NULL DEFAULT '{}'
                      CHECK (jsonb_typeof(metadata) = 'object'),
  created_at       timestamptz                       NOT NULL DEFAULT now(),
  CONSTRAINT ck_publication_events_actor CHECK (
    (is_system = true) OR (actor_user_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.campaign_publication_events IS
  'Phase 8B.1 -- audit trail append-only de campaign_publication_jobs/'
  'attempts, SEPARADO de campaign_activation_events (audit S3.2 -- volumen/'
  'ruido y owner de escritura distintos). Escrito EXCLUSIVAMENTE por RPCs '
  'SECURITY DEFINER -- authenticated no tiene ningun GRANT de escritura '
  'sobre esta tabla. Metadata sanitizada -- nunca secretos/tokens/payload '
  'crudo de proveedor.';

CREATE INDEX IF NOT EXISTS idx_publication_events_job_created
  ON public.campaign_publication_events(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publication_events_org
  ON public.campaign_publication_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_publication_events_attempt
  ON public.campaign_publication_events(attempt_id);

-- =============================================================================
-- SECCION E -- TABLA: public.campaign_publication_webhook_events
-- Generaliza automation_webhook_events (Phase 6B) -- fundamento de recepcion,
-- SIN endpoint HTTP todavia (diferido a 8B.3, ver kickoff decision #4).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_publication_webhook_events (
  id                 uuid                                       PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: puede no resolverse hasta despues de la verificacion de firma/
  -- dedupe (mismo criterio que automation_webhook_events).
  organization_id    uuid                                           NULL
                        REFERENCES public.organizations(id) ON DELETE SET NULL,
  provider           public.activation_provider                 NOT NULL,
  -- NOT NULL para publishing (a diferencia de automation_webhook_events) --
  -- audit S5.3: todo proveedor real de publishing relevante entrega un event id.
  external_event_id  text                                       NOT NULL
                        CHECK (char_length(external_event_id) <= 300),
  -- SHA-256 hex del raw body -- NUNCA el body en si (ni siquiera sanitizado).
  payload_hash       text                                       NOT NULL
                        CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status             public.publication_webhook_event_status    NOT NULL DEFAULT 'received',
  job_id             uuid                                           NULL
                        REFERENCES public.campaign_publication_jobs(id) ON DELETE SET NULL,
  attempt_id         uuid                                           NULL
                        REFERENCES public.campaign_publication_attempts(id) ON DELETE SET NULL,
  error_code         text                                           NULL
                        CHECK (error_code IS NULL OR char_length(error_code) <= 200),
  received_at        timestamptz                                NOT NULL DEFAULT now(),
  processed_at       timestamptz                                    NULL,
  created_at         timestamptz                                NOT NULL DEFAULT now(),
  CONSTRAINT ck_publication_webhook_events_provider_not_manual CHECK (provider <> 'manual')
);

COMMENT ON TABLE public.campaign_publication_webhook_events IS
  'Phase 8B.1 -- fundamento de deduplicacion/replay-protection para '
  'notificaciones inbound de proveedor (Meta/Google/etc). NINGUN endpoint '
  'HTTP la escribe todavia -- solo las RPCs de esta migracion, para que 8B.3 '
  'consuma esta base sin migracion adicional. NUNCA almacena el payload '
  'crudo ni ninguna credencial/token de proveedor.';

-- Dedupe de replay (audit S5.1/S5.3/S13.1) -- la garantia central de esta tabla.
CREATE UNIQUE INDEX IF NOT EXISTS uq_publication_webhook_events_provider_external_id
  ON public.campaign_publication_webhook_events(provider, external_event_id);

CREATE INDEX IF NOT EXISTS idx_publication_webhook_events_job
  ON public.campaign_publication_webhook_events(job_id);
CREATE INDEX IF NOT EXISTS idx_publication_webhook_events_status
  ON public.campaign_publication_webhook_events(status);

-- =============================================================================
-- SECCION F -- TRIGGERS DE INTEGRIDAD Y TENENCIA (defensa en profundidad,
-- mismo mecanismo exacto que check_activation_target_match en 8A.1 -- audit
-- S15.2 "organization_id denormalizado ... verificado por trigger contra el
-- target/job padre real en cada INSERT -- nunca confiado al caller").
-- =============================================================================

-- ---------------------------------------------------------------------------
-- F1. check_publication_job_target_match()
-- BEFORE INSERT en campaign_publication_jobs. Verifica que
-- organization_id/client_id/activation_id/channel/provider/
-- client_integration_id coincidan EXACTAMENTE con el target padre real, y
-- que el target no sea 'manual'.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_publication_job_target_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_org_id            uuid;
  v_target_client_id         uuid;
  v_target_activation_id     uuid;
  v_target_channel           public.activation_channel;
  v_target_provider          public.activation_provider;
  v_target_client_integration uuid;
BEGIN
  SELECT organization_id, client_id, activation_id, channel, provider, client_integration_id
    INTO v_target_org_id, v_target_client_id, v_target_activation_id, v_target_channel,
         v_target_provider, v_target_client_integration
  FROM public.campaign_activation_targets
  WHERE id = NEW.target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_publication_job_target_match: target not found (id: %)', NEW.target_id;
  END IF;

  IF v_target_provider = 'manual' THEN
    RAISE EXCEPTION 'check_publication_job_target_match: target % is manual (no publication job allowed)', NEW.target_id;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_target_org_id THEN
    RAISE EXCEPTION 'check_publication_job_target_match: organization_id mismatch (target_id: %, expected: %, got: %)',
      NEW.target_id, v_target_org_id, NEW.organization_id;
  END IF;

  IF NEW.client_id IS DISTINCT FROM v_target_client_id THEN
    RAISE EXCEPTION 'check_publication_job_target_match: client_id mismatch (target_id: %, expected: %, got: %)',
      NEW.target_id, v_target_client_id, NEW.client_id;
  END IF;

  IF NEW.activation_id IS DISTINCT FROM v_target_activation_id THEN
    RAISE EXCEPTION 'check_publication_job_target_match: activation_id mismatch (target_id: %, expected: %, got: %)',
      NEW.target_id, v_target_activation_id, NEW.activation_id;
  END IF;

  IF NEW.channel IS DISTINCT FROM v_target_channel THEN
    RAISE EXCEPTION 'check_publication_job_target_match: channel mismatch (target_id: %, expected: %, got: %)',
      NEW.target_id, v_target_channel, NEW.channel;
  END IF;

  IF NEW.provider IS DISTINCT FROM v_target_provider THEN
    RAISE EXCEPTION 'check_publication_job_target_match: provider mismatch (target_id: %, expected: %, got: %)',
      NEW.target_id, v_target_provider, NEW.provider;
  END IF;

  IF NEW.client_integration_id IS DISTINCT FROM v_target_client_integration THEN
    RAISE EXCEPTION 'check_publication_job_target_match: client_integration_id mismatch (target_id: %)', NEW.target_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_publication_jobs_target_match
  BEFORE INSERT ON public.campaign_publication_jobs
  FOR EACH ROW EXECUTE FUNCTION public.check_publication_job_target_match();

-- ---------------------------------------------------------------------------
-- F2. protect_publication_job_immutable_fields()
-- BEFORE UPDATE en campaign_publication_jobs. Protege identidad/tenencia --
-- cambiar de target/provider/channel requiere un job nuevo, nunca mutar uno
-- existente (mismo criterio que protect_activation_target_immutable_fields).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_publication_job_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'campaign_publication_jobs: id is immutable';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'campaign_publication_jobs: organization_id is immutable';
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'campaign_publication_jobs: client_id is immutable';
  END IF;
  IF NEW.activation_id IS DISTINCT FROM OLD.activation_id THEN
    RAISE EXCEPTION 'campaign_publication_jobs: activation_id is immutable';
  END IF;
  IF NEW.target_id IS DISTINCT FROM OLD.target_id THEN
    RAISE EXCEPTION 'campaign_publication_jobs: target_id is immutable';
  END IF;
  IF NEW.channel IS DISTINCT FROM OLD.channel THEN
    RAISE EXCEPTION 'campaign_publication_jobs: channel is immutable';
  END IF;
  IF NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'campaign_publication_jobs: provider is immutable';
  END IF;
  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'campaign_publication_jobs: idempotency_key is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'campaign_publication_jobs: created_at is immutable';
  END IF;

  -- Terminal-state guard a nivel trigger (defensa adicional mas alla de las
  -- RPCs -- ninguna resurreccion desde succeeded/failed/cancelled).
  IF OLD.status IN ('succeeded', 'failed', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'campaign_publication_jobs: job % is terminal (status: %), no further status transition allowed',
      OLD.id, OLD.status;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_publication_jobs_immutable
  BEFORE UPDATE ON public.campaign_publication_jobs
  FOR EACH ROW EXECUTE FUNCTION public.protect_publication_job_immutable_fields();

-- ---------------------------------------------------------------------------
-- F3. check_publication_attempt_job_match()
-- BEFORE INSERT en campaign_publication_attempts. organization_id
-- denormalizado debe coincidir con el del job padre.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_publication_attempt_job_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_org_id uuid;
BEGIN
  SELECT organization_id INTO v_job_org_id
  FROM public.campaign_publication_jobs
  WHERE id = NEW.job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_publication_attempt_job_match: job not found (id: %)', NEW.job_id;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_job_org_id THEN
    RAISE EXCEPTION 'check_publication_attempt_job_match: organization_id mismatch (job_id: %, expected: %, got: %)',
      NEW.job_id, v_job_org_id, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_publication_attempts_job_match
  BEFORE INSERT ON public.campaign_publication_attempts
  FOR EACH ROW EXECUTE FUNCTION public.check_publication_attempt_job_match();

-- Append-only real: ningun UPDATE/DELETE permitido a nivel de grant (SECCION
-- H) -- mismo criterio que campaign_activation_events. Trigger adicional de
-- defensa en profundidad, por si en el futuro se otorgara algun GRANT UPDATE
-- por error:

CREATE OR REPLACE FUNCTION public.reject_publication_attempt_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'campaign_publication_attempts: append-only, direct UPDATE/DELETE not allowed (use RPCs)';
END;
$$;

CREATE TRIGGER trg_publication_attempts_no_update
  BEFORE UPDATE ON public.campaign_publication_attempts
  FOR EACH ROW EXECUTE FUNCTION public.reject_publication_attempt_mutation();

CREATE TRIGGER trg_publication_attempts_no_delete
  BEFORE DELETE ON public.campaign_publication_attempts
  FOR EACH ROW EXECUTE FUNCTION public.reject_publication_attempt_mutation();

-- ---------------------------------------------------------------------------
-- F4. check_publication_event_job_match() + append-only enforcement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_publication_event_job_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_org_id uuid;
BEGIN
  SELECT organization_id INTO v_job_org_id
  FROM public.campaign_publication_jobs
  WHERE id = NEW.job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_publication_event_job_match: job not found (id: %)', NEW.job_id;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_job_org_id THEN
    RAISE EXCEPTION 'check_publication_event_job_match: organization_id mismatch (job_id: %, expected: %, got: %)',
      NEW.job_id, v_job_org_id, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_publication_events_job_match
  BEFORE INSERT ON public.campaign_publication_events
  FOR EACH ROW EXECUTE FUNCTION public.check_publication_event_job_match();

CREATE OR REPLACE FUNCTION public.reject_publication_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'campaign_publication_events: append-only, direct UPDATE/DELETE not allowed (immutable audit trail)';
END;
$$;

CREATE TRIGGER trg_publication_events_no_update
  BEFORE UPDATE ON public.campaign_publication_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_publication_event_mutation();

CREATE TRIGGER trg_publication_events_no_delete
  BEFORE DELETE ON public.campaign_publication_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_publication_event_mutation();

-- ---------------------------------------------------------------------------
-- F5. check_publication_webhook_event_provider()
-- BEFORE INSERT en campaign_publication_webhook_events -- valida el provider
-- ANTES de cualquier otro procesamiento (cierra "arbitrary provider names",
-- audit S13.1 punto 2/S14). CHECK ck_publication_webhook_events_provider_not_manual
-- ya cubre 'manual'; este trigger es redundante-mente explicito para dejar
-- rastro de la intencion en el plan de ejecucion (documentacion viva).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_publication_webhook_event_job_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_org_id uuid;
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    SELECT organization_id INTO v_job_org_id
    FROM public.campaign_publication_jobs
    WHERE id = NEW.job_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'check_publication_webhook_event_job_match: job not found (id: %)', NEW.job_id;
    END IF;

    IF NEW.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM v_job_org_id THEN
      RAISE EXCEPTION 'check_publication_webhook_event_job_match: organization_id mismatch (job_id: %, expected: %, got: %)',
        NEW.job_id, v_job_org_id, NEW.organization_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_publication_webhook_events_job_match
  BEFORE INSERT OR UPDATE ON public.campaign_publication_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.check_publication_webhook_event_job_match();

-- =============================================================================
-- SECCION G -- RPCs SECURITY DEFINER (ciclo de vida del job de publicacion)
-- Patron identico al verificado en mark_activation_target_published (8A.1):
-- auth.uid() obligatorio (cuando aplica) -> SELECT ... FOR UPDATE (lock de
-- fila) -> has_organization_role() -> revalidacion de status ACTUAL -> UPDATE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- G1. create_publication_job(p_target_id, p_retry_of_job_id)
-- queued nuevo. Rol operator+ (audit S10). Rechaza targets manual/no-ready.
-- Si p_retry_of_job_id se provee, valida que el job anterior sea 'failed'
-- con failure_category retryable (audit S4.3 punto 1) y encadena retry_count.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_publication_job(
  p_target_id uuid,
  p_retry_of_job_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Un target no puede tener dos jobs activos (defensa explicita ademas del
  -- indice unico parcial -- mensaje de error mas claro que un 23505 crudo).
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
  'ready/scheduled. Rol operator+. p_retry_of_job_id encadena un retry '
  '(solo si el job anterior es failed+retryable).';

-- ---------------------------------------------------------------------------
-- G2. claim_publication_job(p_job_id, p_worker_id) -- queued -> claimed
-- SOLO service_role (worker/orquestador, no un usuario final -- audit S15.2).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_publication_job(p_job_id uuid, p_worker_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_status public.publication_job_status;
BEGIN
  IF p_worker_id IS NULL OR char_length(trim(p_worker_id)) = 0 THEN
    RAISE EXCEPTION 'claim_publication_job: worker_id is required';
  END IF;

  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_publication_job: job not found or already locked (id: %)', p_job_id;
  END IF;

  IF v_status <> 'queued' THEN
    RAISE EXCEPTION 'claim_publication_job: job % is not queued (current status: %)', p_job_id, v_status;
  END IF;

  UPDATE public.campaign_publication_jobs
  SET status = 'claimed', claimed_at = now(), claimed_by_worker = left(p_worker_id, 200)
  WHERE id = p_job_id;

  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, event_type, actor_user_id, is_system, note)
  VALUES
    (v_org_id, p_job_id, 'job_claimed', NULL, true, 'worker: ' || left(p_worker_id, 200));
END;
$$;

COMMENT ON FUNCTION public.claim_publication_job(uuid, text) IS
  'RPC: queued -> claimed via SELECT ... FOR UPDATE SKIP LOCKED (evita doble '
  'claim concurrente). service_role unicamente -- worker/orquestador, nunca '
  'un usuario final.';

-- ---------------------------------------------------------------------------
-- G3. start_publication_job(p_job_id, p_reconciliation_timeout_minutes)
-- claimed -> in_progress. Transiciona ATOMICAMENTE el target padre a
-- 'publishing' (audit S4.3 punto 4/S4.6 -- misma transaccion, nunca dos
-- pasos separados). SOLO service_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_publication_job(
  p_job_id uuid,
  p_reconciliation_timeout_minutes integer DEFAULT 15
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id     uuid;
  v_target_id  uuid;
  v_status     public.publication_job_status;
  v_now        timestamptz := now();
BEGIN
  IF p_reconciliation_timeout_minutes IS NULL OR p_reconciliation_timeout_minutes <= 0 THEN
    RAISE EXCEPTION 'start_publication_job: reconciliation_timeout_minutes must be positive';
  END IF;

  SELECT organization_id, target_id, status INTO v_org_id, v_target_id, v_status
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'start_publication_job: job not found (id: %)', p_job_id;
  END IF;

  IF v_status <> 'claimed' THEN
    RAISE EXCEPTION 'start_publication_job: job % is not claimed (current status: %)', p_job_id, v_status;
  END IF;

  UPDATE public.campaign_publication_jobs
  SET status = 'in_progress',
      started_at = v_now,
      reconciliation_deadline_at = v_now + make_interval(mins => p_reconciliation_timeout_minutes)
  WHERE id = p_job_id;

  -- Transicion atomica del target padre, misma transaccion (audit S4.6).
  -- mark_activation_target_publishing() hace su propio lock+revalidacion de
  -- status (ready|scheduled -> publishing) y dispara los triggers de 8A.1
  -- (target_status_changed_event / recompute_campaign_activation_status_trigger).
  PERFORM public.mark_activation_target_publishing(v_target_id);

  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, event_type, actor_user_id, is_system, note)
  VALUES
    (v_org_id, p_job_id, 'job_started', NULL, true, NULL);
END;
$$;

COMMENT ON FUNCTION public.start_publication_job(uuid, integer) IS
  'RPC: claimed -> in_progress; target ready/scheduled -> publishing en la '
  'MISMA transaccion (audit S4.6). Computa reconciliation_deadline_at con un '
  'timeout override-able (default 15 min, ver '
  'DEFAULT_PUBLICATION_RECONCILIATION_TIMEOUT_MINUTES en @bop-agency/shared). '
  'service_role unicamente.';

-- ---------------------------------------------------------------------------
-- G4. record_publication_attempt(p_job_id, p_idempotency_key) -- crea un
-- attempt abierto dentro de un job in_progress. SOLO service_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_publication_attempt(p_job_id uuid, p_idempotency_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_status public.publication_job_status;
  v_next_attempt_number integer;
  v_attempt_id uuid;
BEGIN
  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'record_publication_attempt: idempotency_key is required';
  END IF;

  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_publication_attempt: job not found (id: %)', p_job_id;
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'record_publication_attempt: job % is not in_progress (current status: %)', p_job_id, v_status;
  END IF;

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next_attempt_number
  FROM public.campaign_publication_attempts
  WHERE job_id = p_job_id;

  INSERT INTO public.campaign_publication_attempts
    (job_id, organization_id, attempt_number, idempotency_key)
  VALUES
    (p_job_id, v_org_id, v_next_attempt_number, p_idempotency_key)
  RETURNING id INTO v_attempt_id;

  RETURN v_attempt_id;
END;
$$;

COMMENT ON FUNCTION public.record_publication_attempt(uuid, text) IS
  'RPC: crea un CampaignPublicationAttempt abierto (sin outcome) dentro de '
  'un job in_progress. UNIQUE (job_id, idempotency_key) protege doble '
  'ejecucion de worker. service_role unicamente.';

-- ---------------------------------------------------------------------------
-- G5. mark_publication_job_succeeded -- in_progress -> succeeded; target ->
-- published. SOLO service_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_publication_job_succeeded(
  p_job_id uuid,
  p_attempt_id uuid,
  p_external_id text,
  p_external_url text DEFAULT NULL,
  p_provider_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    uuid;
  v_target_id uuid;
  v_status    public.publication_job_status;
  v_attempt_job_id uuid;
  v_attempt_started timestamptz;
  v_now       timestamptz := now();
BEGIN
  IF p_external_id IS NULL OR char_length(trim(p_external_id)) = 0 THEN
    RAISE EXCEPTION 'mark_publication_job_succeeded: external_id is required';
  END IF;

  SELECT organization_id, target_id, status INTO v_org_id, v_target_id, v_status
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_publication_job_succeeded: job not found (id: %)', p_job_id;
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'mark_publication_job_succeeded: job % is not in_progress (current status: %)', p_job_id, v_status;
  END IF;

  SELECT job_id, started_at INTO v_attempt_job_id, v_attempt_started
  FROM public.campaign_publication_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt_job_id IS DISTINCT FROM p_job_id THEN
    RAISE EXCEPTION 'mark_publication_job_succeeded: attempt % does not belong to job %', p_attempt_id, p_job_id;
  END IF;

  UPDATE public.campaign_publication_attempts
  SET outcome = 'confirmed',
      external_id = p_external_id,
      external_url = p_external_url,
      provider_status = p_provider_status,
      completed_at = v_now,
      duration_ms = GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_attempt_started)) * 1000)::integer
  WHERE id = p_attempt_id;

  UPDATE public.campaign_publication_jobs
  SET status = 'succeeded', completed_at = v_now
  WHERE id = p_job_id;

  UPDATE public.campaign_activation_targets
  SET status = 'published', published_at = v_now, external_reference = left(p_external_id, 300)
  WHERE id = v_target_id AND status = 'publishing';

  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, attempt_id, event_type, actor_user_id, is_system, note)
  VALUES
    (v_org_id, p_job_id, p_attempt_id, 'job_succeeded', NULL, true, NULL);
END;
$$;

COMMENT ON FUNCTION public.mark_publication_job_succeeded(uuid, uuid, text, text, text) IS
  'RPC: in_progress -> succeeded; attempt.outcome = confirmed; target '
  'publishing -> published. Nunca reintenta -- resultado ya conocido con '
  'evidencia positiva. service_role unicamente.';

-- ---------------------------------------------------------------------------
-- G6. mark_publication_job_failed -- in_progress -> failed; target -> failed.
-- SOLO service_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_publication_job_failed(
  p_job_id uuid,
  p_failure_category text,
  p_attempt_id uuid DEFAULT NULL,
  p_provider_error_code text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    uuid;
  v_target_id uuid;
  v_status    public.publication_job_status;
  v_attempt_job_id uuid;
  v_attempt_started timestamptz;
  v_now       timestamptz := now();
BEGIN
  IF p_failure_category IS NULL OR p_failure_category NOT IN (
    'ACTIVATION_NOT_READY', 'CHANNEL_NOT_CONFIGURED', 'INTEGRATION_NOT_AVAILABLE',
    'AUTH_EXPIRED', 'RATE_LIMITED', 'PROVIDER_REJECTED', 'PUBLISHING_TIMEOUT',
    'INVALID_ASSET', 'BUDGET_INVALID', 'DISPATCH_FAILED', 'PROVIDER_OUTAGE'
  ) THEN
    -- Nota: UNKNOWN_OUTCOME / UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED se
    -- excluyen deliberadamente de esta lista -- el primero solo lo pone
    -- mark_publication_job_unknown_outcome, el segundo solo
    -- reconcile_publication_job (nunca un failure "directo" declarado por
    -- el worker).
    RAISE EXCEPTION 'mark_publication_job_failed: invalid failure_category (%)', p_failure_category;
  END IF;

  SELECT organization_id, target_id, status INTO v_org_id, v_target_id, v_status
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_publication_job_failed: job not found (id: %)', p_job_id;
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'mark_publication_job_failed: job % is not in_progress (current status: %)', p_job_id, v_status;
  END IF;

  IF p_attempt_id IS NOT NULL THEN
    SELECT job_id, started_at INTO v_attempt_job_id, v_attempt_started
    FROM public.campaign_publication_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND OR v_attempt_job_id IS DISTINCT FROM p_job_id THEN
      RAISE EXCEPTION 'mark_publication_job_failed: attempt % does not belong to job %', p_attempt_id, p_job_id;
    END IF;

    UPDATE public.campaign_publication_attempts
    SET outcome = 'confirmed',
        provider_error_code = left(p_provider_error_code, 200),
        completed_at = v_now,
        duration_ms = GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_attempt_started)) * 1000)::integer
    WHERE id = p_attempt_id;
  END IF;

  UPDATE public.campaign_publication_jobs
  SET status = 'failed', completed_at = v_now, failure_category = p_failure_category
  WHERE id = p_job_id;

  -- Solo transiciona el target si sigue 'publishing' -- mark_activation_target_failed()
  -- ya revalida esto internamente y lanza si no aplica, asi que se llama
  -- condicionalmente solo cuando el precondition se cumple (defensa extra,
  -- evita una excepcion inesperada si el target ya se movio por otra via).
  IF EXISTS (
    SELECT 1 FROM public.campaign_activation_targets WHERE id = v_target_id AND status = 'publishing'
  ) THEN
    PERFORM public.mark_activation_target_failed(v_target_id, p_failure_category, p_note);
  END IF;

  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, attempt_id, event_type, actor_user_id, is_system, note, metadata)
  VALUES
    (v_org_id, p_job_id, p_attempt_id, 'job_failed', NULL, true, p_note,
     jsonb_build_object('failureCategory', p_failure_category));
END;
$$;

COMMENT ON FUNCTION public.mark_publication_job_failed(uuid, text, uuid, text, text) IS
  'RPC: in_progress -> failed; target publishing -> failed. failure_category '
  'determina elegibilidad de retry via create_publication_job(retry_of_job_id). '
  'service_role unicamente.';

-- ---------------------------------------------------------------------------
-- G7. mark_publication_job_unknown_outcome -- in_progress -> unknown_outcome
-- (NO terminal, CRITICO). Target permanece 'publishing' (audit S4.7). SOLO
-- service_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_publication_job_unknown_outcome(
  p_job_id uuid,
  p_attempt_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_status public.publication_job_status;
  v_attempt_job_id uuid;
BEGIN
  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_publication_job_unknown_outcome: job not found (id: %)', p_job_id;
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'mark_publication_job_unknown_outcome: job % is not in_progress (current status: %)',
      p_job_id, v_status;
  END IF;

  IF p_attempt_id IS NOT NULL THEN
    SELECT job_id INTO v_attempt_job_id
    FROM public.campaign_publication_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND OR v_attempt_job_id IS DISTINCT FROM p_job_id THEN
      RAISE EXCEPTION 'mark_publication_job_unknown_outcome: attempt % does not belong to job %', p_attempt_id, p_job_id;
    END IF;

    UPDATE public.campaign_publication_attempts
    SET outcome = 'unknown', completed_at = now()
    WHERE id = p_attempt_id;
  END IF;

  -- Job queda NO terminal -- ninguna otra fila (target/activation) se toca
  -- aqui: el target permanece 'publishing' hasta reconciliacion (S4.7).
  UPDATE public.campaign_publication_jobs
  SET status = 'unknown_outcome', failure_category = 'UNKNOWN_OUTCOME'
  WHERE id = p_job_id;

  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, attempt_id, event_type, actor_user_id, is_system, note)
  VALUES
    (v_org_id, p_job_id, p_attempt_id, 'job_marked_unknown_outcome', NULL, true, p_note);
END;
$$;

COMMENT ON FUNCTION public.mark_publication_job_unknown_outcome(uuid, uuid, text) IS
  'RPC: in_progress -> unknown_outcome (NO terminal). NUNCA se llama desde '
  'ningun flujo de retry automatico. Requiere reconcile_publication_job '
  '(strategist+) antes de poder resolverse. service_role unicamente.';

-- ---------------------------------------------------------------------------
-- G8. cancel_publication_job -- rol variable segun status (locked decision #2).
--   queued/claimed  -> cancelled (transicion real). Rol operator+.
--   in_progress     -> cooperativo (NO transiciona status, solo registra la
--                       solicitud). Rol strategist+.
--   terminal/unknown_outcome -> rechazado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_publication_job(p_job_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_org_id uuid;
  v_status public.publication_job_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'cancel_publication_job: authentication required';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'cancel_publication_job: reason is required';
  END IF;

  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_publication_job: job not found (id: %)', p_job_id;
  END IF;

  IF v_status IN ('succeeded', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'cancel_publication_job: job % is already terminal (status: %)', p_job_id, v_status;
  END IF;

  IF v_status = 'unknown_outcome' THEN
    RAISE EXCEPTION
      'cancel_publication_job: job % is in unknown_outcome, must be reconciled before any further action', p_job_id;
  END IF;

  IF v_status IN ('queued', 'claimed') THEN
    IF NOT public.has_organization_role(v_org_id, 'operator') THEN
      RAISE EXCEPTION 'cancel_publication_job: actor lacks operator+ role (job_id: %, status: %)', p_job_id, v_status;
    END IF;

    UPDATE public.campaign_publication_jobs
    SET status = 'cancelled',
        completed_at = now(),
        cancellation_requested_at = now(),
        cancellation_requested_by = v_actor
    WHERE id = p_job_id;

    INSERT INTO public.campaign_publication_events
      (organization_id, job_id, event_type, actor_user_id, is_system, note)
    VALUES
      (v_org_id, p_job_id, 'job_cancelled', v_actor, false, p_reason);

  ELSIF v_status = 'in_progress' THEN
    IF NOT public.has_organization_role(v_org_id, 'strategist') THEN
      RAISE EXCEPTION 'cancel_publication_job: actor lacks strategist+ role to cancel an in_progress job (job_id: %)',
        p_job_id;
    END IF;

    -- Cooperativo (audit S4.4): el job NO transiciona de estado aqui --
    -- solo se registra la intencion. Se resuelve mas tarde a
    -- succeeded/failed/unknown_outcome; la solicitud solo evita un retry
    -- automatico posterior.
    UPDATE public.campaign_publication_jobs
    SET cancellation_requested_at = now(), cancellation_requested_by = v_actor
    WHERE id = p_job_id;

    INSERT INTO public.campaign_publication_events
      (organization_id, job_id, event_type, actor_user_id, is_system, note, metadata)
    VALUES
      (v_org_id, p_job_id, 'job_cancelled', v_actor, false, p_reason,
       jsonb_build_object('cooperative', true, 'jobStillInProgress', true));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.cancel_publication_job(uuid, text) IS
  'RPC: queued/claimed -> cancelled (rol operator+, transicion directa). '
  'in_progress -> cooperativo, solo registra cancellation_requested_at/by '
  '(rol strategist+, NUNCA cancela una llamada HTTP en curso -- audit S4.4). '
  'Rechaza terminal/unknown_outcome.';

-- ---------------------------------------------------------------------------
-- G9. reconcile_publication_job -- SOLO desde unknown_outcome. Rol
-- strategist+ (locked decision #1 -- accion mas sensible del diseno).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reconcile_publication_job(
  p_job_id uuid,
  p_outcome text,
  p_note text,
  p_external_id text DEFAULT NULL,
  p_external_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_org_id    uuid;
  v_target_id uuid;
  v_status    public.publication_job_status;
  v_now       timestamptz := now();
  v_latest_attempt_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'reconcile_publication_job: authentication required';
  END IF;

  IF p_note IS NULL OR char_length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'reconcile_publication_job: note is required';
  END IF;

  IF p_outcome NOT IN ('published', 'not_published') THEN
    RAISE EXCEPTION 'reconcile_publication_job: outcome must be published or not_published (got: %)', p_outcome;
  END IF;

  SELECT organization_id, target_id, status INTO v_org_id, v_target_id, v_status
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reconcile_publication_job: job not found (id: %)', p_job_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'strategist') THEN
    RAISE EXCEPTION 'reconcile_publication_job: actor lacks strategist+ role (job_id: %)', p_job_id;
  END IF;

  IF v_status <> 'unknown_outcome' THEN
    RAISE EXCEPTION 'reconcile_publication_job: job % is not unknown_outcome (current status: %)', p_job_id, v_status;
  END IF;

  SELECT id INTO v_latest_attempt_id
  FROM public.campaign_publication_attempts
  WHERE job_id = p_job_id
  ORDER BY attempt_number DESC
  LIMIT 1
  FOR UPDATE;

  IF p_outcome = 'published' THEN
    IF p_external_id IS NULL OR char_length(trim(p_external_id)) = 0 THEN
      RAISE EXCEPTION 'reconcile_publication_job: external_id is required when outcome = published';
    END IF;

    UPDATE public.campaign_publication_jobs
    SET status = 'succeeded',
        completed_at = v_now,
        reconciled_by = v_actor,
        reconciled_at = v_now,
        reconciliation_note = p_note
    WHERE id = p_job_id;

    IF v_latest_attempt_id IS NOT NULL THEN
      UPDATE public.campaign_publication_attempts
      SET outcome = COALESCE(outcome, 'confirmed'),
          external_id = COALESCE(external_id, p_external_id),
          external_url = COALESCE(external_url, p_external_url),
          completed_at = COALESCE(completed_at, v_now)
      WHERE id = v_latest_attempt_id;
    END IF;

    UPDATE public.campaign_activation_targets
    SET status = 'published', published_at = v_now, external_reference = left(p_external_id, 300)
    WHERE id = v_target_id AND status = 'publishing';
  ELSE
    UPDATE public.campaign_publication_jobs
    SET status = 'failed',
        completed_at = v_now,
        failure_category = 'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED',
        reconciled_by = v_actor,
        reconciled_at = v_now,
        reconciliation_note = p_note
    WHERE id = p_job_id;

    IF v_latest_attempt_id IS NOT NULL THEN
      UPDATE public.campaign_publication_attempts
      SET outcome = COALESCE(outcome, 'confirmed'),
          completed_at = COALESCE(completed_at, v_now)
      WHERE id = v_latest_attempt_id;
    END IF;

    UPDATE public.campaign_activation_targets
    SET status = 'failed',
        failed_at = v_now,
        failure_code = 'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED',
        failure_message = left(p_note, 500)
    WHERE id = v_target_id AND status = 'publishing';
  END IF;

  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, attempt_id, event_type, actor_user_id, is_system, note, metadata)
  VALUES
    (v_org_id, p_job_id, v_latest_attempt_id, 'job_reconciled', v_actor, false, p_note,
     jsonb_build_object('outcome', p_outcome));
END;
$$;

COMMENT ON FUNCTION public.reconcile_publication_job(uuid, text, text, text, text) IS
  'RPC: unknown_outcome -> succeeded | failed. UNICA via para salir de '
  'unknown_outcome. Rol strategist+ (accion mas sensible del diseno -- '
  'locked decision #1). outcome=not_published deja failure_category = '
  'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED, elegible para retry.';

-- ---------------------------------------------------------------------------
-- G10. mark_activation_target_publishing / mark_activation_target_failed --
-- las 2 transiciones nuevas de campaign_activation_targets que 8B.1 cierra
-- (audit S1.1/S16). SOLO service_role -- invocadas por start_publication_job/
-- mark_publication_job_failed/reconcile_publication_job (arriba), NUNCA
-- directamente por un usuario (el camino manual sigue usando
-- mark_activation_target_published sin pasar por 'publishing').
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_activation_target_publishing(p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.activation_target_status;
BEGIN
  SELECT status INTO v_status
  FROM public.campaign_activation_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_activation_target_publishing: target not found (id: %)', p_target_id;
  END IF;

  IF v_status NOT IN ('ready', 'scheduled') THEN
    RAISE EXCEPTION 'mark_activation_target_publishing: target % is not ready/scheduled (current status: %)',
      p_target_id, v_status;
  END IF;

  UPDATE public.campaign_activation_targets
  SET status = 'publishing'
  WHERE id = p_target_id;
END;
$$;

COMMENT ON FUNCTION public.mark_activation_target_publishing(uuid) IS
  'RPC Phase 8B.1: ready|scheduled -> publishing. service_role unicamente -- '
  'usada por start_publication_job y disponible como primitiva de '
  'CampaignActivationRepository.markTargetPublishing para 8B.2/testing.';

CREATE OR REPLACE FUNCTION public.mark_activation_target_failed(
  p_target_id uuid,
  p_failure_code text,
  p_failure_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.activation_target_status;
BEGIN
  IF p_failure_code IS NULL OR char_length(trim(p_failure_code)) = 0 THEN
    RAISE EXCEPTION 'mark_activation_target_failed: failure_code is required';
  END IF;

  SELECT status INTO v_status
  FROM public.campaign_activation_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_activation_target_failed: target not found (id: %)', p_target_id;
  END IF;

  IF v_status <> 'publishing' THEN
    RAISE EXCEPTION 'mark_activation_target_failed: target % is not publishing (current status: %)',
      p_target_id, v_status;
  END IF;

  UPDATE public.campaign_activation_targets
  SET status = 'failed',
      failed_at = now(),
      failure_code = left(p_failure_code, 100),
      failure_message = left(p_failure_message, 500)
  WHERE id = p_target_id;
END;
$$;

COMMENT ON FUNCTION public.mark_activation_target_failed(uuid, text, text) IS
  'RPC Phase 8B.1: publishing -> failed. service_role unicamente -- usada '
  'por mark_publication_job_failed/reconcile_publication_job y disponible '
  'como primitiva de CampaignActivationRepository.markTargetFailed.';

-- ---------------------------------------------------------------------------
-- G11. append_publication_event -- evento de diagnostico adicional fuera de
-- los ya emitidos automaticamente arriba (uso previsto: 8B.2/8B.3). SOLO
-- service_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.append_publication_event(
  p_job_id uuid,
  p_event_type text,
  p_attempt_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_event_id uuid;
BEGIN
  IF p_event_type NOT IN (
    'job_queued', 'job_claimed', 'job_started', 'job_succeeded', 'job_failed',
    'job_cancelled', 'job_marked_unknown_outcome', 'job_reconciled', 'webhook_received'
  ) THEN
    RAISE EXCEPTION 'append_publication_event: invalid event_type (%)', p_event_type;
  END IF;

  IF jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'append_publication_event: metadata must be a JSON object';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'append_publication_event: job not found (id: %)', p_job_id;
  END IF;

  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, attempt_id, event_type, actor_user_id, is_system, note, metadata)
  VALUES
    (v_org_id, p_job_id, p_attempt_id, p_event_type, NULL, true, p_note, p_metadata)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.append_publication_event(uuid, text, uuid, text, jsonb) IS
  'RPC: evento de diagnostico adicional (is_system=true) fuera de los ya '
  'emitidos por las transiciones de arriba. Metadata debe llegar ya '
  'sanitizada por el caller (application/infrastructure) -- esta RPC no '
  're-filtra. service_role unicamente.';

-- ---------------------------------------------------------------------------
-- G12. record_publication_webhook_receipt -- INSERT idempotente, dedupe por
-- (provider, external_event_id). SOLO service_role. Fundamento de replay
-- protection para 8B.3 (ningun endpoint HTTP la invoca todavia).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_publication_webhook_receipt(
  p_provider text,
  p_external_event_id text,
  p_payload_hash text
)
RETURNS TABLE (id uuid, is_new boolean, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider public.activation_provider;
  v_id uuid;
  v_status public.publication_webhook_event_status;
BEGIN
  IF p_external_event_id IS NULL OR char_length(trim(p_external_event_id)) = 0 THEN
    RAISE EXCEPTION 'record_publication_webhook_receipt: external_event_id is required';
  END IF;

  IF p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'record_publication_webhook_receipt: payload_hash must be a 64-char hex SHA-256';
  END IF;

  -- Cast a enum cerrado: valida el provider ANTES de cualquier otro
  -- procesamiento (audit S13.1 punto 2) -- un valor invalido lanza
  -- "invalid input value for enum" automaticamente. 'manual' rechazado
  -- explicitamente (nunca recibe webhooks de publicacion).
  BEGIN
    v_provider := p_provider::public.activation_provider;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_publication_webhook_receipt: invalid provider (%)', p_provider;
  END;

  IF v_provider = 'manual' THEN
    RAISE EXCEPTION 'record_publication_webhook_receipt: provider manual does not emit webhooks';
  END IF;

  INSERT INTO public.campaign_publication_webhook_events
    (provider, external_event_id, payload_hash, status)
  VALUES
    (v_provider, p_external_event_id, p_payload_hash, 'received')
  ON CONFLICT (provider, external_event_id) DO NOTHING
  RETURNING campaign_publication_webhook_events.id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true, 'received'::text;
    RETURN;
  END IF;

  -- Conflicto: replay detectado. Devuelve la fila existente sin mutarla.
  SELECT w.id, w.status INTO v_id, v_status
  FROM public.campaign_publication_webhook_events w
  WHERE w.provider = v_provider AND w.external_event_id = p_external_event_id;

  RETURN QUERY SELECT v_id, false, v_status::text;
END;
$$;

COMMENT ON FUNCTION public.record_publication_webhook_receipt(text, text, text) IS
  'RPC: INSERT idempotente en campaign_publication_webhook_events, '
  'UNIQUE (provider, external_event_id) + ON CONFLICT DO NOTHING. '
  'is_new=false = replay detectado (el caller NUNCA debe reprocesar). '
  'service_role unicamente -- fundamento para el webhook HTTP de 8B.3.';

-- ---------------------------------------------------------------------------
-- G13. mark_webhook_event_processed -- correlaciona y marca el resultado del
-- procesamiento de un webhook ya recibido. SOLO service_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_webhook_event_processed(
  p_webhook_event_id uuid,
  p_status text,
  p_error_code text DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_attempt_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('processed', 'failed') THEN
    RAISE EXCEPTION 'mark_webhook_event_processed: status must be processed or failed (got: %)', p_status;
  END IF;

  UPDATE public.campaign_publication_webhook_events
  SET status = p_status::public.publication_webhook_event_status,
      processed_at = now(),
      error_code = left(p_error_code, 200),
      job_id = COALESCE(p_job_id, job_id),
      organization_id = COALESCE(p_organization_id, organization_id),
      attempt_id = COALESCE(p_attempt_id, attempt_id)
  WHERE id = p_webhook_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_webhook_event_processed: webhook event not found (id: %)', p_webhook_event_id;
  END IF;

  IF p_job_id IS NOT NULL AND p_organization_id IS NOT NULL THEN
    INSERT INTO public.campaign_publication_events
      (organization_id, job_id, attempt_id, event_type, actor_user_id, is_system, note)
    VALUES
      (p_organization_id, p_job_id, p_attempt_id, 'webhook_received', NULL, true,
       'webhook_event_id: ' || p_webhook_event_id::text);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.mark_webhook_event_processed(uuid, text, text, uuid, uuid, uuid) IS
  'RPC: marca un campaign_publication_webhook_events como processed|failed '
  'y correlaciona job_id/organization_id/attempt_id una vez resueltos. '
  'Inserta un evento webhook_received cuando se provee job_id+organization_id. '
  'service_role unicamente.';

-- =============================================================================
-- SECCION H -- GRANTS de funciones (por capa de autorizacion, audit S15.2)
-- =============================================================================

-- Revoke general primero (mismo criterio que 8A.1/7C).
REVOKE ALL ON FUNCTION public.create_publication_job(uuid, uuid)                                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_publication_job(uuid, text)                                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_publication_job(uuid, integer)                                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_publication_attempt(uuid, text)                              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_publication_job_succeeded(uuid, uuid, text, text, text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_publication_job_failed(uuid, text, uuid, text, text)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_publication_job_unknown_outcome(uuid, uuid, text)              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_publication_job(uuid, text)                                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_publication_job(uuid, text, text, text, text)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_activation_target_publishing(uuid)                             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_activation_target_failed(uuid, text, text)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_publication_event(uuid, text, uuid, text, jsonb)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_publication_webhook_receipt(text, text, text)                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_webhook_event_processed(uuid, text, text, uuid, uuid, uuid)    FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_publication_job(uuid, uuid)                                 FROM anon;
REVOKE ALL ON FUNCTION public.claim_publication_job(uuid, text)                                  FROM anon;
REVOKE ALL ON FUNCTION public.start_publication_job(uuid, integer)                                FROM anon;
REVOKE ALL ON FUNCTION public.record_publication_attempt(uuid, text)                              FROM anon;
REVOKE ALL ON FUNCTION public.mark_publication_job_succeeded(uuid, uuid, text, text, text)        FROM anon;
REVOKE ALL ON FUNCTION public.mark_publication_job_failed(uuid, text, uuid, text, text)           FROM anon;
REVOKE ALL ON FUNCTION public.mark_publication_job_unknown_outcome(uuid, uuid, text)              FROM anon;
REVOKE ALL ON FUNCTION public.cancel_publication_job(uuid, text)                                  FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_publication_job(uuid, text, text, text, text)             FROM anon;
REVOKE ALL ON FUNCTION public.mark_activation_target_publishing(uuid)                             FROM anon;
REVOKE ALL ON FUNCTION public.mark_activation_target_failed(uuid, text, text)                     FROM anon;
REVOKE ALL ON FUNCTION public.append_publication_event(uuid, text, uuid, text, jsonb)             FROM anon;
REVOKE ALL ON FUNCTION public.record_publication_webhook_receipt(text, text, text)                FROM anon;
REVOKE ALL ON FUNCTION public.mark_webhook_event_processed(uuid, text, text, uuid, uuid, uuid)    FROM anon;

-- Capa "flujo de usuario normal": authenticated, gate de rol interno.
GRANT EXECUTE ON FUNCTION public.create_publication_job(uuid, uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_publication_job(uuid, text)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_publication_job(uuid, text, text, text, text) TO authenticated;

-- Capa "worker/gateway/webhook interno" (8B.2/8B.3): SOLO service_role.
-- NUNCA authenticated -- cierra explicitamente cualquier posibilidad de que
-- un usuario final fuerce una transicion que deberia originarse en el
-- proveedor real.
GRANT EXECUTE ON FUNCTION public.claim_publication_job(uuid, text)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.start_publication_job(uuid, integer)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.record_publication_attempt(uuid, text)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_publication_job_succeeded(uuid, uuid, text, text, text)  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_publication_job_failed(uuid, text, uuid, text, text)     TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_publication_job_unknown_outcome(uuid, uuid, text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_activation_target_publishing(uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_activation_target_failed(uuid, text, text)               TO service_role;
GRANT EXECUTE ON FUNCTION public.append_publication_event(uuid, text, uuid, text, jsonb)       TO service_role;
GRANT EXECUTE ON FUNCTION public.record_publication_webhook_receipt(text, text, text)          TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_webhook_event_processed(uuid, text, text, uuid, uuid, uuid) TO service_role;

-- =============================================================================
-- SECCION I -- GRANTS de tabla + ROW LEVEL SECURITY
-- =============================================================================

-- Ninguna de las 4 tablas nuevas otorga INSERT/UPDATE/DELETE a authenticated
-- ni a service_role -- TODA escritura pasa por las RPCs SECURITY DEFINER de
-- la SECCION G, que corren como el dueno de la tabla y por tanto no estan
-- sujetas a estos GRANT (mismo criterio que campaign_activation_events en
-- 8A.1, generalizado aqui a las 4 tablas -- audit S15.2: "INSERT/UPDATE
-- directo: no expuesto en absoluto para las 4 tablas").

REVOKE ALL ON public.campaign_publication_jobs            FROM anon, authenticated, service_role;
REVOKE ALL ON public.campaign_publication_attempts        FROM anon, authenticated, service_role;
REVOKE ALL ON public.campaign_publication_events          FROM anon, authenticated, service_role;
REVOKE ALL ON public.campaign_publication_webhook_events   FROM anon, authenticated, service_role;

GRANT SELECT ON public.campaign_publication_jobs      TO authenticated;
GRANT SELECT ON public.campaign_publication_attempts  TO authenticated;
GRANT SELECT ON public.campaign_publication_events    TO authenticated;
-- campaign_publication_webhook_events: SIN grant a authenticated (ni
-- siquiera SELECT) -- mismo criterio que automation_webhook_events (audit
-- S1.2: "Unico acceso via service_role; authenticated no tiene politica RLS
-- ni GRANT"). Nunca contiene tenant claims confiables antes de correlacion.

ALTER TABLE public.campaign_publication_jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_publication_attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_publication_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_publication_webhook_events   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS: campaign_publication_jobs -- SELECT unicamente (viewer read-only,
-- audit S10). Sin policy de INSERT/UPDATE/DELETE -- sin GRANT, cualquier
-- intento directo es rechazado antes de evaluar RLS.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS campaign_publication_jobs_select ON public.campaign_publication_jobs;
CREATE POLICY campaign_publication_jobs_select ON public.campaign_publication_jobs FOR SELECT TO authenticated
  USING (public.is_organization_member(campaign_publication_jobs.organization_id));

-- ---------------------------------------------------------------------------
-- RLS: campaign_publication_attempts
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS campaign_publication_attempts_select ON public.campaign_publication_attempts;
CREATE POLICY campaign_publication_attempts_select ON public.campaign_publication_attempts FOR SELECT TO authenticated
  USING (public.is_organization_member(campaign_publication_attempts.organization_id));

-- ---------------------------------------------------------------------------
-- RLS: campaign_publication_events (append-only real)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS campaign_publication_events_select ON public.campaign_publication_events;
CREATE POLICY campaign_publication_events_select ON public.campaign_publication_events FOR SELECT TO authenticated
  USING (public.is_organization_member(campaign_publication_events.organization_id));

-- ---------------------------------------------------------------------------
-- RLS: campaign_publication_webhook_events -- SIN policy alguna (ni SELECT)
-- para authenticated. Acceso exclusivamente via las RPCs SECURITY DEFINER
-- de la SECCION G (que corren como dueno de tabla, sin pasar por RLS de
-- `authenticated`). Mismo criterio que automation_webhook_events.
-- ---------------------------------------------------------------------------

-- (sin CREATE POLICY -- intencional)

-- =============================================================================
-- FIN DE MIGRACION
-- Aplicar manualmente en: Supabase Dashboard -> SQL Editor -> Run (o local
-- via psql/docker). NO ejecutada contra Supabase remoto/produccion/local
-- como parte de esta tarea -- este puente no tiene supabase/docker/psql
-- disponibles (mismo bloqueo verificado que 8A.1). Ver
-- docs/implementation/phase-8/PHASE_8B1_PUBLICATION_DOMAIN_PERSISTENCE_REPORT.md
-- para la revision estatica realizada en su lugar.
-- =============================================================================
