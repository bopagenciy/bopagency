-- ============================================================
-- Phase 4 — Data Migration Target Tables (v3 — revisión final)
-- ============================================================
-- NO modifica tablas existentes de Fase 2 o Fase 3.
-- Re-ejecutable: CREATE TABLE IF NOT EXISTS / DROP IF EXISTS.
--
-- CORRECCIONES v3 (2026-07-30):
--  #1  Inmutabilidad completa: protect_p4_core_immutable() cubre
--      id, organization_id, created_at en TODAS las tablas Phase 4.
--  #2  legacy_source, legacy_id y legacy_path protegidos por
--      funciones dedicadas por grupo de tabla.
--  #3  Subqueries de cliente activo incluyen c.organization_id.
--  #4  Referencias calificadas: <tabla>.client_id / <tabla>.organization_id
--      dentro de subqueries de USING y WITH CHECK.
--  #5  RPCs acknowledge_alert() y resolve_alert() para mutar campos
--      de auditoría en alertas; trigger bloquea UPDATE directo.
--  #6  platform CHECK: solo IN(enum), sin OR bypass de longitud.
--  #7  report_recipients.email normalizado a lower(trim()) via
--      trigger BEFORE INSERT OR UPDATE; CHECK de consistencia añadido;
--      índices únicos sobre lower(email).
--  #8  ON DELETE RESTRICT en client_id para todas las tablas Phase 4
--      (elimina contradicción con inmutabilidad; sistema usa soft-delete).
--  #9  REVOKE ALL ON <tabla> FROM anon, authenticated antes de cada GRANT.
-- #10  migration_runs / migration_records: GRANT SELECT solo a authenticated
--      (sin INSERT/UPDATE); service_role escribe vía bypass RLS.
-- #11  DROP TRIGGER/POLICY IF EXISTS mantenido; nombres con prefijo numérico
--      para garantizar orden de ejecución (triggers BEFORE son alfabéticos).
-- #12  NO ejecutar SQL remoto.
-- ============================================================

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM (
    'pending', 'in_progress', 'done', 'cancelled', 'blocked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM (
    'low', 'medium', 'high', 'urgent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_type AS ENUM (
    'weekly', 'monthly', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM (
    'draft', 'generated', 'sent', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.alert_severity AS ENUM (
    'info', 'warning', 'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.alert_status AS ENUM (
    'active', 'acknowledged', 'snoozed', 'resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.agent_type AS ENUM (
    'specialist', 'strategist', 'analyst', 'creative', 'manager', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.automation_status AS ENUM (
    'active', 'paused', 'error', 'disabled', 'inactive'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.migration_action AS ENUM (
    'insert', 'update', 'skip', 'skip-preexisting', 'conflict', 'error',
    'excluded', 'excluded-secret', 'excluded-contaminated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.migration_mode AS ENUM ('dry_run', 'execute');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.migration_run_status AS ENUM (
    'pending', 'running', 'completed', 'failed', 'rolled_back'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Funciones de trigger — sin dependencias de tabla ────────────────────────

-- #1 Inmutabilidad base para TODAS las tablas Phase 4.
-- Protege id, organization_id, created_at en UPDATE.
CREATE OR REPLACE FUNCTION public.protect_p4_core_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION
      'protect_p4_core_immutable: id es inmutable (tabla: %, id: %)',
      TG_TABLE_NAME, OLD.id;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION
      'protect_p4_core_immutable: organization_id es inmutable (tabla: %, id: %)',
      TG_TABLE_NAME, OLD.id;
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'protect_p4_core_immutable: created_at es inmutable (tabla: %, id: %)',
      TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_p4_core_immutable() IS
  'BEFORE UPDATE en todas las tablas Phase 4. '
  'Bloquea mutaciones de id, organization_id, created_at.';

-- #1 + created_by: protege created_by en tablas que lo tienen (tasks, migration_runs).
CREATE OR REPLACE FUNCTION public.protect_p4_created_by_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION
      'protect_p4_created_by_immutable: created_by es inmutable (tabla: %, id: %)',
      TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_p4_created_by_immutable() IS
  'BEFORE UPDATE en tablas con created_by (tasks, migration_runs). '
  'Bloquea mutaciones de created_by post-insert.';

-- #1 Gestión de created_by / updated_by para tasks (única tabla operacional con actor).
-- Patrón idéntico a manage_client_write() de Phase 3:
--   auth.uid() IS NOT NULL (browser/usuario) → sobreescribe.
--   auth.uid() IS NULL (service_role)         → mantiene valor suministrado.
CREATE OR REPLACE FUNCTION public.manage_phase4_write()
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
    -- service_role: mantiene valor suministrado (puede ser NULL en datos importados)
    RETURN NEW;
  END IF;

  -- UPDATE: solo actualiza updated_by; created_by es inmutable (cubierto por
  -- protect_p4_created_by_immutable que corre en el mismo evento BEFORE UPDATE).
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.manage_phase4_write() IS
  'BEFORE INSERT OR UPDATE en tasks. '
  'INSERT: asigna created_by/updated_by si auth.uid() IS NOT NULL. '
  'UPDATE: actualiza updated_by. created_by protegido por trigger separado.';

-- #2 Inmutabilidad de client_id para todas las tablas con ese campo.
-- Se aplica en tablas donde client_id puede ser NULL (nullable) o NOT NULL.
-- ON DELETE RESTRICT (#8) elimina la contradicción con SET NULL.
CREATE OR REPLACE FUNCTION public.protect_p4_client_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION
      'protect_p4_client_id: client_id es inmutable '
      '(tabla: %, id: %)', TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_p4_client_id() IS
  'BEFORE UPDATE en tablas con client_id (Phase 4). '
  'Bloquea cualquier cambio post-insert, incluyendo NULL→uuid o uuid→uuid.';

-- #2 Inmutabilidad de legacy_path (tablas con solo ese campo legacy).
-- Aplica a: client_metrics, alerts, agents, skills, templates.
CREATE OR REPLACE FUNCTION public.protect_p4_legacy_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.legacy_path IS DISTINCT FROM OLD.legacy_path THEN
    RAISE EXCEPTION
      'protect_p4_legacy_path: legacy_path es inmutable '
      '(tabla: %, id: %)', TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_p4_legacy_path() IS
  'BEFORE UPDATE en tablas con solo legacy_path (client_metrics, alerts, agents, skills, templates). '
  'Bloquea cambios al campo legacy de origen.';

-- #2 Inmutabilidad de legacy_id + legacy_path.
-- Aplica a: reports (legacy_id, legacy_path), automations (legacy_id, legacy_path).
CREATE OR REPLACE FUNCTION public.protect_p4_legacy_id_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.legacy_id IS DISTINCT FROM OLD.legacy_id THEN
    RAISE EXCEPTION
      'protect_p4_legacy_id_path: legacy_id es inmutable '
      '(tabla: %, id: %)', TG_TABLE_NAME, OLD.id;
  END IF;
  IF NEW.legacy_path IS DISTINCT FROM OLD.legacy_path THEN
    RAISE EXCEPTION
      'protect_p4_legacy_id_path: legacy_path es inmutable '
      '(tabla: %, id: %)', TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_p4_legacy_id_path() IS
  'BEFORE UPDATE en tablas con legacy_id + legacy_path (reports, automations). '
  'Bloquea cambios a ambos campos de origen.';

-- #2 Inmutabilidad de legacy_source + legacy_id + legacy_path.
-- Aplica exclusivamente a: tasks.
CREATE OR REPLACE FUNCTION public.protect_p4_tasks_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.legacy_source IS DISTINCT FROM OLD.legacy_source THEN
    RAISE EXCEPTION
      'protect_p4_tasks_legacy: legacy_source es inmutable (id: %)', OLD.id;
  END IF;
  IF NEW.legacy_id IS DISTINCT FROM OLD.legacy_id THEN
    RAISE EXCEPTION
      'protect_p4_tasks_legacy: legacy_id es inmutable (id: %)', OLD.id;
  END IF;
  IF NEW.legacy_path IS DISTINCT FROM OLD.legacy_path THEN
    RAISE EXCEPTION
      'protect_p4_tasks_legacy: legacy_path es inmutable (id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_p4_tasks_legacy() IS
  'BEFORE UPDATE en tasks. Bloquea cambios a legacy_source, legacy_id, legacy_path.';

-- #5 Protege acknowledged_by/at y resolved_by/at contra UPDATE directo.
-- Permite bypass cuando:
--   (a) service_role (auth.uid() IS NULL) — migración de alertas históricas.
--   (b) RPC autorizado vía SET LOCAL app.phase4_alert_bypass = 'true'.
CREATE OR REPLACE FUNCTION public.protect_alerts_audit_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role (scripts de migración) puede establecer cualquier campo
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- RPCs acknowledge_alert / resolve_alert activan bypass en la transacción
  IF current_setting('app.phase4_alert_bypass', true) = 'true' THEN
    RETURN NEW;
  END IF;
  -- Bloquear mutación directa desde cliente autenticado
  IF NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by THEN
    RAISE EXCEPTION
      'alerts: acknowledged_by solo puede modificarse via acknowledge_alert() RPC';
  END IF;
  IF NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
    RAISE EXCEPTION
      'alerts: acknowledged_at solo puede modificarse via acknowledge_alert() RPC';
  END IF;
  IF NEW.resolved_by IS DISTINCT FROM OLD.resolved_by THEN
    RAISE EXCEPTION
      'alerts: resolved_by solo puede modificarse via resolve_alert() RPC';
  END IF;
  IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN
    RAISE EXCEPTION
      'alerts: resolved_at solo puede modificarse via resolve_alert() RPC';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_alerts_audit_fields() IS
  'BEFORE UPDATE en alerts. Impide que UPDATE genérico falsifique '
  'acknowledged_by/at y resolved_by/at. '
  'Autorizado: service_role (auth.uid() IS NULL) y RPCs con bypass.';

-- #7 Normalización de email a lower(trim()) antes de persistir.
CREATE OR REPLACE FUNCTION public.normalize_report_recipient_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email = lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.normalize_report_recipient_email() IS
  'BEFORE INSERT OR UPDATE en report_recipients. '
  'Normaliza email = lower(trim(email)) antes de cualquier constraint o index.';

-- ─── Tablas ───────────────────────────────────────────────────────────────────

-- ─── tasks ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tasks (
  id                uuid               NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid               NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- #8 ON DELETE RESTRICT: eliminación física de clientes bloqueada (sistema usa soft-delete)
  client_id         uuid                   NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  title             text               NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  description       text                   NULL CHECK (description IS NULL OR char_length(description) <= 10000),
  status            public.task_status     NOT NULL DEFAULT 'pending',
  priority          public.task_priority   NOT NULL DEFAULT 'medium',
  due_date          date                   NULL,
  tags              text[]             NOT NULL DEFAULT '{}',
  -- #2 legacy_source, legacy_id, legacy_path — protegidos por protect_p4_tasks_legacy()
  legacy_source     text                   NULL CHECK (legacy_source IS NULL OR char_length(legacy_source) <= 100),
  legacy_id         text                   NULL CHECK (legacy_id IS NULL OR char_length(legacy_id) <= 255),
  legacy_path       text                   NULL CHECK (legacy_path IS NULL OR char_length(legacy_path) <= 1000),
  migrated_at       timestamptz            NULL,
  migration_version text                   NULL,
  -- #1 created_by nullable: NULL cuando importado por service_role sin actor conocido
  created_by        uuid                   NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        uuid                   NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz        NOT NULL DEFAULT now(),
  updated_at        timestamptz        NOT NULL DEFAULT now(),
  deleted_at        timestamptz            NULL,
  CONSTRAINT tasks_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_legacy
  ON public.tasks(organization_id, legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_client_id       ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status          ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at      ON public.tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_org_client_status
  ON public.tasks(organization_id, client_id, status)
  WHERE deleted_at IS NULL;

-- ─── client_metrics ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_metrics (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  -- #8 ON DELETE RESTRICT
  client_id       uuid        NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- #6 platform: solo enum definido, sin OR fallback de longitud
  platform        text        NOT NULL
    CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin', 'twitter', 'other')),
  account_id      text        NOT NULL CHECK (char_length(account_id) BETWEEN 1 AND 100),
  account_name    text            NULL CHECK (account_name IS NULL OR char_length(account_name) <= 255),
  period_start    date        NOT NULL,
  period_end      date        NOT NULL,
  currency        text        NOT NULL DEFAULT 'COP' CHECK (currency ~ '^[A-Z]{3}$'),
  metrics         jsonb       NOT NULL DEFAULT '{}',
  campaigns       jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(campaigns) = 'array'),
  data_quality    jsonb           NULL CHECK (data_quality IS NULL OR jsonb_typeof(data_quality) = 'object'),
  -- #2 legacy_path — protegido por protect_p4_legacy_path()
  legacy_path     text            NULL CHECK (legacy_path IS NULL OR char_length(legacy_path) <= 1000),
  migrated_at     timestamptz     NULL,
  migration_version text          NULL,
  source_hash     text            NULL CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT ck_client_metrics_metrics_obj CHECK (jsonb_typeof(metrics) = 'object'),
  CONSTRAINT ck_client_metrics_period      CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_metrics_period
  ON public.client_metrics(client_id, platform, account_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_client_metrics_client_id  ON public.client_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_client_metrics_platform   ON public.client_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_client_metrics_period     ON public.client_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_client_metrics_org_client_period
  ON public.client_metrics(organization_id, client_id, period_start, period_end);

-- ─── alerts ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.alerts (
  id              uuid                   NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid                   NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- #8 ON DELETE RESTRICT
  client_id       uuid                       NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  alert_key       text                   NOT NULL CHECK (char_length(alert_key) BETWEEN 1 AND 255),
  alert_type      text                   NOT NULL CHECK (char_length(alert_type) BETWEEN 1 AND 100),
  severity        public.alert_severity  NOT NULL DEFAULT 'info',
  status          public.alert_status    NOT NULL DEFAULT 'active',
  title           text                       NULL CHECK (title IS NULL OR char_length(title) <= 500),
  description     text                       NULL CHECK (description IS NULL OR char_length(description) <= 10000),
  -- #6 platform: solo enum, sin OR fallback
  platform        text                       NULL
    CHECK (platform IS NULL OR platform IN ('meta', 'google', 'tiktok', 'linkedin', 'twitter', 'other')),
  account_id      text                       NULL CHECK (account_id IS NULL OR char_length(account_id) <= 100),
  detected_at     timestamptz                NULL,
  -- #5 acknowledged_by/at y resolved_by/at: solo mutables via RPCs
  acknowledged_at timestamptz                NULL,
  acknowledged_by uuid                       NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  snoozed_until   timestamptz                NULL,
  resolved_at     timestamptz                NULL,
  resolved_by     uuid                       NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata        jsonb                  NOT NULL DEFAULT '{}',
  -- #2 legacy_path — protegido por protect_p4_legacy_path()
  legacy_path     text                       NULL CHECK (legacy_path IS NULL OR char_length(legacy_path) <= 1000),
  migrated_at     timestamptz                NULL,
  migration_version text                      NULL,
  source_hash     text                       NULL CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz            NOT NULL DEFAULT now(),
  updated_at      timestamptz            NOT NULL DEFAULT now(),
  CONSTRAINT alerts_pkey PRIMARY KEY (id),
  CONSTRAINT ck_alerts_metadata_obj CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_key
  ON public.alerts(organization_id, alert_key);

CREATE INDEX IF NOT EXISTS idx_alerts_organization_id ON public.alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_alerts_client_id       ON public.alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status          ON public.alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_org_client_status
  ON public.alerts(organization_id, client_id, status);

-- ─── reports ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reports (
  id              uuid                  NOT NULL DEFAULT gen_random_uuid(),
  -- #8 ON DELETE RESTRICT
  client_id       uuid                  NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  organization_id uuid                  NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_type     public.report_type    NOT NULL,
  status          public.report_status  NOT NULL DEFAULT 'generated',
  period_label    text                      NULL CHECK (period_label IS NULL OR char_length(period_label) <= 100),
  period_start    date                  NOT NULL,
  period_end      date                  NOT NULL,
  currency        text                  NOT NULL DEFAULT 'COP' CHECK (currency ~ '^[A-Z]{3}$'),
  generated_at    timestamptz               NULL,
  summary         jsonb                 NOT NULL DEFAULT '{}',
  payload         jsonb                     NULL CHECK (payload IS NULL OR jsonb_typeof(payload) = 'object'),
  -- Auditoría: shared-data/reports/clients/ contiene solo JSON, sin Markdown.
  -- content_markdown NO añadido (sin archivos .md en reportes).
  -- #2 legacy_id + legacy_path — protegidos por protect_p4_legacy_id_path()
  legacy_id       text                      NULL CHECK (legacy_id IS NULL OR char_length(legacy_id) <= 255),
  legacy_path     text                      NULL CHECK (legacy_path IS NULL OR char_length(legacy_path) <= 1000),
  migrated_at     timestamptz               NULL,
  migration_version text                     NULL,
  source_hash     text                      NULL CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz           NOT NULL DEFAULT now(),
  updated_at      timestamptz           NOT NULL DEFAULT now(),
  CONSTRAINT reports_pkey PRIMARY KEY (id),
  CONSTRAINT ck_reports_period      CHECK (period_end >= period_start),
  CONSTRAINT ck_reports_summary_obj CHECK (jsonb_typeof(summary) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_period
  ON public.reports(client_id, report_type, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_reports_client_id  ON public.reports(client_id);
CREATE INDEX IF NOT EXISTS idx_reports_type       ON public.reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_period     ON public.reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_reports_org_client_period
  ON public.reports(organization_id, client_id, period_start, period_end);

-- ─── report_recipients ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.report_recipients (
  id              uuid             NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid             NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- #8 ON DELETE RESTRICT
  client_id       uuid                 NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  -- #7 email almacenado siempre normalizado (lower + trim) via trigger.
  --    CHECK de formato y CHECK de normalización como doble garantía.
  email           text             NOT NULL
    CHECK (
      email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      AND char_length(email) <= 254
      AND email = lower(trim(email))        -- refuerza normalización; el trigger la aplica primero
    ),
  report_types    public.report_type[] NOT NULL DEFAULT '{}',
  is_active       boolean          NOT NULL DEFAULT true,
  migrated_at     timestamptz          NULL,
  migration_version text                NULL,
  created_at      timestamptz      NOT NULL DEFAULT now(),
  updated_at      timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT report_recipients_pkey PRIMARY KEY (id)
);

-- #7 Índices únicos sobre lower(email) para robustez ante futuras inserciones sin trigger
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_recipients_email_norm
  ON public.report_recipients(organization_id, client_id, lower(email))
  WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_report_recipients_email_org_norm
  ON public.report_recipients(organization_id, lower(email))
  WHERE client_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_recipients_org ON public.report_recipients(organization_id);

-- ─── agents ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agents (
  id              uuid               NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid                   NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug            text               NOT NULL
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$' OR slug ~ '^[a-z0-9]$'),
  name            text               NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  agent_type      public.agent_type  NOT NULL DEFAULT 'specialist',
  description     text                   NULL CHECK (description IS NULL OR char_length(description) <= 2000),
  content         text               NOT NULL DEFAULT '',
  is_global       boolean            NOT NULL DEFAULT false,
  is_active       boolean            NOT NULL DEFAULT true,
  -- #2 legacy_path — protegido por protect_p4_legacy_path()
  legacy_path     text                   NULL CHECK (legacy_path IS NULL OR char_length(legacy_path) <= 1000),
  migrated_at     timestamptz            NULL,
  migration_version text                  NULL,
  source_hash     text                   NULL CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz        NOT NULL DEFAULT now(),
  updated_at      timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT agents_pkey PRIMARY KEY (id),
  -- #5 Global scope: is_global=true ↔ organization_id IS NULL (sin excepción)
  CONSTRAINT ck_agents_global_scope CHECK (
    (is_global = true  AND organization_id IS NULL) OR
    (is_global = false AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_org_slug
  ON public.agents(organization_id, slug)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_global_slug
  ON public.agents(slug)
  WHERE organization_id IS NULL AND is_global = true;

CREATE INDEX IF NOT EXISTS idx_agents_org ON public.agents(organization_id);

-- ─── skills ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.skills (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid            NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug            text        NOT NULL
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$' OR slug ~ '^[a-z0-9]$'),
  name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  description     text            NULL CHECK (description IS NULL OR char_length(description) <= 2000),
  content         text        NOT NULL DEFAULT '',
  is_global       boolean     NOT NULL DEFAULT false,
  is_active       boolean     NOT NULL DEFAULT true,
  -- #2 legacy_path — protegido por protect_p4_legacy_path()
  legacy_path     text            NULL CHECK (legacy_path IS NULL OR char_length(legacy_path) <= 1000),
  migrated_at     timestamptz     NULL,
  migration_version text           NULL,
  source_hash     text            NULL CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skills_pkey PRIMARY KEY (id),
  CONSTRAINT ck_skills_global_scope CHECK (
    (is_global = true  AND organization_id IS NULL) OR
    (is_global = false AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_skills_org_slug
  ON public.skills(organization_id, slug)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_skills_global_slug
  ON public.skills(slug)
  WHERE organization_id IS NULL AND is_global = true;

CREATE INDEX IF NOT EXISTS idx_skills_org ON public.skills(organization_id);

-- ─── templates ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.templates (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid            NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug            text        NOT NULL
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$' OR slug ~ '^[a-z0-9]$'),
  name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  template_type   text        NOT NULL DEFAULT 'custom' CHECK (char_length(template_type) <= 50),
  description     text            NULL CHECK (description IS NULL OR char_length(description) <= 2000),
  content         text        NOT NULL DEFAULT '',
  is_global       boolean     NOT NULL DEFAULT false,
  is_active       boolean     NOT NULL DEFAULT true,
  -- #2 legacy_path — protegido por protect_p4_legacy_path()
  legacy_path     text            NULL CHECK (legacy_path IS NULL OR char_length(legacy_path) <= 1000),
  migrated_at     timestamptz     NULL,
  migration_version text           NULL,
  source_hash     text            NULL CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT templates_pkey PRIMARY KEY (id),
  CONSTRAINT ck_templates_global_scope CHECK (
    (is_global = true  AND organization_id IS NULL) OR
    (is_global = false AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_templates_org_slug
  ON public.templates(organization_id, slug)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_templates_global_slug
  ON public.templates(slug)
  WHERE organization_id IS NULL AND is_global = true;

CREATE INDEX IF NOT EXISTS idx_templates_org ON public.templates(organization_id);

-- ─── automations ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.automations (
  id              uuid                       NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid                       NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- #8 ON DELETE RESTRICT
  client_id       uuid                           NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  -- #2 legacy_id es clave de deduplicación de n8n — inmutable via protect_p4_legacy_id_path()
  legacy_id       text                       NOT NULL CHECK (char_length(legacy_id) BETWEEN 1 AND 255),
  name            text                       NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  description     text                           NULL CHECK (description IS NULL OR char_length(description) <= 2000),
  category        text                           NULL CHECK (category IS NULL OR char_length(category) <= 100),
  provider        text                       NOT NULL DEFAULT 'n8n'
    CHECK (provider ~ '^[a-z][a-z0-9_-]{0,48}$'),
  workflow_id     text                           NULL CHECK (workflow_id IS NULL OR char_length(workflow_id) <= 255),
  status          public.automation_status   NOT NULL DEFAULT 'inactive',
  schedule        jsonb                      NOT NULL DEFAULT '{}',
  health          jsonb                          NULL CHECK (health IS NULL OR jsonb_typeof(health) = 'object'),
  links           jsonb                          NULL CHECK (links IS NULL OR jsonb_typeof(links) = 'object'),
  -- #2 legacy_path — protegido junto con legacy_id por protect_p4_legacy_id_path()
  legacy_path     text                           NULL CHECK (legacy_path IS NULL OR char_length(legacy_path) <= 1000),
  migrated_at     timestamptz                    NULL,
  migration_version text                          NULL,
  source_hash     text                           NULL CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz                NOT NULL DEFAULT now(),
  updated_at      timestamptz                NOT NULL DEFAULT now(),
  CONSTRAINT automations_pkey PRIMARY KEY (id),
  CONSTRAINT ck_automations_schedule_obj CHECK (jsonb_typeof(schedule) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_automations_legacy
  ON public.automations(organization_id, legacy_id);

CREATE INDEX IF NOT EXISTS idx_automations_org          ON public.automations(organization_id);
CREATE INDEX IF NOT EXISTS idx_automations_client       ON public.automations(client_id);
CREATE INDEX IF NOT EXISTS idx_automations_status       ON public.automations(status);
CREATE INDEX IF NOT EXISTS idx_automations_org_client_status
  ON public.automations(organization_id, client_id, status);

-- ─── migration_runs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.migration_runs (
  id                uuid                         NOT NULL DEFAULT gen_random_uuid(),
  migration_name    text                         NOT NULL CHECK (char_length(migration_name) BETWEEN 1 AND 255),
  migration_version text                         NOT NULL CHECK (char_length(migration_version) BETWEEN 1 AND 50),
  organization_id   uuid                         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mode              public.migration_mode        NOT NULL DEFAULT 'dry_run',
  status            public.migration_run_status  NOT NULL DEFAULT 'pending',
  started_at        timestamptz                  NOT NULL DEFAULT now(),
  completed_at      timestamptz                      NULL,
  -- #1 created_by nullable: service_role no tiene auth.uid()
  created_by        uuid                             NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source_summary    jsonb                        NOT NULL DEFAULT '{}',
  result_summary    jsonb                        NOT NULL DEFAULT '{}',
  error_summary     jsonb                        NOT NULL DEFAULT '{}',
  created_at        timestamptz                  NOT NULL DEFAULT now(),
  updated_at        timestamptz                  NOT NULL DEFAULT now(),
  CONSTRAINT migration_runs_pkey PRIMARY KEY (id),
  CONSTRAINT ck_migration_runs_source_obj CHECK (jsonb_typeof(source_summary) = 'object'),
  CONSTRAINT ck_migration_runs_result_obj CHECK (jsonb_typeof(result_summary) = 'object'),
  CONSTRAINT ck_migration_runs_error_obj  CHECK (jsonb_typeof(error_summary)  = 'object')
);

CREATE INDEX IF NOT EXISTS idx_migration_runs_org    ON public.migration_runs(organization_id);
CREATE INDEX IF NOT EXISTS idx_migration_runs_status ON public.migration_runs(status);

-- ─── migration_records ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.migration_records (
  id                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  run_id            uuid                     NOT NULL REFERENCES public.migration_runs(id) ON DELETE CASCADE,
  -- #4 (v3) FK a organizations; coherencia verificada por trigger check_p4_migration_record_org()
  organization_id   uuid                     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type       text                     NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 100),
  source_path       text                     NOT NULL CHECK (char_length(source_path) BETWEEN 1 AND 1000),
  source_key        text                     NOT NULL CHECK (char_length(source_key)  BETWEEN 1 AND 255),
  source_hash       text                         NULL CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  target_table      text                     NOT NULL CHECK (char_length(target_table) BETWEEN 1 AND 100),
  target_id         uuid                         NULL,
  action            public.migration_action  NOT NULL,
  error_code        text                         NULL CHECK (error_code IS NULL OR char_length(error_code) <= 50),
  -- error_message sanitizado: nunca contiene secretos ni rutas absolutas completas
  error_message     text                         NULL CHECK (error_message IS NULL OR char_length(error_message) <= 2000),
  created_at        timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT migration_records_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_migration_records_key
  ON public.migration_records(run_id, source_path, source_key);

CREATE INDEX IF NOT EXISTS idx_migration_records_run_id ON public.migration_records(run_id);
CREATE INDEX IF NOT EXISTS idx_migration_records_action ON public.migration_records(action);
CREATE INDEX IF NOT EXISTS idx_migration_records_target ON public.migration_records(target_table, target_id);

-- ─── Funciones que referencian tablas ────────────────────────────────────────
-- (creadas después de las tablas porque PL/pgSQL resuelve referencias en ejecución,
--  pero se documentan aquí para claridad)

-- #4 Consistencia migration_records.organization_id ↔ migration_runs.organization_id.
-- También protege run_id y organization_id contra mutación post-insert.
CREATE OR REPLACE FUNCTION public.check_p4_migration_record_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_org_id uuid;
BEGIN
  -- UPDATE: run_id y organization_id son inmutables
  IF TG_OP = 'UPDATE' THEN
    IF NEW.run_id IS DISTINCT FROM OLD.run_id THEN
      RAISE EXCEPTION 'check_p4_migration_record_org: run_id es inmutable';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'check_p4_migration_record_org: organization_id es inmutable';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: verificar coherencia
  SELECT organization_id INTO v_run_org_id
  FROM public.migration_runs
  WHERE id = NEW.run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'check_p4_migration_record_org: migration_run no encontrado (run_id: %)', NEW.run_id;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_run_org_id THEN
    RAISE EXCEPTION
      'check_p4_migration_record_org: organization_id no coincide con migration_run '
      '(record: %, run: %)', NEW.organization_id, v_run_org_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_p4_migration_record_org() IS
  'BEFORE INSERT OR UPDATE en migration_records. '
  'INSERT: verifica que organization_id coincida con migration_runs.organization_id. '
  'UPDATE: bloquea cambios a run_id y organization_id.';

-- #5 RPC — acknowledge_alert
-- SECURITY DEFINER para poder hacer SET LOCAL sin requerir SUPERUSER.
-- Solo autentica si auth.uid() IS NOT NULL (authenticated users).
CREATE OR REPLACE FUNCTION public.acknowledge_alert(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'acknowledge_alert: autenticación requerida';
  END IF;

  -- #3/#4 Verificar que el usuario es miembro de la org y la alerta está activa.
  -- alerts no tiene deleted_at (usa alert_key único para deduplicación).
  IF NOT EXISTS (
    SELECT 1
    FROM public.alerts a
    WHERE a.id = p_alert_id
      AND is_organization_member(a.organization_id)
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION
      'acknowledge_alert: alerta no encontrada, ya procesada, o sin permisos (id: %)',
      p_alert_id;
  END IF;

  -- Activar bypass de protect_alerts_audit_fields para esta transacción
  PERFORM set_config('app.phase4_alert_bypass', 'true', true);

  UPDATE public.alerts
  SET
    status          = 'acknowledged',
    acknowledged_by = auth.uid(),
    acknowledged_at = now()
  WHERE id = p_alert_id;
END;
$$;

COMMENT ON FUNCTION public.acknowledge_alert(uuid) IS
  'RPC para reconocer una alerta activa. '
  'Requiere auth.uid() (usuario autenticado y miembro de la org). '
  'Usa SET LOCAL bypass para el trigger protect_alerts_audit_fields.';

-- #5 RPC — resolve_alert
CREATE OR REPLACE FUNCTION public.resolve_alert(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'resolve_alert: autenticación requerida';
  END IF;

  -- Requiere rol operator+ para resolver.
  -- alerts no tiene deleted_at (no soft-delete; usa alert_key único).
  IF NOT EXISTS (
    SELECT 1
    FROM public.alerts a
    WHERE a.id = p_alert_id
      AND has_organization_role(a.organization_id, 'operator')
      AND a.status IN ('active', 'acknowledged', 'snoozed')
  ) THEN
    RAISE EXCEPTION
      'resolve_alert: alerta no encontrada, ya resuelta, o sin permisos (id: %)',
      p_alert_id;
  END IF;

  PERFORM set_config('app.phase4_alert_bypass', 'true', true);

  UPDATE public.alerts
  SET
    status      = 'resolved',
    resolved_by = auth.uid(),
    resolved_at = now()
  WHERE id = p_alert_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_alert(uuid) IS
  'RPC para resolver una alerta (activa, reconocida o snoozed). '
  'Requiere rol operator+ en la organización.';

-- ─── REVOKE / GRANT para tablas ──────────────────────────────────────────────
-- #9 REVOKE ALL antes de GRANT explícito para evitar permisos residuales.
-- #10 migration_runs y migration_records: authenticated solo SELECT.

REVOKE ALL ON public.tasks              FROM anon, authenticated;
REVOKE ALL ON public.client_metrics     FROM anon, authenticated;
REVOKE ALL ON public.alerts             FROM anon, authenticated;
REVOKE ALL ON public.reports            FROM anon, authenticated;
REVOKE ALL ON public.report_recipients  FROM anon, authenticated;
REVOKE ALL ON public.agents             FROM anon, authenticated;
REVOKE ALL ON public.skills             FROM anon, authenticated;
REVOKE ALL ON public.templates          FROM anon, authenticated;
REVOKE ALL ON public.automations        FROM anon, authenticated;
REVOKE ALL ON public.migration_runs     FROM anon, authenticated;
REVOKE ALL ON public.migration_records  FROM anon, authenticated;

-- Tablas operacionales: authenticated puede SELECT, INSERT, UPDATE (soft-delete via updated_at+deleted_at)
GRANT SELECT, INSERT, UPDATE ON public.tasks             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.client_metrics    TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.alerts            TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reports           TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.report_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agents            TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.skills            TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.templates         TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.automations       TO authenticated;

-- #10 migration_runs y migration_records: solo SELECT para authenticated
-- INSERT/UPDATE los realiza exclusivamente service_role (bypassa RLS por defecto en Supabase)
GRANT SELECT ON public.migration_runs    TO authenticated;
GRANT SELECT ON public.migration_records TO authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_metrics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_records ENABLE ROW LEVEL SECURITY;

-- ─── Policies — tasks ────────────────────────────────────────────────────────
-- #3/#4 Subqueries de cliente incluyen c.organization_id y usan referencias calificadas.

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
  USING (
    is_organization_member(tasks.organization_id)
    AND (
      tasks.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = tasks.client_id
          AND c.organization_id = tasks.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    has_organization_role(tasks.organization_id, 'operator')
    AND (
      tasks.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = tasks.client_id
          AND c.organization_id = tasks.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated
  USING (has_organization_role(tasks.organization_id, 'operator'))
  WITH CHECK (
    has_organization_role(tasks.organization_id, 'operator')
    AND (
      tasks.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = tasks.client_id
          AND c.organization_id = tasks.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

-- ─── Policies — client_metrics ────────────────────────────────────────────────

DROP POLICY IF EXISTS client_metrics_select ON public.client_metrics;
CREATE POLICY client_metrics_select ON public.client_metrics FOR SELECT TO authenticated
  USING (
    is_organization_member(client_metrics.organization_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id              = client_metrics.client_id
        AND c.organization_id = client_metrics.organization_id
        AND c.deleted_at      IS NULL
    )
  );

DROP POLICY IF EXISTS client_metrics_insert ON public.client_metrics;
CREATE POLICY client_metrics_insert ON public.client_metrics FOR INSERT TO authenticated
  WITH CHECK (
    has_organization_role(client_metrics.organization_id, 'operator')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id              = client_metrics.client_id
        AND c.organization_id = client_metrics.organization_id
        AND c.deleted_at      IS NULL
    )
  );

DROP POLICY IF EXISTS client_metrics_update ON public.client_metrics;
CREATE POLICY client_metrics_update ON public.client_metrics FOR UPDATE TO authenticated
  USING (has_organization_role(client_metrics.organization_id, 'admin'))
  WITH CHECK (
    has_organization_role(client_metrics.organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id              = client_metrics.client_id
        AND c.organization_id = client_metrics.organization_id
        AND c.deleted_at      IS NULL
    )
  );

-- ─── Policies — alerts ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS alerts_select ON public.alerts;
CREATE POLICY alerts_select ON public.alerts FOR SELECT TO authenticated
  USING (
    is_organization_member(alerts.organization_id)
    AND (
      alerts.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = alerts.client_id
          AND c.organization_id = alerts.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

DROP POLICY IF EXISTS alerts_insert ON public.alerts;
CREATE POLICY alerts_insert ON public.alerts FOR INSERT TO authenticated
  WITH CHECK (
    has_organization_role(alerts.organization_id, 'operator')
    AND (
      alerts.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = alerts.client_id
          AND c.organization_id = alerts.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

DROP POLICY IF EXISTS alerts_update ON public.alerts;
CREATE POLICY alerts_update ON public.alerts FOR UPDATE TO authenticated
  USING (has_organization_role(alerts.organization_id, 'operator'))
  WITH CHECK (
    has_organization_role(alerts.organization_id, 'operator')
    AND (
      alerts.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = alerts.client_id
          AND c.organization_id = alerts.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

-- ─── Policies — reports ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS reports_select ON public.reports;
CREATE POLICY reports_select ON public.reports FOR SELECT TO authenticated
  USING (
    is_organization_member(reports.organization_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id              = reports.client_id
        AND c.organization_id = reports.organization_id
        AND c.deleted_at      IS NULL
    )
  );

DROP POLICY IF EXISTS reports_insert ON public.reports;
CREATE POLICY reports_insert ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    has_organization_role(reports.organization_id, 'operator')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id              = reports.client_id
        AND c.organization_id = reports.organization_id
        AND c.deleted_at      IS NULL
    )
  );

DROP POLICY IF EXISTS reports_update ON public.reports;
CREATE POLICY reports_update ON public.reports FOR UPDATE TO authenticated
  USING (has_organization_role(reports.organization_id, 'operator'))
  WITH CHECK (
    has_organization_role(reports.organization_id, 'operator')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id              = reports.client_id
        AND c.organization_id = reports.organization_id
        AND c.deleted_at      IS NULL
    )
  );

-- ─── Policies — report_recipients ────────────────────────────────────────────

DROP POLICY IF EXISTS report_recipients_select ON public.report_recipients;
CREATE POLICY report_recipients_select ON public.report_recipients FOR SELECT TO authenticated
  USING (
    has_organization_role(report_recipients.organization_id, 'admin')
    AND (
      report_recipients.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = report_recipients.client_id
          AND c.organization_id = report_recipients.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

DROP POLICY IF EXISTS report_recipients_insert ON public.report_recipients;
CREATE POLICY report_recipients_insert ON public.report_recipients FOR INSERT TO authenticated
  WITH CHECK (
    has_organization_role(report_recipients.organization_id, 'admin')
    AND (
      report_recipients.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = report_recipients.client_id
          AND c.organization_id = report_recipients.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

DROP POLICY IF EXISTS report_recipients_update ON public.report_recipients;
CREATE POLICY report_recipients_update ON public.report_recipients FOR UPDATE TO authenticated
  USING (has_organization_role(report_recipients.organization_id, 'admin'))
  WITH CHECK (
    has_organization_role(report_recipients.organization_id, 'admin')
    AND (
      report_recipients.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = report_recipients.client_id
          AND c.organization_id = report_recipients.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

-- ─── Policies — agents ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS agents_select ON public.agents;
CREATE POLICY agents_select ON public.agents FOR SELECT TO authenticated
  USING (
    (agents.is_global = true) OR
    (agents.organization_id IS NOT NULL AND is_organization_member(agents.organization_id))
  );

DROP POLICY IF EXISTS agents_insert ON public.agents;
CREATE POLICY agents_insert ON public.agents FOR INSERT TO authenticated
  WITH CHECK (
    agents.organization_id IS NOT NULL
    AND has_organization_role(agents.organization_id, 'admin')
  );

DROP POLICY IF EXISTS agents_update ON public.agents;
CREATE POLICY agents_update ON public.agents FOR UPDATE TO authenticated
  USING  (agents.organization_id IS NOT NULL AND has_organization_role(agents.organization_id, 'admin'))
  WITH CHECK (agents.organization_id IS NOT NULL AND has_organization_role(agents.organization_id, 'admin'));

-- ─── Policies — skills ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS skills_select ON public.skills;
CREATE POLICY skills_select ON public.skills FOR SELECT TO authenticated
  USING (
    (skills.is_global = true) OR
    (skills.organization_id IS NOT NULL AND is_organization_member(skills.organization_id))
  );

DROP POLICY IF EXISTS skills_insert ON public.skills;
CREATE POLICY skills_insert ON public.skills FOR INSERT TO authenticated
  WITH CHECK (
    skills.organization_id IS NOT NULL
    AND has_organization_role(skills.organization_id, 'admin')
  );

DROP POLICY IF EXISTS skills_update ON public.skills;
CREATE POLICY skills_update ON public.skills FOR UPDATE TO authenticated
  USING  (skills.organization_id IS NOT NULL AND has_organization_role(skills.organization_id, 'admin'))
  WITH CHECK (skills.organization_id IS NOT NULL AND has_organization_role(skills.organization_id, 'admin'));

-- ─── Policies — templates ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS templates_select ON public.templates;
CREATE POLICY templates_select ON public.templates FOR SELECT TO authenticated
  USING (
    (templates.is_global = true) OR
    (templates.organization_id IS NOT NULL AND is_organization_member(templates.organization_id))
  );

DROP POLICY IF EXISTS templates_insert ON public.templates;
CREATE POLICY templates_insert ON public.templates FOR INSERT TO authenticated
  WITH CHECK (
    templates.organization_id IS NOT NULL
    AND has_organization_role(templates.organization_id, 'admin')
  );

DROP POLICY IF EXISTS templates_update ON public.templates;
CREATE POLICY templates_update ON public.templates FOR UPDATE TO authenticated
  USING  (templates.organization_id IS NOT NULL AND has_organization_role(templates.organization_id, 'admin'))
  WITH CHECK (templates.organization_id IS NOT NULL AND has_organization_role(templates.organization_id, 'admin'));

-- ─── Policies — automations ───────────────────────────────────────────────────

DROP POLICY IF EXISTS automations_select ON public.automations;
CREATE POLICY automations_select ON public.automations FOR SELECT TO authenticated
  USING (
    is_organization_member(automations.organization_id)
    AND (
      automations.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = automations.client_id
          AND c.organization_id = automations.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

DROP POLICY IF EXISTS automations_insert ON public.automations;
CREATE POLICY automations_insert ON public.automations FOR INSERT TO authenticated
  WITH CHECK (
    has_organization_role(automations.organization_id, 'admin')
    AND (
      automations.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = automations.client_id
          AND c.organization_id = automations.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

DROP POLICY IF EXISTS automations_update ON public.automations;
CREATE POLICY automations_update ON public.automations FOR UPDATE TO authenticated
  USING (has_organization_role(automations.organization_id, 'admin'))
  WITH CHECK (
    has_organization_role(automations.organization_id, 'admin')
    AND (
      automations.client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id              = automations.client_id
          AND c.organization_id = automations.organization_id
          AND c.deleted_at      IS NULL
      )
    )
  );

-- ─── Policies — migration_runs ────────────────────────────────────────────────
-- #10 Solo admin+ puede leer; authenticated no tiene INSERT/UPDATE.

DROP POLICY IF EXISTS migration_runs_select ON public.migration_runs;
CREATE POLICY migration_runs_select ON public.migration_runs FOR SELECT TO authenticated
  USING (has_organization_role(migration_runs.organization_id, 'admin'));

-- ─── Policies — migration_records ────────────────────────────────────────────
-- #10 Solo admin+ puede leer.

DROP POLICY IF EXISTS migration_records_select ON public.migration_records;
CREATE POLICY migration_records_select ON public.migration_records FOR SELECT TO authenticated
  USING (has_organization_role(migration_records.organization_id, 'admin'));

-- ─── Triggers ────────────────────────────────────────────────────────────────
-- #11 DROP TRIGGER IF EXISTS antes de cada CREATE TRIGGER.
-- Nombres con prefijo numérico garantizan orden de ejecución (PostgreSQL:
-- triggers BEFORE del mismo timing se disparan en orden ALFABÉTICO).
-- Orden: 10=client_org, 20=write_actor, 30=core_immutable, 40=created_by,
--        50=client_id, 60=legacy, 70=audit_fields, 80=email_norm, 90=updated_at.

-- ── tasks ──

DROP TRIGGER IF EXISTS trg_tasks_10_client_org     ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_20_write          ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_30_core_immutable ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_40_created_by     ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_50_client_id      ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_60_legacy         ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_90_updated_at     ON public.tasks;

-- Integridad client-org (reutiliza check_client_organization_match de Phase 3)
CREATE TRIGGER trg_tasks_10_client_org
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  WHEN (NEW.client_id IS NOT NULL)
  EXECUTE FUNCTION public.check_client_organization_match();

-- Gestión created_by / updated_by
CREATE TRIGGER trg_tasks_20_write
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.manage_phase4_write();

-- #1 Inmutabilidad base: id, organization_id, created_at
CREATE TRIGGER trg_tasks_30_core_immutable
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

-- #1 Inmutabilidad created_by
CREATE TRIGGER trg_tasks_40_created_by
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_created_by_immutable();

-- #2 Inmutabilidad client_id
CREATE TRIGGER trg_tasks_50_client_id
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_client_id();

-- #2 Inmutabilidad legacy_source + legacy_id + legacy_path
CREATE TRIGGER trg_tasks_60_legacy
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_tasks_legacy();

CREATE TRIGGER trg_tasks_90_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── client_metrics ──

DROP TRIGGER IF EXISTS trg_client_metrics_10_client_org     ON public.client_metrics;
DROP TRIGGER IF EXISTS trg_client_metrics_30_core_immutable ON public.client_metrics;
DROP TRIGGER IF EXISTS trg_client_metrics_50_client_id      ON public.client_metrics;
DROP TRIGGER IF EXISTS trg_client_metrics_60_legacy         ON public.client_metrics;
DROP TRIGGER IF EXISTS trg_client_metrics_90_updated_at     ON public.client_metrics;

CREATE TRIGGER trg_client_metrics_10_client_org
  BEFORE INSERT OR UPDATE ON public.client_metrics
  FOR EACH ROW EXECUTE FUNCTION public.check_client_organization_match();

CREATE TRIGGER trg_client_metrics_30_core_immutable
  BEFORE UPDATE ON public.client_metrics
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

CREATE TRIGGER trg_client_metrics_50_client_id
  BEFORE UPDATE ON public.client_metrics
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_client_id();

CREATE TRIGGER trg_client_metrics_60_legacy
  BEFORE UPDATE ON public.client_metrics
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_legacy_path();

CREATE TRIGGER trg_client_metrics_90_updated_at
  BEFORE UPDATE ON public.client_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── alerts ──

DROP TRIGGER IF EXISTS trg_alerts_10_client_org     ON public.alerts;
DROP TRIGGER IF EXISTS trg_alerts_30_core_immutable ON public.alerts;
DROP TRIGGER IF EXISTS trg_alerts_50_client_id      ON public.alerts;
DROP TRIGGER IF EXISTS trg_alerts_60_legacy         ON public.alerts;
DROP TRIGGER IF EXISTS trg_alerts_70_audit_fields   ON public.alerts;
DROP TRIGGER IF EXISTS trg_alerts_90_updated_at     ON public.alerts;

CREATE TRIGGER trg_alerts_10_client_org
  BEFORE INSERT OR UPDATE ON public.alerts
  FOR EACH ROW
  WHEN (NEW.client_id IS NOT NULL)
  EXECUTE FUNCTION public.check_client_organization_match();

CREATE TRIGGER trg_alerts_30_core_immutable
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

CREATE TRIGGER trg_alerts_50_client_id
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_client_id();

CREATE TRIGGER trg_alerts_60_legacy
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_legacy_path();

-- #5 Bloquea mutación directa de acknowledged_by/at y resolved_by/at
CREATE TRIGGER trg_alerts_70_audit_fields
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.protect_alerts_audit_fields();

CREATE TRIGGER trg_alerts_90_updated_at
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── reports ──

DROP TRIGGER IF EXISTS trg_reports_10_client_org     ON public.reports;
DROP TRIGGER IF EXISTS trg_reports_30_core_immutable ON public.reports;
DROP TRIGGER IF EXISTS trg_reports_50_client_id      ON public.reports;
DROP TRIGGER IF EXISTS trg_reports_60_legacy         ON public.reports;
DROP TRIGGER IF EXISTS trg_reports_90_updated_at     ON public.reports;

CREATE TRIGGER trg_reports_10_client_org
  BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.check_client_organization_match();

CREATE TRIGGER trg_reports_30_core_immutable
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

CREATE TRIGGER trg_reports_50_client_id
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_client_id();

CREATE TRIGGER trg_reports_60_legacy
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_legacy_id_path();

CREATE TRIGGER trg_reports_90_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── report_recipients ──

DROP TRIGGER IF EXISTS trg_report_recipients_05_normalize_email ON public.report_recipients;
DROP TRIGGER IF EXISTS trg_report_recipients_10_client_org      ON public.report_recipients;
DROP TRIGGER IF EXISTS trg_report_recipients_30_core_immutable  ON public.report_recipients;
DROP TRIGGER IF EXISTS trg_report_recipients_50_client_id       ON public.report_recipients;
DROP TRIGGER IF EXISTS trg_report_recipients_90_updated_at      ON public.report_recipients;

-- #7 Normalización de email antes de cualquier constraint
CREATE TRIGGER trg_report_recipients_05_normalize_email
  BEFORE INSERT OR UPDATE ON public.report_recipients
  FOR EACH ROW EXECUTE FUNCTION public.normalize_report_recipient_email();

CREATE TRIGGER trg_report_recipients_10_client_org
  BEFORE INSERT OR UPDATE ON public.report_recipients
  FOR EACH ROW
  WHEN (NEW.client_id IS NOT NULL)
  EXECUTE FUNCTION public.check_client_organization_match();

CREATE TRIGGER trg_report_recipients_30_core_immutable
  BEFORE UPDATE ON public.report_recipients
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

CREATE TRIGGER trg_report_recipients_50_client_id
  BEFORE UPDATE ON public.report_recipients
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_client_id();

CREATE TRIGGER trg_report_recipients_90_updated_at
  BEFORE UPDATE ON public.report_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── agents ──

DROP TRIGGER IF EXISTS trg_agents_30_core_immutable ON public.agents;
DROP TRIGGER IF EXISTS trg_agents_60_legacy         ON public.agents;
DROP TRIGGER IF EXISTS trg_agents_90_updated_at     ON public.agents;

CREATE TRIGGER trg_agents_30_core_immutable
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

CREATE TRIGGER trg_agents_60_legacy
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_legacy_path();

CREATE TRIGGER trg_agents_90_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── skills ──

DROP TRIGGER IF EXISTS trg_skills_30_core_immutable ON public.skills;
DROP TRIGGER IF EXISTS trg_skills_60_legacy         ON public.skills;
DROP TRIGGER IF EXISTS trg_skills_90_updated_at     ON public.skills;

CREATE TRIGGER trg_skills_30_core_immutable
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

CREATE TRIGGER trg_skills_60_legacy
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_legacy_path();

CREATE TRIGGER trg_skills_90_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── templates ──

DROP TRIGGER IF EXISTS trg_templates_30_core_immutable ON public.templates;
DROP TRIGGER IF EXISTS trg_templates_60_legacy         ON public.templates;
DROP TRIGGER IF EXISTS trg_templates_90_updated_at     ON public.templates;

CREATE TRIGGER trg_templates_30_core_immutable
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

CREATE TRIGGER trg_templates_60_legacy
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_legacy_path();

CREATE TRIGGER trg_templates_90_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── automations ──

DROP TRIGGER IF EXISTS trg_automations_10_client_org     ON public.automations;
DROP TRIGGER IF EXISTS trg_automations_30_core_immutable ON public.automations;
DROP TRIGGER IF EXISTS trg_automations_50_client_id      ON public.automations;
DROP TRIGGER IF EXISTS trg_automations_60_legacy         ON public.automations;
DROP TRIGGER IF EXISTS trg_automations_90_updated_at     ON public.automations;

CREATE TRIGGER trg_automations_10_client_org
  BEFORE INSERT OR UPDATE ON public.automations
  FOR EACH ROW
  WHEN (NEW.client_id IS NOT NULL)
  EXECUTE FUNCTION public.check_client_organization_match();

CREATE TRIGGER trg_automations_30_core_immutable
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

CREATE TRIGGER trg_automations_50_client_id
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_client_id();

-- #2 legacy_id (clave n8n) + legacy_path protegidos
CREATE TRIGGER trg_automations_60_legacy
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_legacy_id_path();

CREATE TRIGGER trg_automations_90_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── migration_runs ──

DROP TRIGGER IF EXISTS trg_migration_runs_30_core_immutable ON public.migration_runs;
DROP TRIGGER IF EXISTS trg_migration_runs_40_created_by     ON public.migration_runs;
DROP TRIGGER IF EXISTS trg_migration_runs_90_updated_at     ON public.migration_runs;

CREATE TRIGGER trg_migration_runs_30_core_immutable
  BEFORE UPDATE ON public.migration_runs
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

-- #1 created_by inmutable también en migration_runs
CREATE TRIGGER trg_migration_runs_40_created_by
  BEFORE UPDATE ON public.migration_runs
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_created_by_immutable();

CREATE TRIGGER trg_migration_runs_90_updated_at
  BEFORE UPDATE ON public.migration_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── migration_records ──

DROP TRIGGER IF EXISTS trg_migration_records_10_org          ON public.migration_records;
DROP TRIGGER IF EXISTS trg_migration_records_30_core_immutable ON public.migration_records;

-- #4 Coherencia con migration_runs.organization_id + inmutabilidad de run_id/org
CREATE TRIGGER trg_migration_records_10_org
  BEFORE INSERT OR UPDATE ON public.migration_records
  FOR EACH ROW EXECUTE FUNCTION public.check_p4_migration_record_org();

-- #1 Inmutabilidad base: id, organization_id, created_at
CREATE TRIGGER trg_migration_records_30_core_immutable
  BEFORE UPDATE ON public.migration_records
  FOR EACH ROW EXECUTE FUNCTION public.protect_p4_core_immutable();

-- ─── REVOKE / GRANT para funciones RPC ───────────────────────────────────────
-- #5 Solo authenticated puede invocar los RPCs de alertas.

REVOKE ALL ON FUNCTION public.acknowledge_alert(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_alert(uuid)     FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.acknowledge_alert(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_alert(uuid)     TO authenticated;

-- ─── Comentarios de documentación ─────────────────────────────────────────────

COMMENT ON TABLE public.tasks IS
  'Tareas de clientes — .agencia-ai/clients/*/tasks.json. '
  'created_by nullable (NULL = service_role sin actor conocido). '
  'client_id inmutable post-insert. Soft-delete via deleted_at.';

COMMENT ON TABLE public.client_metrics IS
  'Métricas de plataformas por periodo — shared-data/metrics/. '
  'platform: enum cerrado. campaigns=array, data_quality=object|null. '
  'client_id NOT NULL con ON DELETE RESTRICT.';

COMMENT ON TABLE public.alerts IS
  'Alertas del sistema — shared-data/alerts/. '
  'acknowledged_by/at y resolved_by/at solo via RPCs acknowledge_alert/resolve_alert. '
  'platform: enum cerrado.';

COMMENT ON TABLE public.reports IS
  'Reportes por periodo — shared-data/reports/clients/. '
  'Solo JSON en fuentes (sin Markdown); content_markdown no añadido. '
  'payload=object|null. client_id NOT NULL con ON DELETE RESTRICT.';

COMMENT ON TABLE public.report_recipients IS
  'Destinatarios de reportes — shared-data/reports/report-recipients.json. '
  'email normalizado a lower(trim()) por trigger antes de persistir.';

COMMENT ON TABLE public.agents IS
  'Agentes de IA — .agencia-ai/.claude/agents/. '
  'is_global=true requiere organization_id IS NULL (CHECK ck_agents_global_scope).';

COMMENT ON TABLE public.skills IS
  'Skills de Claude — .agencia-ai/.claude/skills/. '
  'is_global=true requiere organization_id IS NULL (CHECK ck_skills_global_scope).';

COMMENT ON TABLE public.templates IS
  'Plantillas — .agencia-ai/templates/. '
  'is_global=true requiere organization_id IS NULL (CHECK ck_templates_global_scope).';

COMMENT ON TABLE public.automations IS
  'Automatizaciones n8n — shared-data/automations/. '
  'legacy_id es clave de n8n (NOT NULL, inmutable). health/links=object|null.';

COMMENT ON TABLE public.migration_runs IS
  'Ejecuciones del script Phase 4. '
  'Solo SELECT para authenticated (admin+). INSERT/UPDATE exclusivo de service_role.';

COMMENT ON TABLE public.migration_records IS
  'Registro por-fila de cada acción de migración. '
  'organization_id FK verificada contra migration_runs por trigger. '
  'Solo SELECT para authenticated (admin+).';
