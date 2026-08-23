'use client';

import { useEffect } from 'react';
import { Header } from '@/components/layout/Header';

type ErrorProps = { error: Error & { digest?: string }; reset: () => void };

/**
 * Error boundary para /campaigns — auditoría de completitud Phase 7E.
 * Mismo patrón que apps/web/src/app/(protected)/automations/error.tsx.
 * No expone `error.message`/stack al usuario — solo se loguea en consola
 * del navegador (nunca al servidor, nunca con datos de IA/Supabase crudos).
 */
export default function CampaignsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[CampaignsPage]', error);
  }, [error]);

  return (
    <>
      <Header breadcrumbs={[{ label: 'Campañas' }]} />
      <div className="p-6 flex flex-col items-center justify-center min-h-[40vh] text-center">
        <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Error inesperado</h2>
        <p className="text-sm text-gray-500 mb-4">No se pudo cargar Campaign Studio.</p>
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
        >
          Intentar de nuevo
        </button>
      </div>
    </>
  );
}
