'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { METRIC_PLATFORMS, METRIC_PLATFORM_LABELS } from '@bop-agency/shared';

type PeriodOption = { label: string; value: string };

type MetricsFiltersProps = {
  platform: string;
  period: string;
  periodOptions: PeriodOption[];
};

export function MetricsFilters({ platform, period, periodOptions }: MetricsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    startTransition(() => {
      router.push(`/metrics?${params.toString()}`);
    });
  }

  return (
    <div
      className={`flex flex-col sm:flex-row gap-3 ${isPending ? 'opacity-70' : ''}`}
      role="search"
      aria-label="Filtros de métricas"
    >
      <select
        value={platform}
        onChange={(e) => updateFilter('platform', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
        aria-label="Filtrar por plataforma"
      >
        <option value="">Todas las plataformas</option>
        {METRIC_PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {METRIC_PLATFORM_LABELS[p]}
          </option>
        ))}
      </select>

      {periodOptions.length > 0 && (
        <select
          value={period}
          onChange={(e) => updateFilter('period', e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
          aria-label="Filtrar por período"
        >
          <option value="">Todos los períodos</option>
          {periodOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
