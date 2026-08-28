'use client';

import { useEffect } from 'react';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-6xl mb-4">⚠️</div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Algo salió mal</h1>
      <p className="text-gray-500 mb-2 max-w-md">Ocurrió un error inesperado.</p>
      {error.digest && <p className="text-xs text-gray-400 mb-6 font-mono">ID: {error.digest}</p>}
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors text-sm font-medium"
      >
        Intentar nuevamente
      </button>
    </div>
  );
}
