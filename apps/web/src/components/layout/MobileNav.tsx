'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { UserMenu } from './UserMenu';
import type { SidebarOrganization, SidebarUser } from './Sidebar';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/clients', label: 'Clientes', icon: '👥' },
  { href: '/campaigns', label: 'Campañas', icon: '📢' },
  { href: '/automations', label: 'Automatizaciones', icon: '⚙️' },
  { href: '/reports', label: 'Reportes', icon: '📄' },
  { href: '/alerts', label: 'Alertas', icon: '🔔' },
  { href: '/tasks', label: 'Tareas', icon: '✅' },
  { href: '/settings', label: 'Configuración', icon: '🔧' },
];

type MobileNavProps = {
  organizations?: SidebarOrganization[];
  activeOrganizationId?: string | null;
  user?: SidebarUser | null;
};

export function MobileNav({
  organizations = [],
  activeOrganizationId = null,
  user = null,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Barra superior móvil */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2">
          {/* Micro-polish: mismo asset recortado + contenedor no-cuadrado
              (60x32) que Sidebar.tsx, ver comentario ahí. */}
          <div className="shrink-0 w-[60px] h-8 rounded bg-white/95 flex items-center justify-center overflow-hidden p-0.5">
            <Image
              src="/brand/bopagency-logo-trimmed.png"
              alt="Bop Agency"
              width={60}
              height={32}
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-semibold text-sm">Bop Agency</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector de org en móvil */}
          <div className="[&_button]:border-sidebar-border [&_button]:text-sidebar-muted [&_button]:hover:bg-sidebar-hover [&>div>div]:bg-sidebar-hover [&>div>div]:border-sidebar-border [&>div>div_button]:text-sidebar-muted">
            <OrganizationSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
            />
          </div>

          {/* Menú de usuario en móvil */}
          <UserMenu user={user} />

          {/* Botón hamburguesa */}
          <button
            onClick={() => setOpen(!open)}
            className="p-2 rounded-md hover:bg-sidebar-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary-accent"
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            <span className="text-xl">{open ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {/* Drawer de navegación móvil */}
      {open && (
        <div className="lg:hidden bg-sidebar text-sidebar-foreground border-t border-sidebar-border">
          <nav className="px-3 py-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-r-md text-sm transition-colors border-l-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                    isActive
                      ? 'bg-primary-accent/15 border-primary-accent text-sidebar-foreground font-medium'
                      : 'border-transparent text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
