import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';

type ProtectedLayoutProps = {
  children: ReactNode;
};

/**
 * Layout para rutas protegidas.
 *
 * Envuelve todas las páginas privadas con AppShell, que:
 * - verifica la sesión
 * - obtiene usuario, perfil, organizaciones y active_organization_id
 * - renderiza Sidebar, AppTopBar (org switcher + user menu) y MobileNav
 * - redirige a /onboarding si el usuario no tiene organizaciones activas
 *
 * El route group (protected) no modifica las URLs.
 */
export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
