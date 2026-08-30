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
      {/* Integrated Light Mobile Top Header Bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-white text-foreground border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2 focus:outline-none rounded">
          <Image
            src="/brand/bopagency-logo.png"
            alt="BopAgency"
            width={110}
            height={28}
            className="h-7 w-auto object-contain"
          />
        </Link>

        <div className="flex items-center gap-2">
          {/* Org Selector */}
          <OrganizationSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
          />

          {/* User Menu */}
          <UserMenu user={user} />

          {/* Hamburger Toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            <span className="text-xl leading-none">{open ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {open && (
        <div className="lg:hidden bg-sidebar text-sidebar-foreground border-b border-sidebar-border shadow-xl">
          <nav className="px-3 py-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-r-md text-sm transition-colors border-l-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent ${
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
        </div>
      )}
    </>
  );
}
