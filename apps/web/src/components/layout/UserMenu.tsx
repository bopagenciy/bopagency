'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { signOut } from '@/lib/auth/actions';
import type { SidebarUser } from './Sidebar';

export type UserMenuProps = {
  user: SidebarUser | null;
};

export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = user?.fullName ?? user?.email?.split('@')[0] ?? 'Usuario';
  const initials = displayName.charAt(0).toUpperCase();

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

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Menú de ${displayName}`}
        disabled={isPending}
        className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold cursor-pointer hover:bg-primary-hover transition-colors overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
      >
        {user?.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={displayName}
            width={32}
            height={32}
            className="rounded-full object-cover w-full h-full"
          />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menú de usuario"
          className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
        >
          {/* User Info */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            {user?.email && <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>}
          </div>

          {/* Actions */}
          <div className="py-1">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors focus:outline-none focus:bg-muted"
            >
              <span aria-hidden="true" className="text-xs">⚙️</span>
              <span>Configuración</span>
            </Link>
          </div>

          <div className="border-t border-border py-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={isPending}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors focus:outline-none focus:bg-destructive/10 text-left"
            >
              <span aria-hidden="true" className="text-xs">⎋</span>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
