'use client';

import { useState } from 'react';
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
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-red-500 flex items-center justify-center text-white font-bold text-xs">
            B
          </div>
          <span className="font-semibold text-sm">Bop Agency</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector de org en móvil */}
          <div className="[&_button]:border-gray-600 [&_button]:text-gray-300 [&_button]:hover:bg-gray-800 [&>div>div]:bg-gray-800 [&>div>div]:border-gray-700 [&>div>div_button]:text-gray-300">
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
            className="p-2 rounded-md hover:bg-gray-800 transition-colors"
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            <span className="text-xl">{open ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {/* Drawer de navegación móvil */}
      {open && (
        <div className="lg:hidden bg-gray-900 text-white border-t border-gray-700">
          <nav className="px-3 py-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-red-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
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
