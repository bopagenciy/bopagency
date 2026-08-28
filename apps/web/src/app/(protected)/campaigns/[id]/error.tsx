'use client';

import { useEffect } from 'react';
import { Header } from '@/components/layout/Header';

type ErrorProps = { error: Error & { digest?: string }; reset: () => void };

/**
 * Error boundary para /campaigns/[id] — auditoría de completitud Phase 7E.
 * `notFound()` en la page sigue manejándose por el `not-found.tsx` de la app
 * (Next.js) — este boundary cubre errores inesperados, no NOT_FOUND.
 */
export default function CampaignDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[CampaignDetailPage]', error);
  }, [error]);

  return (
    <>
      <Header breadcrumbs={[{ label: 'Campañas', href: '/campaigns' }, { label: 'Detalle' }]} />
      <div className="p-6 flex flex-col items-center justify-center min-h-[40vh] text-center">
        <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Error inesperado</h2>
        <p className="text-sm text-gray-500 mb-4">No se pudo cargar el detalle de esta campaña.</p>
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
