'use client';

import type { ReactNode } from 'react';
import type { BreadcrumbItem } from '@/types';

type HeaderProps = {
  breadcrumbs?: BreadcrumbItem[];
  title?: string;
  /** Slot para botones de acción en el lado derecho del header */
  actions?: ReactNode;
};

export function Header({ breadcrumbs = [], title, actions }: HeaderProps) {
  return (
    <header className="bg-card border-b border-border px-6 py-3.5">
      <div className="flex items-center justify-between">
        {/* Migas de pan */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-border">/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span className="text-foreground font-semibold text-base">{crumb.label}</span>
              )}
            </span>
          ))}
          {title && breadcrumbs.length === 0 && (
            <span className="text-foreground font-semibold text-base">{title}</span>
          )}
        </div>
        {/* Slot de acciones */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
