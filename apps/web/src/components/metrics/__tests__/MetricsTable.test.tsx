import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricsTable } from '../MetricsTable';
import type { MetricSummary } from '@bop-agency/domain';
import type { MetricId, MetricValues } from '@bop-agency/domain';
import type { OrganizationId, ClientId } from '@bop-agency/domain';

const makeMetricValues = (overrides: Partial<MetricValues> = {}): MetricValues => ({
  spend: 100_000,
  impressions: 50_000,
  reach: 30_000,
  clicks: 1_000,
  leads: 25,
  purchases: 0,
  conversions: 0,
  revenue: 0,
  ctr: 0.02,
  cpc: 100,
  cpm: 2,
  cpl: 4000,
  roas: 0,
  ...overrides,
});

const makeMetric = (overrides: Partial<MetricSummary> = {}): MetricSummary => ({
  id: 'metric-1' as MetricId,
  organizationId: 'org-1' as OrganizationId,
  clientId: 'client-1' as ClientId,
  platform: 'meta',
  accountId: 'acc-1',
  accountName: 'Mi cuenta Meta',
  periodStart: new Date('2026-06-01'),
  periodEnd: new Date('2026-06-30'),
  currency: 'COP',
  metrics: makeMetricValues(),
  dataQuality: null,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  ...overrides,
});

describe('MetricsTable', () => {
  it('muestra empty state cuando no hay métricas', () => {
    render(<MetricsTable metrics={[]} />);
    expect(screen.getByText('Sin métricas')).toBeInTheDocument();
  });

  it('muestra el nombre de la plataforma', () => {
    render(<MetricsTable metrics={[makeMetric({ platform: 'meta' })]} />);
    expect(screen.getByText('Meta Ads')).toBeInTheDocument();
  });

  it('muestra el nombre de cuenta', () => {
    render(<MetricsTable metrics={[makeMetric({ accountName: 'BopAgency Meta' })]} />);
    expect(screen.getByText('BopAgency Meta')).toBeInTheDocument();
  });

  it('muestra gasto formateado', () => {
    render(
      <MetricsTable metrics={[makeMetric({ metrics: makeMetricValues({ spend: 2_500_000 }) })]} />,
    );
    expect(screen.getByText('$2.5M')).toBeInTheDocument();
  });

  it('muestra "—" para ROAS cuando es 0', () => {
    render(<MetricsTable metrics={[makeMetric({ metrics: makeMetricValues({ roas: 0 }) })]} />);
    // Los "—" de leads y roas
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('muestra múltiples métricas', () => {
    const metrics = [
      makeMetric({ id: 'm1' as MetricId, accountName: 'Cuenta A' }),
      makeMetric({ id: 'm2' as MetricId, accountName: 'Cuenta B' }),
    ];
    render(<MetricsTable metrics={metrics} />);
    expect(screen.getByText('Cuenta A')).toBeInTheDocument();
    expect(screen.getByText('Cuenta B')).toBeInTheDocument();
  });

  it('tabla tiene aria-label accesible', () => {
    render(<MetricsTable metrics={[makeMetric()]} />);
    expect(screen.getByRole('table', { name: /Tabla de métricas/i })).toBeInTheDocument();
  });

  it('usa accountId como fallback si accountName es null', () => {
    render(<MetricsTable metrics={[makeMetric({ accountName: null, accountId: 'acc-xyz' })]} />);
    expect(screen.getByText('acc-xyz')).toBeInTheDocument();
  });
});
