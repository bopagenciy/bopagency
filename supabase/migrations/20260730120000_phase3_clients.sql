-- =============================================================================
-- BopIAgency — Migración Fase 3: Gestión de Clientes
-- Archivo: 20260730120000_phase3_clients.sql
-- Requiere: 20260730000000 y 20260730090000 aplicadas.
--
-- ⚠️  ACCIÓN MANUAL: Aplicar en Supabase Dashboard → SQL Editor → Run.
--     NO ejecutar contra Supabase remoto desde CLI sin revisión previa.
--
-- SEGURIDAD:
--   • Auditoría (created_by/updated_by/deleted_by) asignada por la BD desde
--     auth.uid() — el navegador no puede falsificarlos.
--   • Soft delete requiere rol admin/owner, reforzado en BD (trigger) y RPC.
--   • organization_id, client_id, id y created_at son inmutables (trigger).
--   • Hijos de clientes eliminados no son visibles ni editables (RLS + trigger).
--   • Documentos con control de versión optimista (RPC upsert_client_document).
--   • Solo un contacto principal activo por cliente (índice parcial único).
--   • jsonb metadata/configuration deben ser objetos JSON.
--
-- IDEMPOTENCIA EN DESARROLLO:
--   • Todos los CREATE TRIGGER precedidos de DROP TRIGGER IF EXISTS.
--   • Todas las CREATE POLICY precedidas de DROP POLICY IF EXISTS.
--   • Enums con DO-block IF NOT EXISTS.
--   • Tablas e índices con IF NOT EXISTS.
--   • Constraints CHECK con DO-block que comprueba pg_constraint.
--   • La migración puede reejecutarse sin fallar ni perder datos.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. HELPER: set_updated_at (definida en Fase 2, recrear por idempotencia)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. ENUMS (idempotentes)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'client_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.client_status AS ENUM (
      'active', 'inactive', 'onboarding', 'churned'
    );
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'document_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.document_status AS ENUM (
      'draft', 'published', 'archived'
    );
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'integration_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.integration_status AS ENUM (
      'active', 'inactive', 'error'
    );
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 2. TABLA: clients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clients (
  id              uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid                  NOT NULL
                    REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text                  NOT NULL
                    CHECK (char_length(name) BETWEEN 1 AND 200),
  legal_name      text
                    CHECK (legal_name IS NULL OR char_length(legal_name) BETWEEN 1 AND 300),
  slug            text                  NOT NULL
                    CHECK (slug ~ '^[a-z0-9-]+$' AND char_length(slug) BETWEEN 1 AND 100),
  status          public.client_status  NOT NULL DEFAULT 'active',
  industry        text
                    CHECK (industry IS NULL OR industry IN (
                      'hospitality','legal','ecommerce','retail','healthcare',
                      'technology','education','real_estate','finance',
                      'food_beverage','other'
                    )),
  timezone        text                  NOT NULL DEFAULT 'America/Bogota',
  currency        text                  NOT NULL DEFAULT 'COP'
                    CHECK (currency IN ('USD','COP','MXN','EUR')),
  website         text
                    CHECK (website IS NULL OR char_length(website) <= 500),
  email           text
                    CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone           text
                    CHECK (phone IS NULL OR char_length(phone) <= 30),
  notes           text
                    CHECK (notes IS NULL OR char_length(notes) <= 5000),
  -- metadata debe ser objeto JSON (nunca array ni primitivo)
  metadata        jsonb                 NOT NULL DEFAULT '{}',
  -- Auditoría: asignada por trigger desde auth.uid(), NO por el cliente
  created_by      uuid                  NOT NULL
                    REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by      uuid
                    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz           NOT NULL DEFAULT now(),
  updated_at      timestamptz           NOT NULL DEFAULT now(),
  -- Soft delete
  deleted_at      timestamptz,
  deleted_by      uuid
                    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.clients IS
  'Clientes de la agencia. La auditoría (created_by/updated_by/deleted_by) la '
  'asigna automáticamente el trigger manage_client_write desde auth.uid().';

-- Slug único por org entre clientes activos
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_org_slug_active
  ON public.clients(organization_id, slug)
  WHERE deleted_at IS NULL;

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_clients_org_id
  ON public.clients(organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_status
  ON public.clients(status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_org_created
  ON public.clients(organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_deleted
  ON public.clients(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- FTS index
CREATE INDEX IF NOT EXISTS idx_clients_name_fts
  ON public.clients USING gin(to_tsvector('simple', name));

-- CHECK constraint: metadata debe ser objeto JSON
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_clients_metadata_object'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT ck_clients_metadata_object
      CHECK (jsonb_typeof(metadata) = 'object');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. TABLA: client_contacts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_contacts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        NOT NULL
                    REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL
                    REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL
                    CHECK (char_length(name) BETWEEN 1 AND 200),
  title           text
                    CHECK (title IS NULL OR char_length(title) <= 100),
  email           text
                    CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone           text
                    CHECK (phone IS NULL OR char_length(phone) <= 30),
  is_primary      boolean     NOT NULL DEFAULT false,
  notes           text
                    CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

COMMENT ON TABLE public.client_contacts IS
  'Contactos asociados a un cliente. organization_id denormalizado para RLS, '
  'verificado por trigger check_client_organization_match.';

CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id
  ON public.client_contacts(client_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_contacts_org_id
  ON public.client_contacts(organization_id)
  WHERE deleted_at IS NULL;

-- Un solo contacto principal activo por cliente
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_contacts_one_primary
  ON public.client_contacts(client_id)
  WHERE is_primary = true AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. TABLA: client_documents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_documents (
  id              uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid                    NOT NULL
                    REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid                    NOT NULL
                    REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_key    text                    NOT NULL
                    CHECK (
                      document_key ~ '^[a-z0-9_-]+$'
                      AND char_length(document_key) BETWEEN 1 AND 100
                    ),
  title           text                    NOT NULL
                    CHECK (char_length(title) BETWEEN 1 AND 200),
  category        text                    NOT NULL DEFAULT 'general'
                    CHECK (char_length(category) <= 50),
  content         text                    NOT NULL DEFAULT '',
  status          public.document_status  NOT NULL DEFAULT 'draft',
  -- version: control de concurrencia optimista. Solo aumenta. Asignado por RPC.
  version         integer                 NOT NULL DEFAULT 1
                    CHECK (version >= 1),
  -- Auditoría: asignada por trigger set_document_audit desde auth.uid()
  created_by      uuid                    NOT NULL
                    REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by      uuid
                    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz             NOT NULL DEFAULT now(),
  updated_at      timestamptz             NOT NULL DEFAULT now(),
  -- Upsert semántico: document_key único por cliente
  CONSTRAINT uq_client_documents_client_key UNIQUE (client_id, document_key)
);

COMMENT ON TABLE public.client_documents IS
  'Documentos versionados por cliente. '
  'Usar la RPC upsert_client_document para escrituras seguras con control de versión.';

CREATE INDEX IF NOT EXISTS idx_client_docs_client_id
  ON public.client_documents(client_id);

CREATE INDEX IF NOT EXISTS idx_client_docs_org_id
  ON public.client_documents(organization_id);

-- ---------------------------------------------------------------------------
-- 5. TABLA: client_integrations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_integrations (
  id                  uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid                      NOT NULL
                        REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     uuid                      NOT NULL
                        REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider            text                      NOT NULL
                        CHECK (char_length(provider) BETWEEN 1 AND 100),
  external_account_id text                      NOT NULL
                        CHECK (char_length(external_account_id) BETWEEN 1 AND 200),
  status              public.integration_status NOT NULL DEFAULT 'active',
  -- configuration: NO guardar tokens/secrets en texto plano.
  -- Debe ser objeto JSON.
  configuration       jsonb                     NOT NULL DEFAULT '{}',
  last_synced_at      timestamptz,
  created_at          timestamptz               NOT NULL DEFAULT now(),
  updated_at          timestamptz               NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_integrations_client_provider
    UNIQUE (client_id, provider, external_account_id)
);

COMMENT ON TABLE public.client_integrations IS
  'Integraciones con proveedores externos por cliente. '
  'configuration: solo metadatos no sensibles (nunca secrets/tokens).';

CREATE INDEX IF NOT EXISTS idx_client_integrations_client_id
  ON public.client_integrations(client_id);

CREATE INDEX IF NOT EXISTS idx_client_integrations_org_id
  ON public.client_integrations(organization_id);

-- CHECK: configuration debe ser objeto JSON
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_client_integrations_config_object'
      AND conrelid = 'public.client_integrations'::regclass
  ) THEN
    ALTER TABLE public.client_integrations
      ADD CONSTRAINT ck_client_integrations_config_object
      CHECK (jsonb_typeof(configuration) = 'object');
  END IF;
END;
$$;

-- =============================================================================
-- FUNCIONES DE TRIGGER
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 6. manage_client_write()
--
-- BEFORE INSERT OR UPDATE en public.clients.
-- Responsabilidades:
--   INSERT: asigna created_by/updated_by desde auth.uid(); fuerza deleted_at/by a NULL.
--   UPDATE: protege campos inmutables (id, organization_id, created_by, created_at);
--           asigna updated_by desde auth.uid();
--           bloquea actualizaciones a clientes ya eliminados;
--           exige rol admin/owner para soft delete;
--           asigna deleted_by desde auth.uid() si se autoriza el soft delete;
--           bloquea restauración (deleted_at NULL → NOT NULL → NULL) por UPDATE directo.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.manage_client_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── INSERT ─────────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Auditoría siempre desde auth.uid() (ignora valores del cliente)
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by  := auth.uid();
      NEW.updated_by  := auth.uid();
    END IF;

    -- Nunca aceptar soft-delete en INSERT
    NEW.deleted_at := NULL;
    NEW.deleted_by := NULL;

    RETURN NEW;
  END IF;

  -- ── UPDATE ─────────────────────────────────────────────────────────────────

  -- Campos inmutables
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'clients: id is immutable';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'clients: organization_id is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'clients: created_at is immutable';
  END IF;
  -- Proteger created_by: siempre restaurar el valor original
  NEW.created_by := OLD.created_by;

  -- Bloquear actualizaciones a clientes ya eliminados lógicamente
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION
      'clients: cannot update soft-deleted client %. Use restore procedure if needed.',
      OLD.id;
  END IF;

  -- Restauración directa no permitida
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'clients: direct restore is not permitted via UPDATE';
  END IF;

  -- Soft delete: exige rol admin/owner
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    IF NOT public.has_organization_role(OLD.organization_id, 'admin') THEN
      RAISE EXCEPTION
        'clients: soft delete requires admin or owner role (org: %)',
        OLD.organization_id;
    END IF;
    -- Auditoría de eliminación asignada por la BD
    IF auth.uid() IS NOT NULL THEN
      NEW.deleted_by := auth.uid();
      NEW.updated_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  -- Actualización normal: asignar updated_by desde auth.uid()
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  -- No se puede borrar deleted_by en una actualización normal
  NEW.deleted_by := OLD.deleted_by;
  NEW.deleted_at := OLD.deleted_at;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.manage_client_write() IS
  'BEFORE INSERT OR UPDATE en clients. Gestiona auditoría, inmutabilidad de campos '
  'y protección del soft delete (requiere admin/owner).';

-- ---------------------------------------------------------------------------
-- 7. set_document_audit()
--
-- BEFORE INSERT OR UPDATE en public.client_documents.
-- Asigna created_by/updated_by desde auth.uid().
-- Protege created_by e id de cambios en UPDATE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_document_audit()
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
    RAISE EXCEPTION 'client_documents: id is immutable';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'client_documents: organization_id is immutable';
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'client_documents: client_id is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'client_documents: created_at is immutable';
  END IF;

  -- Proteger created_by
  NEW.created_by := OLD.created_by;

  -- Asignar updated_by
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_document_audit() IS
  'BEFORE INSERT OR UPDATE en client_documents. Gestiona auditoría y protege '
  'campos inmutables (id, organization_id, client_id, created_at, created_by).';

-- ---------------------------------------------------------------------------
-- 8. protect_child_immutable_fields()
--
-- BEFORE UPDATE en client_contacts e client_integrations.
-- Protege id, organization_id, client_id, created_at de cambios.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_child_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION '%.id is immutable', TG_TABLE_NAME;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION '%.organization_id is immutable', TG_TABLE_NAME;
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION '%.client_id is immutable', TG_TABLE_NAME;
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION '%.created_at is immutable', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_child_immutable_fields() IS
  'BEFORE UPDATE genérico para tablas hijas. Protege id, organization_id, '
  'client_id y created_at de modificaciones.';

-- ---------------------------------------------------------------------------
-- 9. check_client_organization_match() — actualizada
--
-- BEFORE INSERT OR UPDATE en tablas hijas.
-- Verifica que el cliente padre exista, esté activo (deleted_at IS NULL)
-- y su organization_id coincida con NEW.organization_id.
-- Rechaza inserción/actualización si el cliente está eliminado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_client_organization_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_org_id uuid;
  v_client_deleted boolean;
BEGIN
  SELECT organization_id, (deleted_at IS NOT NULL)
  INTO v_client_org_id, v_client_deleted
  FROM public.clients
  WHERE id = NEW.client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'check_client_organization_match: client not found (id: %)',
      NEW.client_id;
  END IF;

  -- Rechazar operaciones sobre clientes eliminados
  IF v_client_deleted THEN
    RAISE EXCEPTION
      'check_client_organization_match: client is soft-deleted; '
      'cannot add or modify child records (client_id: %)',
      NEW.client_id;
  END IF;

  -- Verificar consistencia multi-tenant
  IF NEW.organization_id IS DISTINCT FROM v_client_org_id THEN
    RAISE EXCEPTION
      'check_client_organization_match: organization_id mismatch '
      '(client_id: %, expected: %, got: %)',
      NEW.client_id, v_client_org_id, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_client_organization_match() IS
  'BEFORE INSERT OR UPDATE en tablas hijas. Verifica que el cliente padre exista, '
  'no esté eliminado y que organization_id coincida. Bloquea escrituras '
  'en clientes con soft delete.';

-- =============================================================================
-- TRIGGERS (todos con DROP IF EXISTS para idempotencia)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Triggers en clients
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_clients_guard ON public.clients;
CREATE TRIGGER trg_clients_guard
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.manage_client_write();
-- Orden alfabético garantiza que 'guard' precede a 'updated_at'

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Triggers en client_contacts
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_client_contacts_immutable ON public.client_contacts;
CREATE TRIGGER trg_client_contacts_immutable
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.protect_child_immutable_fields();
-- 'immutable' < 'org_match' < 'updated_at' (orden alfabético correcto)

DROP TRIGGER IF EXISTS trg_client_contacts_org_match ON public.client_contacts;
CREATE TRIGGER trg_client_contacts_org_match
  BEFORE INSERT OR UPDATE OF organization_id, client_id ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.check_client_organization_match();

DROP TRIGGER IF EXISTS trg_client_contacts_updated_at ON public.client_contacts;
CREATE TRIGGER trg_client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Triggers en client_documents
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_client_documents_audit ON public.client_documents;
CREATE TRIGGER trg_client_documents_audit
  BEFORE INSERT OR UPDATE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_document_audit();
-- 'audit' < 'org_match' < 'updated_at' (orden alfabético correcto)

DROP TRIGGER IF EXISTS trg_client_documents_org_match ON public.client_documents;
CREATE TRIGGER trg_client_documents_org_match
  BEFORE INSERT OR UPDATE OF organization_id, client_id ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.check_client_organization_match();

DROP TRIGGER IF EXISTS trg_client_documents_updated_at ON public.client_documents;
CREATE TRIGGER trg_client_documents_updated_at
  BEFORE UPDATE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Triggers en client_integrations
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_client_integrations_immutable ON public.client_integrations;
CREATE TRIGGER trg_client_integrations_immutable
  BEFORE UPDATE ON public.client_integrations
  FOR EACH ROW EXECUTE FUNCTION public.protect_child_immutable_fields();

DROP TRIGGER IF EXISTS trg_client_integrations_org_match ON public.client_integrations;
CREATE TRIGGER trg_client_integrations_org_match
  BEFORE INSERT OR UPDATE OF organization_id, client_id ON public.client_integrations
  FOR EACH ROW EXECUTE FUNCTION public.check_client_organization_match();

DROP TRIGGER IF EXISTS trg_client_integrations_updated_at ON public.client_integrations;
CREATE TRIGGER trg_client_integrations_updated_at
  BEFORE UPDATE ON public.client_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.clients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_integrations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS: clients
-- ---------------------------------------------------------------------------

-- SELECT: miembro activo ve clientes no eliminados de su org
DROP POLICY IF EXISTS "clients_select_member" ON public.clients;
CREATE POLICY "clients_select_member"
  ON public.clients FOR SELECT
  USING (
    public.is_organization_member(organization_id)
    AND deleted_at IS NULL
  );

-- INSERT: operator o superior; auditoría asignada por trigger
DROP POLICY IF EXISTS "clients_insert_operator" ON public.clients;
CREATE POLICY "clients_insert_operator"
  ON public.clients FOR INSERT
  WITH CHECK (
    public.has_organization_role(organization_id, 'operator')
  );

-- UPDATE: operator o superior sobre clientes activos.
-- El trigger manage_client_write exige admin/owner para soft delete.
-- No se permite UPDATE a filas con deleted_at IS NOT NULL (USING).
DROP POLICY IF EXISTS "clients_update_operator" ON public.clients;
CREATE POLICY "clients_update_operator"
  ON public.clients FOR UPDATE
  USING (
    public.has_organization_role(organization_id, 'operator')
    AND deleted_at IS NULL
  )
  WITH CHECK (
    public.has_organization_role(organization_id, 'operator')
  );

-- No hay DELETE físico por RLS para authenticated.
-- El soft delete se hace mediante UPDATE (o RPC soft_delete_client).

-- ---------------------------------------------------------------------------
-- RLS: client_contacts
-- Incluye verificación de padre activo en SELECT, INSERT y UPDATE.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "client_contacts_select_member" ON public.client_contacts;
CREATE POLICY "client_contacts_select_member"
  ON public.client_contacts FOR SELECT
  USING (
    public.is_organization_member(organization_id)
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_contacts.client_id
        AND c.organization_id = client_contacts.organization_id
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "client_contacts_insert_operator" ON public.client_contacts;
CREATE POLICY "client_contacts_insert_operator"
  ON public.client_contacts FOR INSERT
  WITH CHECK (
    public.has_organization_role(organization_id, 'operator')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_contacts.client_id
        AND c.organization_id = client_contacts.organization_id
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "client_contacts_update_operator" ON public.client_contacts;
CREATE POLICY "client_contacts_update_operator"
  ON public.client_contacts FOR UPDATE
  USING (
    public.has_organization_role(organization_id, 'operator')
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_contacts.client_id
        AND c.organization_id = client_contacts.organization_id
        AND c.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.has_organization_role(organization_id, 'operator')
  );

-- ---------------------------------------------------------------------------
-- RLS: client_documents
-- Incluye verificación de padre activo.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "client_documents_select_member" ON public.client_documents;
CREATE POLICY "client_documents_select_member"
  ON public.client_documents FOR SELECT
  USING (
    public.is_organization_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_documents.client_id
        AND c.organization_id = client_documents.organization_id
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "client_documents_insert_operator" ON public.client_documents;
CREATE POLICY "client_documents_insert_operator"
  ON public.client_documents FOR INSERT
  WITH CHECK (
    public.has_organization_role(organization_id, 'operator')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_documents.client_id
        AND c.organization_id = client_documents.organization_id
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "client_documents_update_operator" ON public.client_documents;
CREATE POLICY "client_documents_update_operator"
  ON public.client_documents FOR UPDATE
  USING (
    public.has_organization_role(organization_id, 'operator')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_documents.client_id
        AND c.organization_id = client_documents.organization_id
        AND c.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.has_organization_role(organization_id, 'operator')
  );

-- ---------------------------------------------------------------------------
-- RLS: client_integrations
-- Solo admin/owner puede INSERT/UPDATE. Lectura para todos los miembros.
-- Incluye verificación de padre activo.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "client_integrations_select_member" ON public.client_integrations;
CREATE POLICY "client_integrations_select_member"
  ON public.client_integrations FOR SELECT
  USING (
    public.is_organization_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_integrations.client_id
        AND c.organization_id = client_integrations.organization_id
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "client_integrations_insert_admin" ON public.client_integrations;
CREATE POLICY "client_integrations_insert_admin"
  ON public.client_integrations FOR INSERT
  WITH CHECK (
    public.can_manage_organization(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_integrations.client_id
        AND c.organization_id = client_integrations.organization_id
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "client_integrations_update_admin" ON public.client_integrations;
CREATE POLICY "client_integrations_update_admin"
  ON public.client_integrations FOR UPDATE
  USING (
    public.can_manage_organization(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_integrations.client_id
        AND c.organization_id = client_integrations.organization_id
        AND c.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.can_manage_organization(organization_id)
  );

-- =============================================================================
-- RPCs SEGURAS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 10. soft_delete_client(p_client_id)
--
-- Elimina lógicamente un cliente. Refuerza en base de datos:
--   - Usuario autenticado requerido.
--   - Cliente debe existir y no estar eliminado.
--   - Caller debe ser admin u owner de la organización del cliente.
--   - Asigna deleted_at = now(), deleted_by = auth.uid() desde la BD.
-- El trigger manage_client_write también verifica el rol como defensa adicional.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_client(p_client_id uuid)
RETURNS public.clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client  public.clients;
  v_result  public.clients;
BEGIN
  -- Autenticación requerida
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'soft_delete_client: unauthenticated';
  END IF;

  -- Obtener cliente (org_id viene de la BD, no del caller)
  SELECT * INTO v_client
  FROM public.clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'soft_delete_client: client not found (id: %)', p_client_id;
  END IF;

  -- Verificar que no esté ya eliminado
  IF v_client.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'soft_delete_client: client is already deleted (id: %)', p_client_id;
  END IF;

  -- Verificar rol del caller (admin o owner)
  IF NOT public.has_organization_role(v_client.organization_id, 'admin') THEN
    RAISE EXCEPTION
      'soft_delete_client: requires admin or owner role (org: %)',
      v_client.organization_id;
  END IF;

  -- Realizar soft delete con auditoría desde auth.uid()
  UPDATE public.clients SET
    deleted_at = now(),
    deleted_by = v_user_id,
    updated_by = v_user_id,
    updated_at = now()
  WHERE id = p_client_id
    AND deleted_at IS NULL
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'soft_delete_client: concurrent modification detected (id: %)', p_client_id;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.soft_delete_client(uuid) IS
  'RPC segura para soft delete de clientes. Verifica autenticación, existencia, '
  'estado no eliminado y rol admin/owner. Asigna deleted_at/deleted_by desde auth.uid(). '
  'El trigger manage_client_write provee defensa adicional en la misma transacción.';

-- Revocar acceso público; solo authenticated puede ejecutar
REVOKE ALL ON FUNCTION public.soft_delete_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_client(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. upsert_client_document(...)
--
-- Crea o actualiza un documento con control de versión optimista.
--   - Nuevo documento: version = 1.
--   - Documento existente: si p_expected_version IS NOT NULL, verifica coincidencia;
--     luego incrementa version.
--   - Auditoría asignada desde auth.uid() por el trigger set_document_audit.
--   - Verifica rol operator+ y que el cliente padre esté activo.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_client_document(
  p_client_id        uuid,
  p_document_key     text,
  p_title            text,
  p_category         text          DEFAULT 'general',
  p_content          text          DEFAULT '',
  p_status           public.document_status DEFAULT 'draft',
  p_expected_version integer       DEFAULT NULL
)
RETURNS public.client_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_client     public.clients;
  v_existing   public.client_documents;
  v_result     public.client_documents;
BEGIN
  -- Autenticación requerida
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'upsert_client_document: unauthenticated';
  END IF;

  -- Obtener cliente activo (org_id desde BD)
  SELECT * INTO v_client
  FROM public.clients
  WHERE id = p_client_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'upsert_client_document: client not found or deleted (id: %)', p_client_id;
  END IF;

  -- Verificar permisos
  IF NOT public.has_organization_role(v_client.organization_id, 'operator') THEN
    RAISE EXCEPTION
      'upsert_client_document: requires operator role or higher (org: %)',
      v_client.organization_id;
  END IF;

  -- Validar formato document_key
  IF p_document_key !~ '^[a-z0-9_-]+$' OR char_length(p_document_key) < 1 OR char_length(p_document_key) > 100 THEN
    RAISE EXCEPTION
      'upsert_client_document: invalid document_key format ''%''', p_document_key;
  END IF;

  -- Buscar documento existente
  SELECT * INTO v_existing
  FROM public.client_documents
  WHERE client_id = p_client_id AND document_key = p_document_key;

  IF FOUND THEN
    -- Control de concurrencia optimista
    IF p_expected_version IS NOT NULL AND v_existing.version != p_expected_version THEN
      RAISE EXCEPTION
        'upsert_client_document: version conflict for key ''%'' '
        '(expected: %, current: %)',
        p_document_key, p_expected_version, v_existing.version;
    END IF;

    -- Actualizar: incrementar versión, updated_by asignado por trigger
    UPDATE public.client_documents SET
      title      = p_title,
      category   = p_category,
      content    = p_content,
      status     = p_status,
      version    = v_existing.version + 1,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_result;
  ELSE
    -- Insertar: version = 1, auditoría asignada por trigger set_document_audit
    INSERT INTO public.client_documents (
      client_id, organization_id, document_key,
      title, category, content, status, version,
      created_by, updated_by
    ) VALUES (
      p_client_id, v_client.organization_id, p_document_key,
      p_title, p_category, p_content, p_status, 1,
      v_user_id, v_user_id
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.upsert_client_document(uuid, text, text, text, text, public.document_status, integer) IS
  'RPC segura para crear o actualizar documentos de cliente con control de versión '
  'optimista. p_expected_version NULL = sin control (last-write-wins). '
  'p_expected_version set = error si la versión actual difiere. '
  'Requiere operator+ y cliente padre activo.';

REVOKE ALL ON FUNCTION public.upsert_client_document(uuid, text, text, text, text, public.document_status, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_client_document(uuid, text, text, text, text, public.document_status, integer) TO authenticated;

-- =============================================================================
-- GRANTS DE TABLAS
-- =============================================================================

GRANT SELECT, INSERT, UPDATE
  ON public.clients             TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON public.client_contacts     TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON public.client_documents    TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON public.client_integrations TO authenticated;

-- =============================================================================
-- FIN DE MIGRACIÓN
-- Aplicar manualmente en: Supabase Dashboard → SQL Editor → Run
-- Verificar con los tests SQL en docs/implementation/phase-3/RLS_MODEL.md
-- =============================================================================
