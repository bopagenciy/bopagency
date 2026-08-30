'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

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

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 min-h-screen bg-sidebar text-sidebar-foreground shrink-0 border-r border-sidebar-border">
      {/* Light Brand Header Zone */}
      <div className="bg-white border-b border-sidebar-border px-5 py-3.5 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded">
          <Image
            src="/brand/bopagency-logo.png"
            alt="BopAgency"
            width={140}
            height={36}
            priority
            className="h-9 w-auto object-contain"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-r-md text-sm transition-colors border-l-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                isActive
                  ? 'bg-sidebar-hover border-sidebar-accent text-sidebar-foreground font-medium'
                  : 'border-transparent text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="px-4 py-3.5 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-md">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0 overflow-hidden">
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
            <p className="text-xs font-medium text-sidebar-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-sidebar-muted truncate">{user?.email ?? ''}</p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={isPending}
            title="Cerrar sesión"
            className="text-sidebar-muted hover:text-sidebar-foreground transition-colors text-xs shrink-0 focus:outline-none focus:ring-1 focus:ring-sidebar-accent rounded p-1"
          >
            ⎋
          </button>
        </div>
      </div>
    </aside>
  );
}
