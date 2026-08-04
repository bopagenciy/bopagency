import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricsSummaryCards } from '../MetricsSummaryCards';
import type { MetricSummary } from '@bop-agency/domain';
import type { MetricId, MetricValues } from '@bop-agency/domain';
import type { OrganizationId, ClientId } from '@bop-agency/domain';

const makeValues = (overrides: Partial<MetricValues> = {}): MetricValues => ({
  spend: 500_000,
  impressions: 20_000,
  reach: 15_000,
  clicks: 400,
  leads: 10,
  purchases: 0,
  conversions: 0,
  revenue: 0,
  ctr: 0.02,
  cpc: 1250,
  cpm: 25,
  cpl: 50000,
  roas: 2.5,
  ...overrides,
});

const makeMetric = (overrides: Partial<MetricSummary> = {}): MetricSummary => ({
  id: 'metric-1' as MetricId,
  organizationId: 'org-1' as OrganizationId,
  clientId: 'client-1' as ClientId,
  platform: 'meta',
  accountId: 'acc-1',
  accountName: null,
  periodStart: new Date('2026-06-01'),
  periodEnd: new Date('2026-06-30'),
  currency: 'COP',
  metrics: makeValues(),
  dataQuality: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('MetricsSummaryCards', () => {
  it('no renderiza nada si metrics es vacío', () => {
    const { container } = render(<MetricsSummaryCards metrics={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('muestra el gasto total formateado', () => {
    render(
      <MetricsSummaryCards metrics={[makeMetric({ metrics: makeValues({ spend: 1_800_000 }) })]} />,
    );
    expect(screen.getByText('$1.8M')).toBeInTheDocument();
  });

  it('muestra las impresiones totales', () => {
    render(
      <MetricsSummaryCards
        metrics={[makeMetric({ metrics: makeValues({ impressions: 25_000 }) })]}
      />,
    );
    expect(screen.getByText('25K')).toBeInTheDocument();
  });

  it('muestra el ROAS promedio', () => {
    render(
      <MetricsSummaryCards
        metrics={[
          makeMetric({ metrics: makeValues({ roas: 4.0 }) }),
          makeMetric({ id: 'm2' as MetricId, metrics: makeValues({ roas: 2.0 }) }),
        ]}
      />,
    );
    expect(screen.getByText('3.00x')).toBeInTheDocument();
  });

  it('muestra "—" para ROAS si todos tienen roas=0', () => {
    render(<MetricsSummaryCards metrics={[makeMetric({ metrics: makeValues({ roas: 0 }) })]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('agrega múltiples métricas correctamente', () => {
    const metrics = [
      makeMetric({ metrics: makeValues({ spend: 1_000_000, leads: 5 }) }),
      makeMetric({ id: 'm2' as MetricId, metrics: makeValues({ spend: 2_000_000, leads: 10 }) }),
    ];
    render(<MetricsSummaryCards metrics={metrics} />);
    expect(screen.getByText('$3.0M')).toBeInTheDocument();
  });
});
