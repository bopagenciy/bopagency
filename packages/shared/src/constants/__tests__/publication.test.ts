/**
 * constants/publication (shared) - tests unitarios (Phase 8B.1).
 */
import { describe, it, expect } from 'vitest';
import {
  PUBLICATION_JOB_STATUSES,
  PUBLICATION_JOB_TERMINAL_STATUSES,
  PUBLICATION_FAILURE_CATEGORIES,
  PUBLICATION_RETRYABLE_FAILURE_CATEGORIES,
  isRetryablePublicationFailure,
  PUBLICATION_EVENT_TYPES,
  DEFAULT_PUBLICATION_RECONCILIATION_TIMEOUT_MINUTES,
  PUBLICATION_IDEMPOTENCY_KEY_PREFIX,
} from '../publication';

describe('PUBLICATION_JOB_STATUSES', () => {
  it('contiene los 7 estados esperados, unknown_outcome incluido', () => {
    expect(PUBLICATION_JOB_STATUSES).toEqual([
      'queued',
      'claimed',
      'in_progress',
      'succeeded',
      'failed',
      'cancelled',
      'unknown_outcome',
    ]);
  });

  it('unknown_outcome NO esta en los estados terminales (CRITICO)', () => {
    expect(PUBLICATION_JOB_TERMINAL_STATUSES).not.toContain('unknown_outcome');
    expect(PUBLICATION_JOB_TERMINAL_STATUSES).toEqual(['succeeded', 'failed', 'cancelled']);
  });
});

describe('PUBLICATION_FAILURE_CATEGORIES / isRetryablePublicationFailure', () => {
  it('todas las categorias retryable estan en la lista cerrada de categorias', () => {
    for (const category of PUBLICATION_RETRYABLE_FAILURE_CATEGORIES) {
      expect(PUBLICATION_FAILURE_CATEGORIES).toContain(category);
    }
  });

  it('UNKNOWN_OUTCOME nunca es retryable', () => {
    expect(isRetryablePublicationFailure('UNKNOWN_OUTCOME')).toBe(false);
  });

  it('UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED SI es retryable (reconciliado negativo)', () => {
    expect(isRetryablePublicationFailure('UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED')).toBe(true);
  });

  it('una categoria no reconocida no es retryable', () => {
    expect(isRetryablePublicationFailure('SOME_MADE_UP_CATEGORY')).toBe(false);
  });
});

describe('PUBLICATION_EVENT_TYPES', () => {
  it('incluye los 9 tipos del audit S15.1 + retry_prepared (Run 4, 20260828100000)', () => {
    expect(PUBLICATION_EVENT_TYPES).toHaveLength(10);
    expect(PUBLICATION_EVENT_TYPES).toContain('job_reconciled');
    expect(PUBLICATION_EVENT_TYPES).toContain('webhook_received');
    expect(PUBLICATION_EVENT_TYPES).toContain('retry_prepared');
  });
});

describe('Reconciliation policy defaults', () => {
  it('el default es 15 minutos (kickoff decision #3)', () => {
    expect(DEFAULT_PUBLICATION_RECONCILIATION_TIMEOUT_MINUTES).toBe(15);
  });
});

describe('Idempotency key prefix', () => {
  it('es "publish"', () => {
    expect(PUBLICATION_IDEMPOTENCY_KEY_PREFIX).toBe('publish');
  });
});
