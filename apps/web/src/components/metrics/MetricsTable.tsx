'use client';

import { EmptyState } from '@/components/common/EmptyState';
import type { MetricSummary } from '@bop-agency/domain';
import { METRIC_PLATFORM_LABELS } from '@bop-agency/shared';

type MetricsTableProps = {
  metrics: MetricSummary[];
};

function formatNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCurrency(n: number, currency = 'COP'): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)} ${currency}`;
}

function formatRoas(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  return `${n.toFixed(2)}x`;
}

function formatPeriod(start: Date, end: Date): string {
  const s = start.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
  const e = end.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
  return s === e ? s : `${s} – ${e}`;
}

export function MetricsTable({ metrics }: MetricsTableProps) {
  if (metrics.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="Sin métricas"
        description="No hay métricas disponibles para los filtros seleccionados."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm whitespace-nowrap" aria-label="Tabla de métricas">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600 sticky left-0 bg-gray-50">
              Período
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Plataforma</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
              Cuenta
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Gasto</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600 hidden md:table-cell">
              Impresiones
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600 hidden md:table-cell">
              Clics
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Leads</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600 hidden lg:table-cell">
              ROAS
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {metrics.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white">
                {formatPeriod(m.periodStart, m.periodEnd)}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {METRIC_PLATFORM_LABELS[m.platform] ?? m.platform}
              </td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell max-w-xs truncate">
                {m.accountName ?? m.accountId}
              </td>
              <td className="px-4 py-3 text-right text-gray-900 font-medium">
                {formatCurrency(m.metrics.spend, m.currency)}
              </td>
              <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                {formatNumber(m.metrics.impressions)}
              </td>
              <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                {formatNumber(m.metrics.clicks)}
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {m.metrics.leads > 0 ? formatNumber(m.metrics.leads) : '—'}
              </td>
              <td className="px-4 py-3 text-right text-gray-500 hidden lg:table-cell">
                {formatRoas(m.metrics.roas)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
