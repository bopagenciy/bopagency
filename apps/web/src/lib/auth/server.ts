/**
 * Helpers de autenticación y autorización para Server Components y Server Actions.
 *
 * Estos helpers nunca exponen información sensible al cliente.
 * Todos son async y solo funcionan en contextos server-side.
 */
import 'server-only';

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { OrganizationRole } from '@/lib/supabase/types';
import type { ProfileRow, OrganizationRow, OrganizationMemberRow } from '@/lib/supabase/types';

export type AuthUser = {
  id: string;
  email: string;
};

export type UserWithProfile = AuthUser & {
  profile: ProfileRow | null;
};

export type OrganizationContext = {
  user: AuthUser;
  organization: OrganizationRow;
  membership: OrganizationMemberRow;
};

// Jerarquía de roles (mayor índice = mayor privilegio)
const ROLE_HIERARCHY: OrganizationRole[] = ['viewer', 'operator', 'strategist', 'admin', 'owner'];

function roleIndex(role: OrganizationRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function hasMinimumRole(
  userRole: OrganizationRole,
  requiredRole: OrganizationRole,
): boolean {
  return roleIndex(userRole) >= roleIndex(requiredRole);
}

// --- Helpers de autenticación ---

/**
 * Obtiene el usuario autenticado.
 * Si no hay sesión, redirige a /login.
 */
export async function requireUser(): Promise<AuthUser> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  return {
    id: user.id,
    email: user.email ?? '',
  };
}

/**
 * Obtiene el usuario autenticado junto con su perfil.
 * Si no hay sesión, redirige a /login.
 */
export async function requireUserWithProfile(): Promise<UserWithProfile> {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  return { ...user, profile: profile ?? null };
}

/**
 * Verifica que el usuario pertenece a la organización activa.
 * Si no tiene org activa o no pertenece → redirige a /onboarding o /access-denied.
 */
export async function requireOrganization(orgId?: string): Promise<OrganizationContext> {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  // Si no se pasa orgId, usar la org activa de user_preferences (fuente de verdad)
  let targetOrgId = orgId;
  if (!targetOrgId) {
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('active_organization_id')
      .eq('user_id', user.id)
      .single();

    targetOrgId = prefs?.active_organization_id ?? undefined;
  }

  if (!targetOrgId) {
    // Sin organización activa → onboarding
    redirect('/onboarding');
  }

  // Verificar membresía activa
  const { data: membership } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', targetOrgId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (!membership) {
    redirect('/access-denied');
  }

  // Obtener la organización
  const { data: organization } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', targetOrgId)
    .single();

  if (!organization) {
    redirect('/access-denied');
  }

  return { user, organization, membership };
}

/**
 * Verifica que el usuario tiene al menos el rol requerido en la organización.
 * Si no tiene el rol → redirige a /access-denied.
 */
export async function requireOrganizationRole(
  requiredRole: OrganizationRole,
  orgId?: string,
): Promise<OrganizationContext> {
  const context = await requireOrganization(orgId);

  if (!hasMinimumRole(context.membership.role, requiredRole)) {
    redirect('/access-denied');
  }

  return context;
}

/**
 * Obtiene la membresía actual del usuario sin redirigir.
 * Retorna null si el usuario no está autenticado o no tiene organización activa.
 */
export async function getCurrentMembership(): Promise<OrganizationContext | null> {
  try {
    return await requireOrganization();
  } catch {
    return null;
  }
}
