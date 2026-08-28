'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { switchActiveOrganizationAction } from '@/app/(protected)/settings/actions';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/clients', label: 'Clientes', icon: '👥' },
  { href: '/campaigns', label: 'Campañas', icon: '📢' },
  { href: '/automations', label: 'Automatizaciones', icon: '⚙️' },
  { href: '/reports', label: 'Reportes', icon: '📄' },
  { href: '/metrics', label: 'Métricas', icon: '📈' },
  { href: '/alerts', label: 'Alertas', icon: '🔔' },
  { href: '/tasks', label: 'Tareas', icon: '✅' },
  { href: '/settings', label: 'Configuración', icon: '🔧' },
];

export type SidebarOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type SidebarUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

type SidebarProps = {
  organizations?: SidebarOrganization[];
  activeOrganization?: SidebarOrganization | null;
  user?: SidebarUser | null;
};

export function Sidebar({ organizations = [], activeOrganization, user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [orgSelectorOpen, setOrgSelectorOpen] = useState(false);

  const displayOrg = activeOrganization ?? organizations[0] ?? null;
  const displayName = user?.fullName ?? user?.email?.split('@')[0] ?? 'Usuario';
  const initials = displayName.charAt(0).toUpperCase();

  async function handleSignOut() {
    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    });
  }

  async function handleSwitchOrg(orgId: string) {
    startTransition(async () => {
      await switchActiveOrganizationAction(orgId);
      setOrgSelectorOpen(false);
      router.refresh();
    });
  }

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 min-h-screen bg-sidebar text-sidebar-foreground relative">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-sidebar-border">
        {/* Micro-polish: asset recortado (bopagency-logo-trimmed.png) sin
            margen transparente sobrante; contenedor no-cuadrado (82x44)
            que respeta el aspect ratio real del artwork (~1.86:1) en vez
            de forzar un cuadrado que dejaba franjas vacías arriba/abajo. */}
        <div className="shrink-0 w-[82px] h-11 rounded-lg bg-white/95 flex items-center justify-center overflow-hidden p-1">
          <Image
            src="/brand/bopagency-logo-trimmed.png"
            alt="Bop Agency"
            width={82}
            height={44}
            priority
            className="w-full h-full object-contain"
          />
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight text-sidebar-foreground">BopIAgency</p>
          <p className="text-xs text-sidebar-muted leading-tight">Sistema Operativo</p>
        </div>
      </div>

      {/* Org selector */}
      <div className="px-4 py-3 border-b border-sidebar-border relative">
        <button
          onClick={() => setOrgSelectorOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-sidebar-hover hover:bg-sidebar-active transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-primary-accent focus:ring-offset-2 focus:ring-offset-sidebar"
          disabled={isPending}
        >
          <span className="text-sidebar-foreground truncate">
            {displayOrg?.name ?? 'Sin organización'}
          </span>
          {organizations.length > 1 && (
            <span className="text-sidebar-muted text-xs ml-2 shrink-0">▾</span>
          )}
        </button>

        {/* Dropdown */}
        {orgSelectorOpen && organizations.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-sidebar-hover border border-sidebar-border rounded-lg shadow-xl overflow-hidden">
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSwitchOrg(org.id)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-sidebar-active transition-colors flex items-center gap-2 ${
                  org.id === displayOrg?.id ? 'text-primary-accent font-medium' : 'text-sidebar-muted'
                }`}
              >
                {org.id === displayOrg?.id && <span className="text-xs">✓</span>}
                <span className="truncate">{org.name}</span>
              </button>
            ))}
            <div className="border-t border-sidebar-border">
              <Link
                href="/onboarding"
                className="block px-3 py-2.5 text-sm text-sidebar-muted hover:bg-sidebar-active transition-colors"
                onClick={() => setOrgSelectorOpen(false)}
              >
                + Nueva organización
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-r-md text-sm transition-colors border-l-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                isActive
                  ? 'bg-primary-accent/15 border-primary-accent text-sidebar-foreground font-medium'
                  : 'border-transparent text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md">
          <div className="w-8 h-8 rounded-full bg-primary-accent flex items-center justify-center text-white text-sm font-medium shrink-0 overflow-hidden">
            {user?.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={displayName}
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-sidebar-foreground truncate">{displayName}</p>
            <p className="text-xs text-sidebar-muted truncate">{user?.email ?? ''}</p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={isPending}
            title="Cerrar sesión"
            className="text-sidebar-muted hover:text-primary-accent transition-colors text-xs shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-accent rounded"
          >
            ⎋
          </button>
        </div>
      </div>
    </aside>
  );
}
