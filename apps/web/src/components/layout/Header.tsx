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
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Migas de pan */}
        <div className="flex items-center gap-1 text-sm text-gray-500">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-gray-900 transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span className="text-gray-900 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
          {title && breadcrumbs.length === 0 && (
            <span className="text-gray-900 font-medium">{title}</span>
          )}
        </div>
        {/* Slot de acciones */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
