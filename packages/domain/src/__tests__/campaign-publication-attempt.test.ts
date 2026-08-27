/**
 * campaign-publication-attempt (dominio) - tests unitarios (Phase 8B.1).
 */
import { describe, it, expect } from 'vitest';
import {
  isValidAttemptNumber,
  isPublicationAttemptOpen,
  computeAttemptDurationMs,
  campaignPublicationAttemptId,
} from '../entities/campaign-publication-attempt';

describe('isValidAttemptNumber', () => {
  it('acepta enteros >= 1', () => {
    expect(isValidAttemptNumber(1)).toBe(true);
    expect(isValidAttemptNumber(5)).toBe(true);
  });

  it('rechaza 0, negativos y no enteros', () => {
    expect(isValidAttemptNumber(0)).toBe(false);
    expect(isValidAttemptNumber(-1)).toBe(false);
    expect(isValidAttemptNumber(1.5)).toBe(false);
  });
});

describe('isPublicationAttemptOpen', () => {
  it('true cuando no hay completedAt ni outcome', () => {
    expect(isPublicationAttemptOpen({ completedAt: null, outcome: null })).toBe(true);
  });

  it('false cuando el attempt ya se resolvio (confirmed o unknown)', () => {
    expect(isPublicationAttemptOpen({ completedAt: new Date(), outcome: 'confirmed' })).toBe(false);
    expect(isPublicationAttemptOpen({ completedAt: new Date(), outcome: 'unknown' })).toBe(false);
  });
});

describe('computeAttemptDurationMs', () => {
  it('calcula la diferencia en milisegundos', () => {
    const started = new Date('2026-08-25T00:00:00.000Z');
    const completed = new Date('2026-08-25T00:00:02.500Z');
    expect(computeAttemptDurationMs(started, completed)).toBe(2500);
  });

  it('lanza si completedAt es anterior a startedAt', () => {
    const started = new Date('2026-08-25T00:00:05.000Z');
    const completed = new Date('2026-08-25T00:00:00.000Z');
    expect(() => computeAttemptDurationMs(started, completed)).toThrow();
  });
});

describe('campaignPublicationAttemptId', () => {
  it('rechaza id vacio', () => {
    expect(() => campaignPublicationAttemptId('')).toThrow();
  });
});
