import { SummaryCard } from './SummaryCard';
import type { AgencyDashboardSummary } from '@bop-agency/application';

type AgencySummaryCardsProps = {
  summary: AgencyDashboardSummary;
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatRoas(value: number): string {
  if (value === 0) return '—';
  return `${value.toFixed(2)}x`;
}

export function AgencySummaryCards({ summary }: AgencySummaryCardsProps) {
  const {
    activeClients,
    activeAlerts,
    alertsBySeverity,
    pendingTasks,
    overdueTasks,
    inProgressTasks,
    totalSpend,
    avgRoas,
  } = summary;

  const alertAccent =
    alertsBySeverity.critical > 0 ? 'red' : alertsBySeverity.warning > 0 ? 'amber' : 'green';

  const alertSub =
    activeAlerts === 0
      ? 'Sin alertas activas'
      : [
          alertsBySeverity.critical > 0 && `${alertsBySeverity.critical} críticas`,
          alertsBySeverity.warning > 0 && `${alertsBySeverity.warning} advertencias`,
          alertsBySeverity.info > 0 && `${alertsBySeverity.info} info`,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard label="Clientes activos" value={activeClients} icon="👥" accent="blue" />
      <SummaryCard
        label="Alertas activas"
        value={activeAlerts}
        icon={activeAlerts > 0 ? '🔔' : '✅'}
        sub={alertSub || undefined}
        accent={alertAccent}
      />
      <SummaryCard
        label="Tareas"
        value={pendingTasks + inProgressTasks}
        icon="📋"
        sub={
          overdueTasks > 0
            ? `${overdueTasks} vencida${overdueTasks !== 1 ? 's' : ''}`
            : `${inProgressTasks} en progreso`
        }
        accent={overdueTasks > 0 ? 'red' : 'blue'}
      />
      {totalSpend > 0 ? (
        <SummaryCard
          label="Gasto total"
          value={formatCurrency(totalSpend)}
          icon="💰"
          sub={avgRoas > 0 ? `ROAS promedio: ${formatRoas(avgRoas)}` : undefined}
          accent="green"
        />
      ) : (
        <SummaryCard
          label="Gasto total"
          value="—"
          icon="💰"
          sub="Sin métricas disponibles"
          accent="gray"
        />
      )}
    </div>
  );
}
