import { describe, it, expect } from 'vitest';
import { validateMetricValues, validateMetricPeriod } from '../entities/metric';
import type { MetricValues } from '../entities/metric';

const validMetrics: MetricValues = {
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
};

describe('validateMetricValues', () => {
  it('retorna [] para métricas válidas', () => {
    expect(validateMetricValues(validMetrics)).toEqual([]);
  });

  it('retorna error si spend no es finito', () => {
    const errors = validateMetricValues({ ...validMetrics, spend: NaN });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('spend');
  });

  it('retorna error si roas no es finito (Infinity)', () => {
    const errors = validateMetricValues({ ...validMetrics, roas: Infinity });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('roas');
  });

  it('acepta spend = 0 (sin actividad en período)', () => {
    const zeros: MetricValues = { ...validMetrics, spend: 0, clicks: 0, leads: 0 };
    expect(validateMetricValues(zeros)).toEqual([]);
  });

  it('acumula múltiples errores', () => {
    const bad: MetricValues = { ...validMetrics, spend: NaN, ctr: Infinity, cpm: NaN };
    expect(validateMetricValues(bad).length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateMetricPeriod', () => {
  it('periodStart == periodEnd: válido (período de un día)', () => {
    const d = new Date('2026-06-01');
    expect(validateMetricPeriod(d, d)).toBe(true);
  });

  it('periodStart < periodEnd: válido', () => {
    expect(validateMetricPeriod(new Date('2026-06-01'), new Date('2026-06-30'))).toBe(true);
  });

  it('periodStart > periodEnd: inválido', () => {
    expect(validateMetricPeriod(new Date('2026-07-01'), new Date('2026-06-01'))).toBe(false);
  });
});
