-- =============================================================================
-- BopIAgency — Migración Fase 2: Autenticación y Multi-tenancy
-- Fecha: 2026-07-30
-- Descripción: Tablas base de identidad, organizaciones y RLS
--
-- IMPORTANTE: Ejecutar en Supabase Dashboard > SQL Editor o via Supabase CLI:
--   supabase db push
--   supabase migration up
--
-- Las tablas de esta migración son la base de todo el sistema multi-tenant.
-- NUNCA modificar las funciones de RLS sin revisar el impacto en TODAS las tablas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONES
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. TABLA: profiles
-- Extiende auth.users con datos de perfil público.
-- Se crea automáticamente via trigger cuando un usuario se registra.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id                      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                   text        NOT NULL,
  full_name               text,
  avatar_url              text,
  active_organization_id  uuid,       -- FK añadida después de crear organizations
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Perfiles públicos de usuarios. Extiende auth.users.';

-- ---------------------------------------------------------------------------
-- 2. TABLA: organizations
-- Nivel raíz del sistema multi-tenant.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  plan        text        NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  settings    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS 'Organizaciones (tenants). Raíz del sistema multi-tenant.';
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- Ahora que organizations existe, añadir FK en profiles
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_active_organization
  FOREIGN KEY (active_organization_id)
  REFERENCES public.organizations(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. TABLA: organization_members
-- Tabla puente entre usuarios y organizaciones con rol por organización.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_members (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             text        NOT NULL CHECK (role IN ('owner', 'admin', 'strategist', 'operator', 'viewer')),
  invited_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE(organization_id, user_id)
);

COMMENT ON TABLE public.organization_members IS 'Membresías de usuarios en organizaciones. El rol es por organización.';

CREATE INDEX IF NOT EXISTS idx_org_members_org_id   ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id  ON public.organization_members(user_id);

-- ---------------------------------------------------------------------------
-- 4. TABLA: organization_invitations
-- Invitaciones pendientes de aceptar.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email            text        NOT NULL,
  role             text        NOT NULL CHECK (role IN ('admin', 'strategist', 'operator', 'viewer')),
  invited_by       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token            text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at       timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_invitations IS 'Invitaciones pendientes de aceptar para unirse a una organización.';

CREATE INDEX IF NOT EXISTS idx_invitations_org_id ON public.organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email  ON public.organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token  ON public.organization_invitations(token);

-- ---------------------------------------------------------------------------
-- 5. TABLA: user_preferences
-- Preferencias de usuario (idioma, zona horaria, notificaciones).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  language              text        NOT NULL DEFAULT 'es',
  timezone              text        NOT NULL DEFAULT 'America/Bogota',
  email_notifications   boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_preferences IS 'Preferencias por usuario (independiente de la organización).';

-- ---------------------------------------------------------------------------
-- 6. TRIGGER: updated_at automático
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. TRIGGER: Creación automática de perfil al registrarse
-- Se dispara cuando Supabase Auth crea un nuevo usuario.
-- SECURITY DEFINER: necesita bypassear RLS para insertar el perfil.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Inserción idempotente del perfil
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;

  -- Preferencias por defecto
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Crear trigger SOLO si no existe (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. FUNCIONES DE AUTORIZACIÓN
-- Usadas por las RLS policies. Todas son SECURITY DEFINER para acceder
-- a organization_members sin ciclos de policy.
-- ---------------------------------------------------------------------------

-- Retorna true si el usuario autenticado es miembro de la organización
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
  );
$$;

-- Retorna true si el usuario tiene el rol especificado O uno superior
-- Jerarquía: viewer < operator < strategist < admin < owner
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

-- Retorna el ID de la organización activa del usuario
CREATE OR REPLACE FUNCTION public.current_active_organization_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT active_organization_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

-- Retorna true si el usuario puede gestionar la organización (admin o owner)
CREATE OR REPLACE FUNCTION public.can_manage_organization(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_organization_role(p_org_id, 'admin');
$$;

-- ---------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------------

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences        ENABLE ROW LEVEL SECURITY;

-- --- profiles ---
-- Un usuario solo puede ver y editar su propio perfil

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- El trigger handle_new_user() crea el perfil con SECURITY DEFINER,
-- por lo que no necesitamos una política INSERT aquí para usuarios normales.

-- --- organizations ---
-- Ver: miembro de la org
-- Crear: cualquier usuario autenticado (para onboarding)
-- Actualizar: admin o owner
-- Eliminar: solo owner

CREATE POLICY "organizations_select_member"
  ON public.organizations FOR SELECT
  USING (public.is_organization_member(id));

CREATE POLICY "organizations_insert_authenticated"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "organizations_update_admin"
  ON public.organizations FOR UPDATE
  USING (public.can_manage_organization(id))
  WITH CHECK (public.can_manage_organization(id));

CREATE POLICY "organizations_delete_owner"
  ON public.organizations FOR DELETE
  USING (public.has_organization_role(id, 'owner'));

-- --- organization_members ---
-- Ver: miembros de la misma org o el propio registro
-- Insertar: admin/owner de la org O el propio usuario al aceptar invitación
-- Actualizar: admin/owner de la org (cambiar roles)
-- Eliminar: admin/owner O el propio usuario (salir de la org)

CREATE POLICY "org_members_select"
  ON public.organization_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_organization_member(organization_id)
  );

CREATE POLICY "org_members_insert_admin"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    public.can_manage_organization(organization_id)
    OR user_id = auth.uid()  -- el propio usuario acepta invitación
  );

CREATE POLICY "org_members_update_admin"
  ON public.organization_members FOR UPDATE
  USING (public.can_manage_organization(organization_id))
  WITH CHECK (public.can_manage_organization(organization_id));

CREATE POLICY "org_members_delete_admin_or_self"
  ON public.organization_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.can_manage_organization(organization_id)
  );

-- --- organization_invitations ---
-- Ver: admin/owner de la org o el propio destinatario (por email)
-- Crear: admin/owner de la org
-- Actualizar: destinatario (aceptar/rechazar) o admin/owner (cancelar)
-- Eliminar: admin/owner

CREATE POLICY "invitations_select"
  ON public.organization_invitations FOR SELECT
  USING (
    public.can_manage_organization(organization_id)
    OR email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "invitations_insert_admin"
  ON public.organization_invitations FOR INSERT
  WITH CHECK (public.can_manage_organization(organization_id));

CREATE POLICY "invitations_update"
  ON public.organization_invitations FOR UPDATE
  USING (
    public.can_manage_organization(organization_id)
    OR email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "invitations_delete_admin"
  ON public.organization_invitations FOR DELETE
  USING (public.can_manage_organization(organization_id));

-- --- user_preferences ---
-- Solo el propio usuario puede ver y modificar sus preferencias

CREATE POLICY "user_preferences_select_own"
  ON public.user_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user_preferences_update_own"
  ON public.user_preferences FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 10. GRANTS — acceso al schema public para el rol authenticated
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_active_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_organization(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. RPC ATÓMICA: create_organization_with_owner
--
-- Crea organización + membresía owner + activa la org en el perfil
-- en una sola transacción.
-- Usada desde onboarding Server Action (nunca directamente desde el cliente).
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
  v_org_id uuid;
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

  -- Crear membresía como owner
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Activar la org en el perfil del usuario
  UPDATE public.profiles
  SET active_organization_id = v_org_id
  WHERE id = v_user_id;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- FIN DE MIGRACIÓN
-- ---------------------------------------------------------------------------
