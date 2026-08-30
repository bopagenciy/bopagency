
'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { switchActiveOrganizationAction } from '@/app/(protected)/settings/actions';
import type { SidebarOrganization } from './Sidebar';

export type OrganizationSwitcherProps = {
  organizations: SidebarOrganization[];
  activeOrganizationId: string | null;
};

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
}: OrganizationSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const activeOrg =
    organizations.find((o) => o.id === activeOrganizationId) ?? organizations[0] ?? null;

  // Cierra al hacer clic fuera
  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Cierra con Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function handleSwitchOrg(orgId: string) {
    if (orgId === activeOrg?.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await switchActiveOrganizationAction(orgId);
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Seleccionar organización"
        disabled={isPending}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted/80 transition-colors text-foreground max-w-[220px] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
      >
        <span className="truncate">{activeOrg?.name ?? 'Seleccionar organización'}</span>
        {isPending ? (
          <span className="shrink-0 text-muted-foreground text-xs" aria-hidden="true">
            ⟳
          </span>
        ) : (
          <span className="shrink-0 text-muted-foreground text-xs" aria-hidden="true">
            ▾
          </span>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Lista de organizaciones"
          className="absolute right-0 mt-1 min-w-[220px] bg-card border border-border rounded-lg shadow-md z-50 overflow-hidden"
        >
          {organizations.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">Sin organizaciones activas</p>
          ) : (
            organizations.map((org) => {
              const isActive = org.id === activeOrg?.id;
              return (
                <button
                  key={org.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSwitchOrg(org.id)}
                  disabled={isPending}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2 ${
                    isActive ? 'text-foreground font-medium bg-muted/60' : 'text-muted-foreground'
                  }`}
                >
                  {isActive && <span className="text-xs text-amber-600 font-medium">✓</span>}
                  <span className="truncate">{org.name}</span>
                </button>
              );
            })
          )}
          <div className="border-t border-border">
            <Link
              href="/onboarding"
              className="block px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setOpen(false)}
            >
              + Nueva organización
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
