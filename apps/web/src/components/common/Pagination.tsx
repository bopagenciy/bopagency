'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

type PaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  /** Texto singular para el conteo (ej. "alerta", "tarea"). */
  itemLabel?: string;
};

export function Pagination({
  page,
  totalPages,
  total,
  pageSize: _pageSize,
  itemLabel = 'resultado',
}: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  const labelPlural = itemLabel.endsWith('a')
    ? itemLabel.replace(/a$/, 'as')
    : itemLabel.endsWith('e')
      ? `${itemLabel}s`
      : `${itemLabel}s`;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
      <p className="text-sm text-gray-500">
        {total === 0
          ? `Sin ${labelPlural}`
          : `${total} ${total === 1 ? itemLabel : labelPlural}${totalPages > 1 ? ` — página ${page} de ${totalPages}` : ''}`}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || isPending}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Página anterior"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-500" aria-current="page">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || isPending}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Página siguiente"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
