'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ALERT_STATUSES, ALERT_SEVERITIES } from '@bop-agency/shared';
import type { AlertStatus, AlertSeverity } from '@bop-agency/shared';

const STATUS_LABELS: Record<AlertStatus, string> = {
  active: 'Activa',
  acknowledged: 'Reconocida',
  snoozed: 'Silenciada',
  resolved: 'Resuelta',
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: 'Crítica',
  warning: 'Advertencia',
  info: 'Info',
};

type AlertsFiltersProps = {
  status: string;
  severity: string;
};

export function AlertsFilters({ status, severity }: AlertsFiltersProps) {
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
      router.push(`/alerts?${params.toString()}`);
    });
  }

  return (
    <div
      className={`flex flex-col sm:flex-row gap-3 ${isPending ? 'opacity-70' : ''}`}
      role="search"
      aria-label="Filtros de alertas"
    >
      <select
        value={status}
        onChange={(e) => updateFilter('status', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        aria-label="Filtrar por estado"
      >
        <option value="">Todos los estados</option>
        {ALERT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <select
        value={severity}
        onChange={(e) => updateFilter('severity', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        aria-label="Filtrar por severidad"
      >
        <option value="">Todas las severidades</option>
        {ALERT_SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {SEVERITY_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
