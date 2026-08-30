import { describe, it, expect } from 'vitest';
import {
  campaignMetricSnapshotId,
  parseMonetaryAmount,
  validateCampaignMetricSnapshotValues,
  computeDerivedSnapshotMetrics,
} from '../entities/campaign-metric-snapshot';

describe('CampaignMetricSnapshot entity (Phase 9A.0 Final Corrected)', () => {
  describe('campaignMetricSnapshotId', () => {
    it('creates a branded ID for a non-empty string', () => {
      const id = campaignMetricSnapshotId('snap-123');
      expect(id).toBe('snap-123');
    });

    it('throws error for empty string', () => {
      expect(() => campaignMetricSnapshotId('')).toThrow('CampaignMetricSnapshotId cannot be empty');
    });
  });

  describe('parseMonetaryAmount precision boundary', () => {
    it('handles standard and edge-case monetary values deterministically as decimal strings', () => {
      expect(parseMonetaryAmount('0.005')).toBe('0.01');
      expect(parseMonetaryAmount('1.005')).toBe('1.01');
      expect(parseMonetaryAmount('10.075')).toBe('10.08');
      expect(parseMonetaryAmount('999999.999')).toBe('1000000.00');
      expect(parseMonetaryAmount('1234.56789')).toBe('1234.57');
      expect(parseMonetaryAmount('000001.20')).toBe('1.20');
      expect(parseMonetaryAmount(0.1 + 0.2)).toBe('0.30');
      expect(parseMonetaryAmount(19.99)).toBe('19.99');
      expect(parseMonetaryAmount('-1.00')).toBeNull();
      expect(parseMonetaryAmount('abc')).toBeNull();
      expect(parseMonetaryAmount('')).toBeNull();
      expect(parseMonetaryAmount(null)).toBeNull();
    });
  });

  describe('validateCampaignMetricSnapshotValues', () => {
    it('returns empty array for valid non-negative metrics and nulls', () => {
      const errors = validateCampaignMetricSnapshotValues({
        spend: '1000.00',
        impressions: 50000,
        reach: null,
        clicks: 1200,
        leads: 45,
        conversions: 20,
        revenue: '3500.00',
        ctr: 2.4,
        cpc: 0.83,
        cpm: 20.0,
        roas: 3.5,
      });
      expect(errors).toHaveLength(0);
    });

    it('flags invalid decimal or negative values as errors', () => {
      const errors = validateCampaignMetricSnapshotValues({
        spend: '-100.00',
        impressions: 50000,
        reach: 40000,
        clicks: 1200,
        leads: 45,
        conversions: 20,
        revenue: '3500.00',
        ctr: 2.4,
        cpc: 0.83,
        cpm: 20.0,
        roas: -1.0,
      });
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('spend');
      expect(errors[1]).toContain('roas');
    });
  });

  describe('computeDerivedSnapshotMetrics', () => {
    it('computes CTR, CPC, CPM and ROAS correctly', () => {
      const derived = computeDerivedSnapshotMetrics({
        spend: '500.00',
        impressions: 10000,
        clicks: 250,
        revenue: '1500.00',
      });

      expect(derived.ctr).toBe(2.5);
      expect(derived.cpc).toBe(2);
      expect(derived.cpm).toBe(50);
      expect(derived.roas).toBe(3);
    });

    it('handles zeroes gracefully without NaN or Infinity', () => {
      const derived = computeDerivedSnapshotMetrics({
        spend: '0.00',
        impressions: 0,
        clicks: 0,
        revenue: '0.00',
      });

      expect(derived.ctr).toBe(0);
      expect(derived.cpc).toBe(0);
      expect(derived.cpm).toBe(0);
      expect(derived.roas).toBe(0);
    });

    it('returns null when primitive metrics are null (unsupported/unavailable)', () => {
      const derived = computeDerivedSnapshotMetrics({
        spend: '500.00',
        impressions: null,
        clicks: null,
        revenue: null,
      });

      expect(derived.ctr).toBeNull();
      expect(derived.cpc).toBeNull();
      expect(derived.cpm).toBeNull();
      expect(derived.roas).toBeNull();
    });
  });
});
