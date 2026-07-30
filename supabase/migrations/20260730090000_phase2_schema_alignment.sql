-- =============================================================================
-- BopIAgency — Migración correctiva Fase 2: Alineación de esquema
-- Fecha: 2026-07-30
-- Descripción:
--   Corrige las columnas faltantes detectadas tras aplicar la migración inicial:
--   1. public.organization_members le falta la columna `status`
--   2. public.user_preferences le falta la columna `active_organization_id`
--
-- Esta migración es SEGURA e IDEMPOTENTE: usa ADD COLUMN IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, DO blocks para enums y triggers, etc.
--
-- Para aplicar:
--   Supabase Dashboard > SQL Editor > New query > pegar y ejecutar.
--   O via CLI:  supabase db push  (requiere supabase CLI v2 configurado).
--
-- NO modifica datos existentes salvo para completar valores faltantes.
-- NO elimina columnas ni tablas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUM: membership_status
--    Ciclo de vida de una membresía: active → invited → suspended → removed
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'membership_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.membership_status AS ENUM (
      'active',
      'invited',
      'suspended',
      'removed'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. organization_members.status
--    NOT NULL; DEFAULT 'active' para no romper filas existentes
-- ---------------------------------------------------------------------------

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS status public.membership_status NOT NULL DEFAULT 'active';

-- Backfill: filas existentes que pudieran tener NULL (imposible dado el DEFAULT,
-- pero incluido para máxima seguridad):
UPDATE public.organization_members
SET status = 'active'
WHERE status IS NULL;

-- ---------------------------------------------------------------------------
-- 3. user_preferences.active_organization_id
--    Preferencia por usuario: qué organización está activa en su sesión.
--    NULL hasta que el usuario complete el onboarding.
--    FK con ON DELETE SET NULL para no bloquear borrado de organización.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS active_organization_id uuid
  REFERENCES public.organizations(id)
  ON DELETE SET NULL;

-- Backfill: para usuarios que ya completaron onboarding, copiar el valor
-- de profiles.active_organization_id SOLO si el usuario tiene una membresía
-- activa en esa organización.
-- No se asigna si el usuario tiene varias organizaciones candidatas ambiguas:
-- se usa profiles.active_organization_id como fuente de verdad original.
UPDATE public.user_preferences up
SET active_organization_id = p.active_organization_id
FROM public.profiles p
WHERE up.user_id = p.id
  AND p.active_organization_id IS NOT NULL
  AND up.active_organization_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = p.id
      AND om.organization_id = p.active_organization_id
      AND om.status = 'active'
  );

-- ---------------------------------------------------------------------------
-- 4. ÍNDICES
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_user_prefs_active_org
  ON public.user_preferences(active_organization_id);

CREATE INDEX IF NOT EXISTS idx_org_members_user_status
  ON public.organization_members(user_id, status);

CREATE INDEX IF NOT EXISTS idx_org_members_org_status
  ON public.organization_members(organization_id, status);

-- ---------------------------------------------------------------------------
-- 5. FUNCIONES DE AUTORIZACIÓN ACTUALIZADAS
--    Ahora filtran por status = 'active' para no conceder acceso a membresías
--    suspendidas o eliminadas.
-- ---------------------------------------------------------------------------

-- is_organization_member: solo miembros activos cuentan
CREATE OR REPLACE FUNCTION public.is_organization_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- has_organization_role: solo miembros activos con el rol requerido
CREATE OR REPLACE FUNCTION public.has_organization_role(p_org_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND CASE p_role
        WHEN 'viewer'     THEN role IN ('viewer','operator','strategist','admin','owner')
        WHEN 'operator'   THEN role IN ('operator','strategist','admin','owner')
        WHEN 'strategist' THEN role IN ('strategist','admin','owner')
        WHEN 'admin'      THEN role IN ('admin','owner')
        WHEN 'owner'      THEN role = 'owner'
        ELSE false
      END
  );
$$;

-- current_active_organization_id: lee de user_preferences (fuente de verdad)
CREATE OR REPLACE FUNCTION public.current_active_organization_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT active_organization_id
  FROM public.user_preferences
  WHERE user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC ATÓMICA ACTUALIZADA: create_organization_with_owner
--    Cambios respecto a v1:
--    - Inserta organization_members con status = 'active'
--    - Actualiza user_preferences.active_organization_id (fuente de verdad)
--    - Mantiene actualización de profiles para compatibilidad hacia atrás
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  organization_name text,
  organization_slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id  uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Validar usuario autenticado
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'create_organization_with_owner: usuario no autenticado';
  END IF;

  -- Crear organización
  INSERT INTO public.organizations (name, slug, plan, settings)
  VALUES (organization_name, organization_slug, 'free', '{}')
  RETURNING id INTO v_org_id;

  -- Crear membresía owner con status = active
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_org_id, v_user_id, 'owner', 'active');

  -- Establecer organización activa en user_preferences (fuente de verdad)
  INSERT INTO public.user_preferences (user_id, active_organization_id)
  VALUES (v_user_id, v_org_id)
  ON CONFLICT (user_id) DO UPDATE
    SET active_organization_id = v_org_id,
        updated_at              = now();

  -- Mantener profiles por compatibilidad hacia atrás
  UPDATE public.profiles
  SET active_organization_id = v_org_id
  WHERE id = v_user_id;

  RETURN v_org_id;
END;
$$;

-- GRANT sigue siendo el mismo (la función ya existía)
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. TRIGGER DE INTEGRIDAD: check_active_org_membership
--    Impide que user_preferences.active_organization_id apunte a una
--    organización donde el usuario no tenga membresía activa.
--    Se crea DESPUÉS del backfill para no bloquear la migración.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_active_org_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active_organization_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id          = NEW.user_id
        AND organization_id  = NEW.active_organization_id
        AND status           = 'active'
    ) THEN
      RAISE EXCEPTION
        'check_active_org_membership: el usuario no tiene membresía activa en la organización %',
        NEW.active_organization_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname    = 'trg_check_active_org_membership'
      AND tgrelid   = 'public.user_preferences'::regclass
  ) THEN
    CREATE TRIGGER trg_check_active_org_membership
      BEFORE INSERT OR UPDATE OF active_organization_id
      ON public.user_preferences
      FOR EACH ROW
      WHEN (NEW.active_organization_id IS NOT NULL)
      EXECUTE FUNCTION public.check_active_org_membership();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS: ACTUALIZAR POLÍTICAS DE organization_members
--    Las políticas existentes no filtraban por status; las recreamos
--    para ser explícitos (las funciones de autorización ya filtran por
--    status = 'active', pero las políticas de SELECT deben también).
-- ---------------------------------------------------------------------------

-- SELECT: el usuario puede ver su propio registro (cualquier status) O
-- ver los registros activos de sus organizaciones.
DROP POLICY IF EXISTS "org_members_select" ON public.organization_members;
CREATE POLICY "org_members_select"
  ON public.organization_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      status = 'active'
      AND public.is_organization_member(organization_id)
    )
  );

-- INSERT: admin/owner activo de la org, O el propio usuario al aceptar invitación
DROP POLICY IF EXISTS "org_members_insert_admin" ON public.organization_members;
CREATE POLICY "org_members_insert_admin"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    public.can_manage_organization(organization_id)
    OR user_id = auth.uid()
  );

-- UPDATE: solo admin/owner activo puede cambiar role o status de un miembro
DROP POLICY IF EXISTS "org_members_update_admin" ON public.organization_members;
CREATE POLICY "org_members_update_admin"
  ON public.organization_members FOR UPDATE
  USING  (public.can_manage_organization(organization_id))
  WITH CHECK (public.can_manage_organization(organization_id));

-- DELETE: el propio usuario sale, o admin/owner lo elimina
DROP POLICY IF EXISTS "org_members_delete_admin_or_self" ON public.organization_members;
CREATE POLICY "org_members_delete_admin_or_self"
  ON public.organization_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.can_manage_organization(organization_id)
  );

-- ---------------------------------------------------------------------------
-- FIN DE MIGRACIÓN CORRECTIVA
-- ---------------------------------------------------------------------------
