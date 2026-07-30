'use client';

import type { ReactNode } from 'react';

type ProvidersProps = {
  children: ReactNode;
};

/**
 * Root provider wrapper — placeholder para futuros providers
 * (Supabase Auth, Theme, Toast, etc.)
 * Fase 2+: añadir SupabaseProvider, AuthProvider
 */
export function Providers({ children }: ProvidersProps) {
  return <>{children}</>;
}
