'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import type { AutomationStatus } from '@bop-agency/domain';

const AUTOMATION_STATUSES: AutomationStatus[] = ['draft', 'active', 'paused', 'archived'];

const STATUS_LABELS: Record<AutomationStatus, string> = {
  draft: 'Borrador',
  active: 'Activa',
  paused: 'Pausada',
  archived: 'Archivada',
};

type AutomationsFiltersProps = {
  status: string;
};

export function AutomationsFilters({ status }: AutomationsFiltersProps) {
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
      router.push(`/automations?${params.toString()}`);
    });
  }

  return (
    <div
      className={`flex flex-col sm:flex-row gap-3 ${isPending ? 'opacity-70' : ''}`}
      role="search"
      aria-label="Filtros de automatizaciones"
    >
      <select
        value={status}
        onChange={(e) => updateFilter('status', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        aria-label="Filtrar por estado"
      >
        <option value="">Todos los estados</option>
        {AUTOMATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
