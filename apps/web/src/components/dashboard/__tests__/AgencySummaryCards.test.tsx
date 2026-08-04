import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgencySummaryCards } from '../AgencySummaryCards';
import type { AgencyDashboardSummary } from '@bop-agency/application';

const makeSummary = (overrides: Partial<AgencyDashboardSummary> = {}): AgencyDashboardSummary => ({
  activeClients: 5,
  activeAlerts: 3,
  alertsBySeverity: { critical: 1, warning: 2, info: 0 },
  pendingTasks: 8,
  overdueTasks: 2,
  inProgressTasks: 4,
  totalSpend: 1_500_000,
  avgRoas: 3.5,
  ...overrides,
});

describe('AgencySummaryCards', () => {
  it('muestra el número de clientes activos', () => {
    render(<AgencySummaryCards summary={makeSummary({ activeClients: 7 })} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('muestra el número de alertas activas', () => {
    render(<AgencySummaryCards summary={makeSummary({ activeAlerts: 4 })} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('muestra sub-texto con alertas críticas', () => {
    render(
      <AgencySummaryCards
        summary={makeSummary({ alertsBySeverity: { critical: 2, warning: 1, info: 0 } })}
      />,
    );
    expect(screen.getByText(/2 críticas/)).toBeInTheDocument();
  });

  it('muestra gasto total formateado en $M cuando > 1M', () => {
    render(<AgencySummaryCards summary={makeSummary({ totalSpend: 2_500_000 })} />);
    expect(screen.getByText('$2.5M')).toBeInTheDocument();
  });

  it('muestra "—" para gasto cuando totalSpend es 0', () => {
    render(<AgencySummaryCards summary={makeSummary({ totalSpend: 0 })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('muestra el ROAS promedio como sub-texto del card de gasto', () => {
    render(<AgencySummaryCards summary={makeSummary({ totalSpend: 1_000, avgRoas: 4.2 })} />);
    expect(screen.getByText(/ROAS promedio: 4\.20x/)).toBeInTheDocument();
  });

  it('muestra vencidas en el card de tareas cuando hay overdueTasks > 0', () => {
    render(<AgencySummaryCards summary={makeSummary({ overdueTasks: 3 })} />);
    expect(screen.getByText(/3 vencidas/)).toBeInTheDocument();
  });

  it('muestra "Sin alertas activas" cuando activeAlerts=0', () => {
    render(
      <AgencySummaryCards
        summary={makeSummary({
          activeAlerts: 0,
          alertsBySeverity: { critical: 0, warning: 0, info: 0 },
        })}
      />,
    );
    expect(screen.getByText('Sin alertas activas')).toBeInTheDocument();
  });

  it('renderiza exactamente 4 cards', () => {
    const { container } = render(<AgencySummaryCards summary={makeSummary()} />);
    const cards = container.querySelectorAll('.border-l-4');
    expect(cards).toHaveLength(4);
  });
});
