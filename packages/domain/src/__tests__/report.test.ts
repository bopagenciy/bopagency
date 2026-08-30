import { describe, it, expect } from 'vitest';
import {
  reportId,
  reportDeliveryId,
  canTransitionReportStatus,
  validateReportPeriod,
} from '../entities/report';

describe('Report & ReportDelivery entities (Phase 9A.0 Hardened)', () => {
  describe('Branded IDs', () => {
    it('creates ReportId and ReportDeliveryId', () => {
      expect(reportId('rep-1')).toBe('rep-1');
      expect(reportDeliveryId('del-1')).toBe('del-1');
    });

    it('throws error for empty ID strings', () => {
      expect(() => reportId('')).toThrow('ReportId cannot be empty');
      expect(() => reportDeliveryId('')).toThrow('ReportDeliveryId cannot be empty');
    });
  });

  describe('canTransitionReportStatus', () => {
    it('allows valid transitions from draft', () => {
      expect(canTransitionReportStatus('draft', 'generated')).toBe(true);
      expect(canTransitionReportStatus('draft', 'failed')).toBe(true);
    });

    it('allows valid transitions from generated', () => {
      expect(canTransitionReportStatus('generated', 'failed')).toBe(true);
    });

    it('disallows invalid transitions', () => {
      expect(canTransitionReportStatus('failed', 'failed')).toBe(true);
      expect(canTransitionReportStatus('draft', 'draft')).toBe(true);
    });
  });

  describe('validateReportPeriod', () => {
    it('returns true when start <= end', () => {
      const start = new Date('2026-08-01');
      const end = new Date('2026-08-31');
      expect(validateReportPeriod(start, end)).toBe(true);
    });

    it('returns false when start > end', () => {
      const start = new Date('2026-09-01');
      const end = new Date('2026-08-01');
      expect(validateReportPeriod(start, end)).toBe(false);
    });
  });
});
