-- =============================================================================
-- BopIAgency — Migración Phase 4: Migration Actor RPCs
-- Archivo: 20260731000000_phase4_migration_actor.sql
-- Requiere: 20260730120000_phase3_clients.sql aplicada.
--
-- ⚠️  ACCIÓN MANUAL: Aplicar en Supabase Dashboard → SQL Editor → Run.
--     NO ejecutar contra Supabase remoto desde CLI sin revisión previa.
--
-- PROPÓSITO:
--   Permite que scripts de migración (service_role, sin auth.uid()) inserten
--   clientes con auditoría correcta (created_by / updated_by) usando un actor
--   explícito validado.
--
-- PROBLEMA RESUELTO:
--   El trigger manage_client_write de public.clients requiere auth.uid() IS NOT NULL
--   para asignar created_by. Cuando service_role ejecuta un INSERT directo,
--   auth.uid() es NULL y la inserción falla con:
--     "clients: authenticated user required"
--   (o viola el NOT NULL en created_by).
--
-- SOLUCIÓN:
--   create_migrated_client():
--     1. Valida que p_actor_user_id sea miembro de la organización con rol admin/owner.
--     2. Usa set_config('request.jwt.claim.sub', …) para que auth.uid() devuelva
--        el UUID del actor durante el INSERT — el trigger lo recoge y asigna
--        created_by/updated_by correctamente.
--     3. Solo service_role puede ejecutar esta función.
--     4. No debilita el trigger genérico para navegadores autenticados.
--
--   update_migrated_client():
--     Misma estrategia para UPDATE, garantizando que updated_by quede con el actor.
--
-- SEGURIDAD:
--   • REVOKE ALL FROM PUBLIC en ambas funciones.
--   • GRANT EXECUTE TO service_role solamente.
--   • El actor debe existir como miembro activo con rol admin u owner.
--   • search_path fijado a 'public' (previene search_path injection).
--   • set_config(..., true) = SET LOCAL → solo aplica a la transacción en curso.
--   • El trigger manage_client_write sigue protegiendo el navegador autenticado
--     sin cambios.
--   • Las RPCs no debilitan RLS ni policies existentes.
--
-- IDEMPOTENCIA:
--   CREATE OR REPLACE garantiza idempotencia en la definición de funciones.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. create_migrated_client
--
-- Inserta un cliente nuevo con auditoría correcta vía actor explícito.
-- Usa set_config para que manage_client_write vea auth.uid() = p_actor_user_id.
-- Retorna el UUID del cliente creado.
--
-- Validaciones:
--   - p_actor_user_id debe ser miembro de p_organization_id con rol admin u owner.
--   - p_slug debe cumplir el CHECK del esquema (^[a-z0-9-]+$, 1-100 chars).
--   - p_name debe cumplir el CHECK del esquema (1-200 chars).
--   - Columnas con CHECK en BD (currency, industry, etc.) son validadas por la
--     constraint, no por esta función.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_migrated_client(
  p_organization_id  uuid,
  p_actor_user_id    uuid,
  p_slug             text,
  p_name             text,
  p_status           public.client_status  DEFAULT 'active',
  p_industry         text                  DEFAULT NULL,
  p_currency         text                  DEFAULT 'COP',
  p_timezone         text                  DEFAULT 'America/Bogota',
  p_website          text                  DEFAULT NULL,
  p_notes            text                  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role  text;
  v_new_id      uuid;
BEGIN
  -- ── 1. Validar actor: debe existir con rol admin u owner en la org ──────────
  SELECT role
  INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id         = p_actor_user_id
    AND role IN ('admin', 'owner');

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'create_migrated_client: p_actor_user_id % no es miembro con rol admin/owner '
      'en la organización % — verifique MIGRATION_ACTOR_USER_ID y la membresía.',
      p_actor_user_id, p_organization_id;
  END IF;

  -- ── 2. Impersonar actor para la duración de esta transacción ───────────────
  --    set_config(..., true) = SET LOCAL — expira al final de la transacción.
  --    auth.uid() en PostgreSQL lee request.jwt.claim.sub, por lo que
  --    manage_client_write() verá p_actor_user_id como el usuario actual.
  PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);

  -- ── 3. INSERT con columnas reales de public.clients ────────────────────────
  --    No incluir: legacy_id, migrated_at, migration_version (no existen).
  --    created_by / updated_by los asigna manage_client_write desde auth.uid().
  INSERT INTO public.clients (
    organization_id,
    slug,
    name,
    status,
    industry,
    currency,
    timezone,
    website,
    notes
  ) VALUES (
    p_organization_id,
    p_slug,
    p_name,
    p_status,
    p_industry,
    p_currency,
    p_timezone,
    p_website,
    p_notes
  )
  RETURNING id INTO v_new_id;

  -- ── 4. Restaurar contexto de auth (defensa adicional; SET LOCAL ya expira) ──
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_migrated_client(uuid, uuid, text, text, public.client_status, text, text, text, text, text) IS
  'RPC de migración para insertar un cliente con actor explícito validado. '
  'Solo ejecutable por service_role. Valida rol admin/owner. '
  'Usa set_config para que manage_client_write asigne created_by/updated_by al actor. '
  'No debilita el trigger genérico ni las RLS policies.';

-- Seguridad: solo service_role puede ejecutar esta RPC
REVOKE ALL ON FUNCTION public.create_migrated_client(uuid, uuid, text, text, public.client_status, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_migrated_client(uuid, uuid, text, text, public.client_status, text, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. update_migrated_client
--
-- Actualiza un cliente existente con auditoría correcta vía actor explícito.
-- Garantiza que updated_by quede registrado con el actor de migración.
--
-- Validaciones:
--   - p_client_id debe existir en public.clients.
--   - p_actor_user_id debe ser miembro de la org del cliente con rol admin u owner.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_migrated_client(
  p_client_id        uuid,
  p_actor_user_id    uuid,
  p_name             text,
  p_status           public.client_status  DEFAULT 'active',
  p_industry         text                  DEFAULT NULL,
  p_currency         text                  DEFAULT 'COP',
  p_timezone         text                  DEFAULT 'America/Bogota',
  p_website          text                  DEFAULT NULL,
  p_notes            text                  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id  uuid;
BEGIN
  -- ── 1. Obtener org_id del cliente (la org viene de la BD, no del caller) ───
  SELECT organization_id
  INTO v_org_id
  FROM public.clients
  WHERE id = p_client_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'update_migrated_client: cliente no encontrado o eliminado (id: %)', p_client_id;
  END IF;

  -- ── 2. Validar actor: debe ser admin u owner de la org ─────────────────────
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND user_id         = p_actor_user_id
      AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION
      'update_migrated_client: p_actor_user_id % no es miembro con rol admin/owner '
      'en la organización % del cliente %.',
      p_actor_user_id, v_org_id, p_client_id;
  END IF;

  -- ── 3. Impersonar actor ────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);

  -- ── 4. UPDATE — excluye organization_id, slug, id, created_at, legacy_id ───
  UPDATE public.clients SET
    name     = p_name,
    status   = p_status,
    industry = p_industry,
    currency = p_currency,
    timezone = p_timezone,
    website  = p_website,
    notes    = p_notes
  WHERE id = p_client_id;

  -- ── 5. Restaurar contexto ──────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

COMMENT ON FUNCTION public.update_migrated_client(uuid, uuid, text, public.client_status, text, text, text, text, text) IS
  'RPC de migración para actualizar un cliente con actor explícito validado. '
  'Solo ejecutable por service_role. Valida rol admin/owner. '
  'Usa set_config para que manage_client_write asigne updated_by al actor.';

REVOKE ALL ON FUNCTION public.update_migrated_client(uuid, uuid, text, public.client_status, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_migrated_client(uuid, uuid, text, public.client_status, text, text, text, text, text) TO service_role;

-- =============================================================================
-- FIN DE MIGRACIÓN
-- Aplicar manualmente en: Supabase Dashboard → SQL Editor → Run
-- Luego ejecutar: npm run migrate:phase4 -- --dry-run --verbose
-- =============================================================================
