-- =============================================================================
-- Phase 6B — Automation Runtime: Database Schema
-- Archivo: 20260804000000_phase6b_automation_runtime.sql
-- Rama: feat/phase-6-automation-runtime
--
-- PRECONDICIONES:
--   - Phase 4: 20260730150000_phase4_data_migration_targets.sql ejecutada
--     (define public.automation_status con 'active','paused','error','disabled','inactive')
--   - public.automations ya existe con columnas: id, organization_id, client_id,
--     legacy_id, name, description, status, schedule, etc.
--   - public.set_updated_at() ya existe (Phase 2)
--   - public.is_organization_member(), public.has_organization_role() ya existen (Phase 2)
--
-- ESTADO DEL ENUM public.automation_status (ANTES de esta migración):
--   'active' | 'paused' | 'error' | 'disabled' | 'inactive'
--
-- ESTADO OBJETIVO (dominio Phase 6A):
--   'draft' | 'active' | 'paused' | 'archived'
--
-- ESTRATEGIA DE COMPATIBILIDAD inactive → paused:
--   1. 'paused' ya existe en el enum — no se añade de nuevo.
--   2. Se añaden 'draft' y 'archived' al enum.
--   3. Se migran filas con status='inactive' → 'paused'.
--   4. 'error' y 'disabled' NO se eliminan en esta migración (deuda técnica Phase 6E).
--      El mapper transitorio de infraestructura mapea 'inactive' → 'paused' durante
--      el período de compatibilidad mientras puedan existir filas legacy.
--   5. UNIQUE (organization_id, idempotency_key) en automation_executions — idempotencia
--      scoped por tenant, no global.
--
-- ROLLBACK: ver comentarios de sección DOWN al final del archivo.
-- IDEMPOTENCIA: CREATE IF NOT EXISTS / ADD VALUE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--
-- SEGURIDAD:
--   - No service_role desde código web.
--   - No secretos en configuration/metadata.
--   - RLS activo en todas las tablas nuevas.
--   - No políticas abiertas USING (true).
--   - organization_id obligatorio en todas las operaciones de escritura.
-- =============================================================================

-- ─── 0. EXTENSIÓN NECESARIA ───────────────────────────────────────────────────

-- pgcrypto para gen_random_uuid() si no está disponible por defecto (Supabase lo tiene)
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- SECCIÓN A — ENUM: automation_status
-- =============================================================================

-- A1. Añadir 'draft' al enum (seguro en PostgreSQL 14+; no requiere LOCK TABLE)
-- 'paused' ya existe desde la migración de Phase 4 — no se re-añade.
ALTER TYPE public.automation_status ADD VALUE IF NOT EXISTS 'draft';

-- A2. Añadir 'archived' al enum
ALTER TYPE public.automation_status ADD VALUE IF NOT EXISTS 'archived';

-- NOTA TÉCNICA: ALTER TYPE ADD VALUE no puede ejecutarse dentro de un bloque
-- de transacción explícita en algunas versiones. En Supabase (PostgreSQL 15)
-- es seguro en el contexto de un archivo de migración sin BEGIN/COMMIT explícito.
-- Los valores 'error' y 'disabled' se conservan (deuda técnica Phase 6E).

-- =============================================================================
-- SECCIÓN B — TABLA: public.automations (modificar existente)
-- =============================================================================

-- B1. Migrar filas 'inactive' → 'paused'
-- 'paused' ya existe en el enum.
UPDATE public.automations SET status = 'paused' WHERE status = 'inactive';

-- B2. Añadir columnas de dominio Phase 6A que no existen en la tabla legacy
--
-- NOTA: workflow_id (legacy, Phase 4) != n8n_workflow_id (dominio Phase 6A).
-- Se mantiene workflow_id por compatibilidad con scripts de migración de Phase 4.
-- El mapper usa n8n_workflow_id; workflow_id queda como campo legacy.

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS trigger_config       jsonb       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retry_policy         jsonb       NOT NULL
    DEFAULT '{"maxAttempts":3,"initialDelayMs":1000,"backoffMultiplier":2,"maxDelayMs":30000}',
  ADD COLUMN IF NOT EXISTS n8n_workflow_id      text            NULL
    CHECK (n8n_workflow_id IS NULL OR char_length(n8n_workflow_id) BETWEEN 1 AND 255),
  ADD COLUMN IF NOT EXISTS metadata             jsonb       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_manual_only       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_executed_at     timestamptz     NULL;

-- B3. Constraints en columnas nuevas
-- NOTA: PostgreSQL no soporta ADD CONSTRAINT IF NOT EXISTS.
-- Se usan bloques DO $$ ... $$ que consultan pg_constraint para idempotencia.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'ck_automations_trigger_config_obj'
      AND conrelid   = 'public.automations'::regclass
  ) THEN
    ALTER TABLE public.automations
      ADD CONSTRAINT ck_automations_trigger_config_obj
        CHECK (jsonb_typeof(trigger_config) = 'object');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'ck_automations_retry_policy_obj'
      AND conrelid   = 'public.automations'::regclass
  ) THEN
    ALTER TABLE public.automations
      ADD CONSTRAINT ck_automations_retry_policy_obj
        CHECK (jsonb_typeof(retry_policy) = 'object');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'ck_automations_metadata_obj'
      AND conrelid   = 'public.automations'::regclass
  ) THEN
    ALTER TABLE public.automations
      ADD CONSTRAINT ck_automations_metadata_obj
        CHECK (jsonb_typeof(metadata) = 'object');
  END IF;
END
$$;

-- B4. Índices adicionales para dominio Phase 6A
CREATE INDEX IF NOT EXISTS idx_automations_status_active
  ON public.automations(organization_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_automations_n8n_workflow
  ON public.automations(n8n_workflow_id)
  WHERE n8n_workflow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automations_org_created
  ON public.automations(organization_id, created_at DESC);

-- B5. Trigger updated_at en automations (reutiliza función existente)
DROP TRIGGER IF EXISTS trg_automations_updated_at ON public.automations;
CREATE TRIGGER trg_automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SECCIÓN C — TABLA: public.automation_executions
-- =============================================================================

-- C1. Crear tabla
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id)  ON DELETE CASCADE,
  automation_id     uuid        NOT NULL REFERENCES public.automations(id)    ON DELETE CASCADE,
  client_id         uuid            NULL REFERENCES public.clients(id)        ON DELETE RESTRICT,
  status            text        NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled','retrying')),
  attempt           integer     NOT NULL DEFAULT 1
    CHECK (attempt >= 1),
  idempotency_key   text        NOT NULL
    CHECK (char_length(idempotency_key) BETWEEN 1 AND 500),
  triggered_by      text        NOT NULL
    CHECK (char_length(triggered_by) BETWEEN 1 AND 255),
  trigger_type      text        NOT NULL
    CHECK (trigger_type IN ('schedule','webhook','event','manual')),
  input_metadata    jsonb           NULL
    CHECK (input_metadata IS NULL OR jsonb_typeof(input_metadata) = 'object'),
  output_metadata   jsonb           NULL
    CHECK (output_metadata IS NULL OR jsonb_typeof(output_metadata) = 'object'),
  error_code        text            NULL
    CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 100),
  error_message     text            NULL
    CHECK (error_message IS NULL OR char_length(error_message) <= 500),
  queued_at         timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz     NULL,
  completed_at      timestamptz     NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT automation_executions_pkey PRIMARY KEY (id),

  -- Consistencia de timestamps
  CONSTRAINT ck_exec_started_after_queued
    CHECK (started_at IS NULL OR started_at >= queued_at),
  CONSTRAINT ck_exec_completed_requires_started
    CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CONSTRAINT ck_exec_completed_after_started
    CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

-- C2. Unicidad de idempotency_key por tenant (no global — previene cross-tenant collision)
CREATE UNIQUE INDEX IF NOT EXISTS uq_exec_org_idempotency
  ON public.automation_executions(organization_id, idempotency_key);

-- C3. Índices operacionales
CREATE INDEX IF NOT EXISTS idx_exec_org_created
  ON public.automation_executions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exec_automation_created
  ON public.automation_executions(automation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exec_client_created
  ON public.automation_executions(client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exec_status_created
  ON public.automation_executions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exec_org_automation_status
  ON public.automation_executions(organization_id, automation_id, status);

-- C4. Trigger updated_at
DROP TRIGGER IF EXISTS trg_automation_executions_updated_at ON public.automation_executions;
CREATE TRIGGER trg_automation_executions_updated_at
  BEFORE UPDATE ON public.automation_executions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- C5. Permisos base
REVOKE ALL ON public.automation_executions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.automation_executions TO authenticated;

-- C5b. Permisos service_role (fix Phase 6 local staging — 42501/permission denied)
-- CORRECCIÓN: el comentario original de esta migración asumía que service_role
-- "hereda por defecto" los privilegios de tabla en Supabase. Eso NO es cierto de
-- forma consistente: en instancias locales/self-hosted (supabase CLI) service_role
-- solo trae REFERENCES/TRIGGER/TRUNCATE por defecto sobre tablas nuevas — sin
-- SELECT/INSERT/UPDATE/DELETE explícitos, PostgREST devuelve 403 /
-- SQLSTATE 42501 "permission denied for table ...". Evidencia local: el callback
-- POST /api/webhooks/n8n (service_role, tras verificación HMAC) hace SELECT y
-- UPDATE directos sobre esta tabla (apps/web/src/app/api/webhooks/n8n/route.ts).
-- No se otorga INSERT/DELETE a service_role: la creación de ejecuciones sigue
-- pasando por el cliente de sesión del usuario (RLS, ver
-- apps/web/src/lib/composition/automation-execution.composition.ts).
GRANT SELECT, UPDATE ON public.automation_executions TO service_role;

-- =============================================================================
-- SECCIÓN D — TABLA: public.automation_execution_logs
-- =============================================================================

-- D1. Crear tabla
CREATE TABLE IF NOT EXISTS public.automation_execution_logs (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id)         ON DELETE CASCADE,
  execution_id    uuid        NOT NULL REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  level           text        NOT NULL DEFAULT 'info'
    CHECK (level IN ('debug','info','warn','error')),
  event_type      text            NULL
    CHECK (event_type IS NULL OR char_length(event_type) BETWEEN 1 AND 100),
  message         text        NOT NULL
    CHECK (char_length(message) BETWEEN 1 AND 2000),
  -- NUNCA almacenar: tokens, passwords, authorization headers, raw credentials,
  -- payloads completos con PII. Solo metadatos de diagnóstico.
  metadata        jsonb           NULL
    CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object'),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT automation_execution_logs_pkey PRIMARY KEY (id)
);

-- D2. Índices
CREATE INDEX IF NOT EXISTS idx_exec_logs_execution_occurred
  ON public.automation_execution_logs(execution_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_exec_logs_org_occurred
  ON public.automation_execution_logs(organization_id, occurred_at DESC);

-- Índice parcial para filtra rápido por nivel de severidad
CREATE INDEX IF NOT EXISTS idx_exec_logs_org_level_warn_error
  ON public.automation_execution_logs(organization_id, occurred_at DESC)
  WHERE level IN ('warn','error');

-- D3. Permisos base
REVOKE ALL ON public.automation_execution_logs FROM anon, authenticated;
GRANT SELECT ON public.automation_execution_logs TO authenticated;
-- INSERT solo desde service_role (webhook route). No se otorga INSERT a authenticated.

-- D3b. Permisos service_role (fix Phase 6 local staging — 42501/permission denied)
-- Mismo problema que en automation_executions (ver C5b): sin este GRANT explícito,
-- el INSERT que hace el callback de n8n (apps/web/src/app/api/webhooks/n8n/route.ts,
-- paso 11: registro sanitizado por ejecución) falla con 42501 en instancias donde
-- service_role no hereda privilegios por defecto. Solo INSERT: el webhook route no
-- lee ni actualiza logs, solo los crea; SELECT para la UI sigue siendo vía
-- authenticated + RLS (política exec_logs_select).
GRANT INSERT ON public.automation_execution_logs TO service_role;

-- =============================================================================
-- SECCIÓN E — TABLA: public.automation_webhook_events
-- =============================================================================

-- E1. Crear tabla
-- Propósito: deduplicación de callbacks n8n, auditoría de recepción, soporte HMAC (Phase 6C).
-- NOTA: payload_hash almacena SHA-256 del body (sin el payload crudo por seguridad/tamaño).
-- El payload crudo no se almacena salvo en contexto sanitizado explícito.
CREATE TABLE IF NOT EXISTS public.automation_webhook_events (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid            NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  execution_id      uuid            NULL REFERENCES public.automation_executions(id) ON DELETE SET NULL,
  external_event_id text            NULL
    CHECK (external_event_id IS NULL OR char_length(external_event_id) BETWEEN 1 AND 255),
  source            text        NOT NULL DEFAULT 'n8n'
    CHECK (char_length(source) BETWEEN 1 AND 50),
  event_type        text        NOT NULL
    CHECK (char_length(event_type) BETWEEN 1 AND 100),
  payload_hash      text            NULL
    CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz     NULL,
  status            text        NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processed','failed')),
  error_code        text            NULL
    CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 100),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT automation_webhook_events_pkey PRIMARY KEY (id)
);

-- E2. Unicidad por fuente + external_event_id (deduplicación entre fuentes)
-- Se evalúa sin organization_id porque n8n puede no incluirlo en el callback inicial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_source_external_id
  ON public.automation_webhook_events(source, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- E3. Índices
CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON public.automation_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_org_received
  ON public.automation_webhook_events(organization_id, received_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_failed
  ON public.automation_webhook_events(status)
  WHERE status = 'failed';

-- E4. Permisos: SOLO service_role
-- authenticated no tiene acceso a esta tabla (auditoría interna)
REVOKE ALL ON public.automation_webhook_events FROM anon, authenticated;

-- CORRECCIÓN (fix Phase 6 local staging — causa raíz del 42501):
-- El supuesto "service_role hereda por defecto en Supabase — no necesita GRANT
-- explícito" es INCORRECTO para esta instancia. Auditoría local confirmó que
-- service_role solo tenía REFERENCES/TRIGGER/TRUNCATE sobre esta tabla (sin
-- SELECT/INSERT/UPDATE/DELETE), lo que producía:
--   HTTP 403 — SQLSTATE 42501 — permission denied for table automation_webhook_events
-- al intentar el INSERT de deduplicación del callback de n8n (PASO 7 de
-- apps/web/src/app/api/webhooks/n8n/route.ts). Nótese que supabase-js encadena
-- `.insert(...).select('id').single()` — el INSERT por sí solo no basta, PostgREST
-- también requiere SELECT para devolver la fila insertada.
-- service_role necesita: SELECT (retorno post-insert), INSERT (registro de
-- deduplicación), UPDATE (marcar processed/failed). DELETE se otorga para
-- soportar la retención documentada (sugerida: 7 días, ver COMMENT ON TABLE
-- más abajo y deuda técnica Phase 6G — job de limpieza aún no implementado).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_webhook_events TO service_role;
-- anon permanece sin acceso operativo (ya cubierto por REVOKE ALL arriba).
-- authenticated permanece sin política RLS ni GRANT (ver sección G3 — RLS
-- habilitado, sin políticas para authenticated).

-- =============================================================================
-- SECCIÓN F — TABLA: public.automation_secrets_metadata
-- =============================================================================

-- F1. Crear tabla
-- CRÍTICO: Esta tabla NO almacena secretos.
-- Almacena REFERENCIA a secretos en Supabase Vault (vault_reference = ID en vault.secrets).
-- Nunca incluir: secret_value, token_value, password, api_key real.
CREATE TABLE IF NOT EXISTS public.automation_secrets_metadata (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id)  ON DELETE CASCADE,
  automation_id   uuid            NULL REFERENCES public.automations(id)   ON DELETE CASCADE,
  secret_name     text        NOT NULL
    CHECK (char_length(secret_name) BETWEEN 1 AND 100),
  provider        text        NOT NULL DEFAULT 'supabase_vault'
    CHECK (char_length(provider) BETWEEN 1 AND 50),
  -- vault_reference: ID en vault.secrets (uuid como text para flexibilidad entre proveedores)
  vault_reference text        NOT NULL
    CHECK (char_length(vault_reference) BETWEEN 1 AND 255),
  status          text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','revoked')),
  last_rotated_at timestamptz     NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT automation_secrets_metadata_pkey PRIMARY KEY (id)
);

-- F2. Unicidad: un nombre de secreto por organización + automatización
CREATE UNIQUE INDEX IF NOT EXISTS uq_secrets_org_automation_name
  ON public.automation_secrets_metadata(organization_id, automation_id, secret_name)
  WHERE automation_id IS NOT NULL;

-- Unicidad para secretos globales de organización (automation_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_secrets_org_global_name
  ON public.automation_secrets_metadata(organization_id, secret_name)
  WHERE automation_id IS NULL;

-- F3. Índice para alertas de expiración
CREATE INDEX IF NOT EXISTS idx_secrets_expiry
  ON public.automation_secrets_metadata(last_rotated_at)
  WHERE last_rotated_at IS NOT NULL;

-- F4. Trigger updated_at
DROP TRIGGER IF EXISTS trg_automation_secrets_updated_at ON public.automation_secrets_metadata;
CREATE TRIGGER trg_automation_secrets_updated_at
  BEFORE UPDATE ON public.automation_secrets_metadata
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- F5. Permisos base
REVOKE ALL ON public.automation_secrets_metadata FROM anon, authenticated;
GRANT SELECT ON public.automation_secrets_metadata TO authenticated;
-- INSERT/UPDATE via RLS admin/owner (ver políticas abajo, sección G4)

-- NOTA (auditoría de grants Phase 6 local staging): a diferencia de
-- automation_executions / automation_execution_logs / automation_webhook_events,
-- esta tabla NO recibe GRANT explícito a service_role en esta migración porque,
-- a la fecha, ningún código de aplicación la lee ni escribe (no hay repositorio,
-- mapper ni referencia en el dispatcher n8n — packages/infrastructure/src/n8n/
-- n8n-webhook-dispatcher.ts resuelve credenciales por variables de entorno, no
-- por esta tabla). Se seguirá el mismo principio de mínimo privilegio: el GRANT
-- a service_role se añadirá en la migración correspondiente cuando exista un
-- consumidor real (gestión de credenciales vía Supabase Vault, deuda técnica
-- Phase 6E/6F — fuera de alcance de este cierre de Phase 6 local staging).

-- =============================================================================
-- SECCIÓN G — ROW LEVEL SECURITY
-- =============================================================================

-- ── G1. automation_executions ─────────────────────────────────────────────────

ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

-- SELECT: miembros activos de la organización (cualquier rol)
DROP POLICY IF EXISTS exec_select ON public.automation_executions;
CREATE POLICY exec_select ON public.automation_executions
  FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));

-- INSERT: operator, strategist, admin, owner (viewers no pueden crear ejecuciones)
DROP POLICY IF EXISTS exec_insert ON public.automation_executions;
CREATE POLICY exec_insert ON public.automation_executions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_organization_role(organization_id, 'operator')
    AND (
      client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = client_id
          AND c.organization_id = organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

-- UPDATE: admin, owner (actualizar estado de ejecución es operación privilegiada)
DROP POLICY IF EXISTS exec_update ON public.automation_executions;
CREATE POLICY exec_update ON public.automation_executions
  FOR UPDATE TO authenticated
  USING  (public.has_organization_role(organization_id, 'admin'))
  WITH CHECK (public.has_organization_role(organization_id, 'admin'));

-- ── G2. automation_execution_logs ────────────────────────────────────────────

ALTER TABLE public.automation_execution_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: miembros activos (readonly — logs son de solo lectura para UI)
DROP POLICY IF EXISTS exec_logs_select ON public.automation_execution_logs;
CREATE POLICY exec_logs_select ON public.automation_execution_logs
  FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));

-- INSERT: bloqueado para authenticated — solo service_role (webhook route)
-- No se crea política INSERT para authenticated → acceso denegado por defecto con RLS activo.

-- ── G3. automation_webhook_events — RLS habilitado, sin políticas para authenticated ──

-- RLS habilitado. No se crean políticas para 'authenticated' — el acceso está
-- bloqueado por defecto cuando RLS está activo y no hay política aplicable.
-- service_role omite RLS por diseño (Supabase) — es el único actor autorizado
-- para leer/escribir esta tabla (webhook route Phase 6C con verificación HMAC).
-- REVOKE ALL en sección E4 actúa como defensa en profundidad: incluso si RLS
-- se desactivara accidentalmente, authenticated no tendría acceso.
ALTER TABLE public.automation_webhook_events ENABLE ROW LEVEL SECURITY;

-- ── G4. automation_secrets_metadata ──────────────────────────────────────────

ALTER TABLE public.automation_secrets_metadata ENABLE ROW LEVEL SECURITY;

-- SELECT: admin y owner únicamente (secretos son información sensible)
DROP POLICY IF EXISTS secrets_meta_select ON public.automation_secrets_metadata;
CREATE POLICY secrets_meta_select ON public.automation_secrets_metadata
  FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id, 'admin'));

-- INSERT: admin y owner
DROP POLICY IF EXISTS secrets_meta_insert ON public.automation_secrets_metadata;
CREATE POLICY secrets_meta_insert ON public.automation_secrets_metadata
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_organization_role(organization_id, 'admin')
    AND (
      automation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.automations a
        WHERE a.id              = automation_id
          AND a.organization_id = organization_id
      )
    )
  );

-- UPDATE: admin y owner
DROP POLICY IF EXISTS secrets_meta_update ON public.automation_secrets_metadata;
CREATE POLICY secrets_meta_update ON public.automation_secrets_metadata
  FOR UPDATE TO authenticated
  USING  (public.has_organization_role(organization_id, 'admin'))
  WITH CHECK (public.has_organization_role(organization_id, 'admin'));

-- =============================================================================
-- SECCIÓN H — COMENTARIOS DE DOCUMENTACIÓN
-- =============================================================================

COMMENT ON TABLE public.automation_executions IS
  'Phase 6B: Registro de cada intento de ejecución de una automatización. '
  'Fuente de verdad del runtime. idempotency_key es ÚNICO por (organization_id, key). '
  'error_message sanitizado — sin secretos ni stack traces.';

COMMENT ON TABLE public.automation_execution_logs IS
  'Phase 6B: Log de eventos por ejecución. Máx 2000 chars por mensaje. '
  'Sin secretos, tokens, PII ni payloads crudos en metadata. '
  'Retención sugerida: 30 días para logs INFO, indefinido para ERROR hasta resolución.';

COMMENT ON TABLE public.automation_webhook_events IS
  'Phase 6B: Auditoría de webhooks recibidos de n8n. RLS habilitado, sin políticas '
  'para authenticated — acceso exclusivo vía service_role (webhook route Phase 6C + HMAC). '
  'payload_hash = SHA-256 del body. No se almacena payload crudo. '
  'Retención sugerida: 7 días.';

COMMENT ON TABLE public.automation_secrets_metadata IS
  'Phase 6B: SOLO referencias a secretos (IDs en vault.secrets). '
  'NUNCA almacenar: secret_value, token_value, api_key, password. '
  'Acceso limitado a admin y owner.';

COMMENT ON COLUMN public.automation_executions.idempotency_key IS
  'Clave de deduplicación. UNIQUE por (organization_id, key). '
  'Formato recomendado: automationId:triggerType:date:attempt.';

COMMENT ON COLUMN public.automation_secrets_metadata.vault_reference IS
  'ID del secreto en Supabase Vault (vault.secrets). No es el secreto mismo.';

-- =============================================================================
-- DEUDA TÉCNICA (Phase 6E)
-- =============================================================================
--
-- 1. El enum public.automation_status aún contiene 'error' y 'disabled'.
--    Retirarlos requiere: (a) confirmar 0 filas con esos valores, (b) recrear el tipo
--    en PostgreSQL < 16 (no hay DROP VALUE) o usar pg_catalog en 16+.
--    Documentado en PHASE_6_RISK_REGISTER.md.
--
-- 2. 'inactive' permanece en el enum aunque no haya filas con ese valor post-migración.
--    Se retira junto con 'error' y 'disabled' en Phase 6E.
--
-- 3. last_execution_id (FK circular automations ↔ automation_executions) se añade
--    en Phase 6C una vez que el dispatcher comience a escribir ejecuciones.
--
-- 4. Retención de automation_execution_logs: pg_cron o job n8n (Phase 6G).
--
-- =============================================================================
-- DOWN / ROLLBACK
-- =============================================================================
--
-- Para revertir esta migración de forma controlada (orden inverso):
--
-- 1. Eliminar tablas nuevas (preserva automations existente):
--    DROP TABLE IF EXISTS public.automation_secrets_metadata CASCADE;
--    DROP TABLE IF EXISTS public.automation_webhook_events CASCADE;
--    DROP TABLE IF EXISTS public.automation_execution_logs CASCADE;
--    DROP TABLE IF EXISTS public.automation_executions CASCADE;
--
-- 2. Revertir columnas añadidas a automations:
--    ALTER TABLE public.automations
--      DROP COLUMN IF EXISTS trigger_config,
--      DROP COLUMN IF EXISTS retry_policy,
--      DROP COLUMN IF EXISTS n8n_workflow_id,
--      DROP COLUMN IF EXISTS metadata,
--      DROP COLUMN IF EXISTS is_manual_only,
--      DROP COLUMN IF EXISTS last_executed_at;
--
-- 3. Revertir filas de status (paused → inactive):
--    -- ADVERTENCIA: Si se crearon nuevas filas con status='paused' después de la migración,
--    -- revertir todas a 'inactive' puede ser incorrecto. Requiere decisión explícita.
--    UPDATE public.automations SET status = 'inactive' WHERE status = 'paused';
--    -- NOTA: Las filas con status='draft' o 'archived' (nuevos valores) no pueden
--    -- revertirse automáticamente porque 'draft' e 'inactive'/'archived' no son equivalentes.
--
-- 4. Los valores 'draft' y 'archived' del enum NO pueden eliminarse en PostgreSQL sin
--    recrear el tipo. Documentar como incompatibilidad de rollback.
--    Workaround: CREATE TYPE public.automation_status_v2 AS ENUM (old values) y migrar.
--
-- Para rollback controlado en producción: crear runbook explícito antes de ejecutar.
-- =============================================================================
