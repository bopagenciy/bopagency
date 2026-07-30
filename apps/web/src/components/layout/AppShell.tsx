import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { AppTopBar } from './AppTopBar';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type AppShellProps = {
  children: ReactNode;
};

/**
 * AppShell — Server Component.
 *
 * Obtiene los datos del usuario y organizaciones desde Supabase
 * para pasarlos a los componentes de layout.
 * Si no hay sesión, renderiza el layout vacío (el middleware maneja la redirección).
 */
export async function AppShell({ children }: AppShellProps) {
  let organizations: Array<{ id: string; name: string; slug: string }> = [];
  let activeOrganizationId: string | null = null;
  let activeOrganization: { id: string; name: string; slug: string } | null = null;
  let sidebarUser: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null = null;
  let isAuthenticated = false;
  let needsOnboarding = false;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      isAuthenticated = true;
      sidebarUser = {
        id: user.id,
        email: user.email ?? '',
        fullName: null,
        avatarUrl: null,
      };

      // Obtener perfil y preferencias en paralelo
      const [{ data: profile }, { data: prefs }] = await Promise.all([
        supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),
        supabase
          .from('user_preferences')
          .select('active_organization_id')
          .eq('user_id', user.id)
          .single(),
      ]);

      if (profile) {
        sidebarUser.fullName = profile.full_name;
        sidebarUser.avatarUrl = profile.avatar_url;
      }

      // Obtener solo organizaciones con membresía activa
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(id, name, slug)')
        .eq('user_id', user.id)
        .eq('status', 'active');

      type OrgShape = { id: string; name: string; slug: string };
      organizations = (memberships ?? [])
        .flatMap((m) => {
          const org = m.organizations as OrgShape | OrgShape[] | null;
          if (!org) return [];
          return Array.isArray(org) ? org : [org];
        })
        .filter((o): o is OrgShape => Boolean(o.id));

      // Determinar organización activa desde user_preferences
      activeOrganizationId = prefs?.active_organization_id ?? null;
      if (activeOrganizationId) {
        activeOrganization = organizations.find((o) => o.id === activeOrganizationId) ?? null;
      }
      if (!activeOrganization && organizations.length > 0) {
        activeOrganization = organizations[0] ?? null;
        activeOrganizationId = activeOrganization?.id ?? null;
      }

      // Usuario autenticado sin membresías activas → necesita onboarding
      if (organizations.length === 0) {
        needsOnboarding = true;
      }
    }
  } catch {
    // No session or error — render empty layout, middleware handles redirect
  }

  // Redirigir fuera del try/catch para no suprimir el NEXT_REDIRECT
  if (isAuthenticated && needsOnboarding) {
    redirect('/onboarding');
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Sidebar de escritorio */}
      <Sidebar
        organizations={organizations}
        activeOrganization={activeOrganization}
        user={sidebarUser}
      />

      {/* Área principal */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Barra superior móvil (hamburger menu) */}
        <MobileNav
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          user={sidebarUser}
        />

        {/* Barra superior de escritorio — selector org + menú usuario */}
        <AppTopBar
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          user={sidebarUser}
        />

        {/* Contenido de página */}
        <main className="flex-1 bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
