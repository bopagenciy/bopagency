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
    <aside className="hidden lg:flex lg:flex-col w-64 min-h-screen bg-gray-900 text-white relative">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
        <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center text-white font-bold text-sm">
          B
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">BopIAgency</p>
          <p className="text-xs text-gray-400 leading-tight">Sistema Operativo</p>
        </div>
      </div>

      {/* Org selector */}
      <div className="px-4 py-3 border-b border-gray-700 relative">
        <button
          onClick={() => setOrgSelectorOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors text-sm"
          disabled={isPending}
        >
          <span className="text-gray-300 truncate">{displayOrg?.name ?? 'Sin organización'}</span>
          {organizations.length > 1 && (
            <span className="text-gray-500 text-xs ml-2 shrink-0">▾</span>
          )}
        </button>

        {/* Dropdown */}
        {orgSelectorOpen && organizations.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSwitchOrg(org.id)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${
                  org.id === displayOrg?.id ? 'text-red-400' : 'text-gray-300'
                }`}
              >
                {org.id === displayOrg?.id && <span className="text-xs">✓</span>}
                <span className="truncate">{org.name}</span>
              </button>
            ))}
            <div className="border-t border-gray-700">
              <Link
                href="/onboarding"
                className="block px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
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
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-red-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="px-4 py-4 border-t border-gray-700">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md">
          <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-medium shrink-0 overflow-hidden">
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
            <p className="text-sm text-white truncate">{displayName}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email ?? ''}</p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={isPending}
            title="Cerrar sesión"
            className="text-gray-500 hover:text-red-400 transition-colors text-xs shrink-0"
          >
            ⎋
          </button>
        </div>
      </div>
    </aside>
  );
}
