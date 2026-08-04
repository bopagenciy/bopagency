import { describe, it, expect } from 'vitest';
import {
  rowToMetric,
  rowToMetricSummary,
  type MetricRow,
  type MetricSummaryRow,
} from '../metric.mapper';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseMetrics = {
  spend: 77053,
  impressions: 10704,
  reach: 6808,
  clicks: 715,
  leads: 0,
  purchases: 0,
  conversions: 0,
  revenue: 0,
  ctr: 0.067,
  cpc: 107.8,
  cpm: 7.19,
  cpl: 0,
  roas: 0,
  traffic: { linkClicks: 41, landingPageViews: 0 },
  engagement: { postReactions: 16, postEngagement: 3054, pageEngagement: 3056 },
  conversations: { started: 0, replied: 0 },
};

const baseCampaign = {
  id: '120208823630090658',
  name: 'Campaña Demo',
  status: 'unknown',
  spend: 77053,
  impressions: 10704,
  reach: 6808,
  clicks: 715,
  leads: 0,
  purchases: 0,
  conversions: 0,
  revenue: 0,
  ctr: 0.067,
  cpc: 107.8,
};

const baseRow: MetricRow = {
  id: 'metric-uuid-1',
  organization_id: 'org-uuid-1',
  client_id: 'client-uuid-1',
  platform: 'meta',
  account_id: 'act_123456',
  account_name: 'Magic Bungalow',
  period_start: '2026-06-01T00:00:00.000Z',
  period_end: '2026-06-30T23:59:59.000Z',
  currency: 'COP',
  metrics: baseMetrics,
  campaigns: [baseCampaign],
  data_quality: { status: 'complete', warnings: [] },
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

// ─── rowToMetricSummary ───────────────────────────────────────────────────────

describe('rowToMetricSummary', () => {
  const summaryRow: MetricSummaryRow = (() => {
    const { campaigns: _c, ...rest } = baseRow;
    void _c;
    return rest;
  })();

  it('mapea todos los campos básicos correctamente', () => {
    const metric = rowToMetricSummary(summaryRow);
    expect(metric.id).toBe('metric-uuid-1');
    expect(metric.organizationId).toBe('org-uuid-1');
    expect(metric.clientId).toBe('client-uuid-1');
    expect(metric.platform).toBe('meta');
    expect(metric.accountId).toBe('act_123456');
    expect(metric.accountName).toBe('Magic Bungalow');
    expect(metric.currency).toBe('COP');
    expect(metric.periodStart).toBeInstanceOf(Date);
    expect(metric.periodEnd).toBeInstanceOf(Date);
    expect(metric.createdAt).toBeInstanceOf(Date);
    expect(metric.updatedAt).toBeInstanceOf(Date);
  });

  it('parsea MetricValues correctamente', () => {
    const metric = rowToMetricSummary(summaryRow);
    expect(metric.metrics.spend).toBe(77053);
    expect(metric.metrics.impressions).toBe(10704);
    expect(metric.metrics.ctr).toBe(0.067);
    expect(metric.metrics.roas).toBe(0);
  });

  it('parsea campos traffic/engagement/conversations anidados', () => {
    const metric = rowToMetricSummary(summaryRow);
    expect(metric.metrics.traffic?.linkClicks).toBe(41);
    expect(metric.metrics.engagement?.postReactions).toBe(16);
    expect(metric.metrics.conversations?.started).toBe(0);
  });

  it('account_name null se mapea a null', () => {
    const metric = rowToMetricSummary({ ...summaryRow, account_name: null });
    expect(metric.accountName).toBeNull();
  });

  it('data_quality null se mapea a null', () => {
    const metric = rowToMetricSummary({ ...summaryRow, data_quality: null });
    expect(metric.dataQuality).toBeNull();
  });

  it('lanza error si platform no es válida', () => {
    expect(() => rowToMetricSummary({ ...summaryRow, platform: 'snapchat_ads' })).toThrow(
      'platform "snapchat_ads" no es válido',
    );
  });

  it('lanza error si metrics no es un objeto', () => {
    expect(() => rowToMetricSummary({ ...summaryRow, metrics: 'no-es-objeto' })).toThrow(
      'campo "metrics" no es un objeto',
    );
  });

  it('lanza error si campo numérico en metrics no es finito', () => {
    expect(() =>
      rowToMetricSummary({ ...summaryRow, metrics: { ...baseMetrics, spend: NaN } }),
    ).toThrow('campo "spend" debe ser número finito');
  });

  it('lanza error si period_start no es fecha válida', () => {
    expect(() => rowToMetricSummary({ ...summaryRow, period_start: 'no-es-fecha' })).toThrow(
      '"period_start" no es una fecha válida',
    );
  });

  it('metrics sin traffic/engagement/conversations → campos undefined', () => {
    const { traffic: _t, engagement: _e, conversations: _c, ...metricsWithout } = baseMetrics;
    void _t;
    void _e;
    void _c;
    const metric = rowToMetricSummary({ ...summaryRow, metrics: metricsWithout });
    expect(metric.metrics.traffic).toBeUndefined();
    expect(metric.metrics.engagement).toBeUndefined();
    expect(metric.metrics.conversations).toBeUndefined();
  });
});

// ─── rowToMetric (con campaigns) ─────────────────────────────────────────────

describe('rowToMetric', () => {
  it('incluye campaigns en el resultado', () => {
    const metric = rowToMetric(baseRow);
    expect(metric.campaigns).toHaveLength(1);
    expect(metric.campaigns.at(0)?.id).toBe('120208823630090658');
    expect(metric.campaigns.at(0)?.name).toBe('Campaña Demo');
    expect(metric.campaigns.at(0)?.spend).toBe(77053);
  });

  it('campaigns vacío ([]) se mapea a []', () => {
    const metric = rowToMetric({ ...baseRow, campaigns: [] });
    expect(metric.campaigns).toEqual([]);
  });

  it('campaigns null se mapea a []', () => {
    const metric = rowToMetric({ ...baseRow, campaigns: null });
    expect(metric.campaigns).toEqual([]);
  });

  it('lanza error si campaigns no es un array', () => {
    expect(() => rowToMetric({ ...baseRow, campaigns: 'no-es-array' })).toThrow(
      '"campaigns" debe ser un array',
    );
  });

  it('lanza error si un campaign item no es objeto', () => {
    expect(() => rowToMetric({ ...baseRow, campaigns: [42] })).toThrow(
      'campaigns[0] no es un objeto',
    );
  });

  it('lanza error si campaign.id está vacío', () => {
    expect(() => rowToMetric({ ...baseRow, campaigns: [{ ...baseCampaign, id: '' }] })).toThrow(
      'campaigns[0].id debe ser un string no vacío',
    );
  });

  it('soporta 55 campañas sin fallar', () => {
    const campaigns = Array.from({ length: 55 }, (_, i) => ({
      ...baseCampaign,
      id: `campaign-${i}`,
      name: `Campaña ${i}`,
    }));
    const metric = rowToMetric({ ...baseRow, campaigns });
    expect(metric.campaigns).toHaveLength(55);
  });
});
