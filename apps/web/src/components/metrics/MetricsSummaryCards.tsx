import type { MetricSummary } from '@bop-agency/domain';

type MetricsSummaryCardsProps = {
  metrics: MetricSummary[];
};

function fmt(n: number, prefix = ''): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n.toFixed(0)}`;
}

function fmtRoas(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  return `${n.toFixed(2)}x`;
}

export function MetricsSummaryCards({ metrics }: MetricsSummaryCardsProps) {
  if (metrics.length === 0) return null;

  const totalSpend = metrics.reduce((s, m) => s + m.metrics.spend, 0);
  const totalImpressions = metrics.reduce((s, m) => s + m.metrics.impressions, 0);
  const totalClicks = metrics.reduce((s, m) => s + m.metrics.clicks, 0);
  const totalLeads = metrics.reduce((s, m) => s + m.metrics.leads, 0);

  const roasItems = metrics.filter((m) => m.metrics.roas > 0);
  const avgRoas =
    roasItems.length > 0 ? roasItems.reduce((s, m) => s + m.metrics.roas, 0) / roasItems.length : 0;

  const cards = [
    { label: 'Gasto total', value: fmt(totalSpend, '$'), icon: '💰' },
    { label: 'Impresiones', value: fmt(totalImpressions), icon: '👁️' },
    { label: 'Clics', value: fmt(totalClicks), icon: '🖱️' },
    { label: 'Leads', value: totalLeads > 0 ? fmt(totalLeads) : '—', icon: '🎯' },
    { label: 'ROAS promedio', value: fmtRoas(avgRoas), icon: '📈' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(({ label, value, icon }) => (
        <div key={label} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg" aria-hidden="true">
              {icon}
            </span>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          </div>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}
