/**
 * AppTopBar — Server Component
 *
 * Barra superior visible en escritorio (hidden lg:flex).
 * Recibe datos ya obtenidos por AppShell y los pasa
 * a los Client Components OrganizationSwitcher y UserMenu.
 *
 * No importa next/headers ni lib/supabase/server.ts — los datos
 * vienen como props del Server Component padre.
 */
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { UserMenu } from './UserMenu';
import type { SidebarOrganization, SidebarUser } from './Sidebar';

type AppTopBarProps = {
  organizations: SidebarOrganization[];
  activeOrganizationId: string | null;
  user: SidebarUser | null;
};

export function AppTopBar({ organizations, activeOrganizationId, user }: AppTopBarProps) {
  return (
    <div className="hidden lg:flex items-center justify-end bg-card border-b border-border px-6 py-2.5 gap-3 shrink-0">
      <OrganizationSwitcher
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
      />
      <UserMenu user={user} />
    </div>
  );
}
