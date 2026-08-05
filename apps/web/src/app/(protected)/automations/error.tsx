'use client';

import { useEffect } from 'react';
import { Header } from '@/components/layout/Header';

type ErrorProps = { error: Error & { digest?: string }; reset: () => void };

export default function AutomationsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[AutomationsPage]', error);
  }, [error]);

  return (
    <>
      <Header breadcrumbs={[{ label: 'Automatizaciones' }]} />
      <div className="p-6 flex flex-col items-center justify-center min-h-[40vh] text-center">
        <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Error inesperado</h2>
        <p className="text-sm text-gray-500 mb-4">
          No se pudo cargar la página de automatizaciones.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
        >
          Intentar de nuevo
        </button>
      </div>
    </>
  );
}
