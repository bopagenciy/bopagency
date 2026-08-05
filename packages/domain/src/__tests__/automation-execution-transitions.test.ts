/**
 * Tests de dominio para AutomationExecution (Phase 6A):
 * - Estados y transiciones de AutomationExecutionStatus
 * - Estados terminales
 * - Retry y cancel guards
 * - Validaciones de attempt e idempotencyKey
 * - Coherencia de fechas
 */

import { describe, it, expect } from 'vitest';
import {
  canTransitionExecution,
  getExecutionNextStates,
  isExecutionTerminal,
  canRetryExecution,
  canCancelExecution,
  validateExecutionDates,
  isValidAttemptNumber,
  automationExecutionId,
  idempotencyKeyFromString,
} from '../entities/automation-execution';
import type { AutomationExecutionStatus } from '../entities/automation-execution';

// ─── canTransitionExecution ───────────────────────────────────────────────────

describe('canTransitionExecution', () => {
  // Transiciones válidas
  it('queued → running: válido', () => {
    expect(canTransitionExecution('queued', 'running')).toBe(true);
  });

  it('queued → cancelled: válido', () => {
    expect(canTransitionExecution('queued', 'cancelled')).toBe(true);
  });

  it('running → succeeded: válido', () => {
    expect(canTransitionExecution('running', 'succeeded')).toBe(true);
  });

  it('running → failed: válido', () => {
    expect(canTransitionExecution('running', 'failed')).toBe(true);
  });

  it('running → cancelled: válido', () => {
    expect(canTransitionExecution('running', 'cancelled')).toBe(true);
  });

  it('failed → retrying: válido', () => {
    expect(canTransitionExecution('failed', 'retrying')).toBe(true);
  });

  it('retrying → queued: válido', () => {
    expect(canTransitionExecution('retrying', 'queued')).toBe(true);
  });

  // Restricciones explícitas
  it('succeeded → running: inválido (no se re-ejecuta lo exitoso)', () => {
    expect(canTransitionExecution('succeeded', 'running')).toBe(false);
  });

  it('succeeded → failed: inválido', () => {
    expect(canTransitionExecution('succeeded', 'failed')).toBe(false);
  });

  it('cancelled → running: inválido (estado terminal)', () => {
    expect(canTransitionExecution('cancelled', 'running')).toBe(false);
  });

  it('cancelled → queued: inválido (estado terminal)', () => {
    expect(canTransitionExecution('cancelled', 'queued')).toBe(false);
  });

  it('failed → running: inválido (debe pasar por retrying → queued)', () => {
    expect(canTransitionExecution('failed', 'running')).toBe(false);
  });

  it('running → queued: inválido', () => {
    expect(canTransitionExecution('running', 'queued')).toBe(false);
  });

  it('queued → succeeded: inválido (debe pasar por running)', () => {
    expect(canTransitionExecution('queued', 'succeeded')).toBe(false);
  });
});

// ─── getExecutionNextStates ───────────────────────────────────────────────────

describe('getExecutionNextStates', () => {
  it('queued → [running, cancelled]', () => {
    const next = getExecutionNextStates('queued');
    expect(next).toContain('running');
    expect(next).toContain('cancelled');
    expect(next).toHaveLength(2);
  });

  it('running → [succeeded, failed, cancelled]', () => {
    const next = getExecutionNextStates('running');
    expect(next).toContain('succeeded');
    expect(next).toContain('failed');
    expect(next).toContain('cancelled');
    expect(next).toHaveLength(3);
  });

  it('failed → [retrying]', () => {
    const next = getExecutionNextStates('failed');
    expect(next).toContain('retrying');
    expect(next).toHaveLength(1);
  });

  it('retrying → [queued]', () => {
    const next = getExecutionNextStates('retrying');
    expect(next).toContain('queued');
    expect(next).toHaveLength(1);
  });

  it('succeeded → [] (terminal)', () => {
    expect(getExecutionNextStates('succeeded')).toEqual([]);
  });

  it('cancelled → [] (terminal)', () => {
    expect(getExecutionNextStates('cancelled')).toEqual([]);
  });

  it('retorna copia del array', () => {
    const next = getExecutionNextStates('running');
    next.push('queued' as AutomationExecutionStatus);
    expect(getExecutionNextStates('running')).toHaveLength(3);
  });
});

// ─── isExecutionTerminal ──────────────────────────────────────────────────────

describe('isExecutionTerminal', () => {
  it('succeeded es terminal', () => {
    expect(isExecutionTerminal('succeeded')).toBe(true);
  });

  it('cancelled es terminal', () => {
    expect(isExecutionTerminal('cancelled')).toBe(true);
  });

  it('queued no es terminal', () => {
    expect(isExecutionTerminal('queued')).toBe(false);
  });

  it('running no es terminal', () => {
    expect(isExecutionTerminal('running')).toBe(false);
  });

  it('failed no es terminal (puede pasar a retrying)', () => {
    expect(isExecutionTerminal('failed')).toBe(false);
  });

  it('retrying no es terminal', () => {
    expect(isExecutionTerminal('retrying')).toBe(false);
  });
});

// ─── canRetryExecution ────────────────────────────────────────────────────────

describe('canRetryExecution', () => {
  it('failed con attempt < maxAttempts: puede reintentar', () => {
    expect(canRetryExecution({ status: 'failed', attempt: 1 }, 3)).toBe(true);
  });

  it('failed con attempt === maxAttempts: NO puede reintentar', () => {
    expect(canRetryExecution({ status: 'failed', attempt: 3 }, 3)).toBe(false);
  });

  it('failed con attempt > maxAttempts: NO puede reintentar', () => {
    expect(canRetryExecution({ status: 'failed', attempt: 4 }, 3)).toBe(false);
  });

  it('succeeded: NO puede reintentar', () => {
    expect(canRetryExecution({ status: 'succeeded', attempt: 1 }, 3)).toBe(false);
  });

  it('cancelled: NO puede reintentar', () => {
    expect(canRetryExecution({ status: 'cancelled', attempt: 1 }, 3)).toBe(false);
  });

  it('running: NO puede reintentar', () => {
    expect(canRetryExecution({ status: 'running', attempt: 1 }, 3)).toBe(false);
  });

  it('queued: NO puede reintentar', () => {
    expect(canRetryExecution({ status: 'queued', attempt: 1 }, 3)).toBe(false);
  });

  it('failed con attempt < 1: NO puede reintentar (attempt inválido)', () => {
    expect(canRetryExecution({ status: 'failed', attempt: 0 }, 3)).toBe(false);
  });
});

// ─── canCancelExecution ───────────────────────────────────────────────────────

describe('canCancelExecution', () => {
  it('queued puede cancelarse', () => {
    expect(canCancelExecution('queued')).toBe(true);
  });

  it('running puede cancelarse', () => {
    expect(canCancelExecution('running')).toBe(true);
  });

  it('succeeded NO puede cancelarse (terminal)', () => {
    expect(canCancelExecution('succeeded')).toBe(false);
  });

  it('failed NO puede cancelarse directamente', () => {
    expect(canCancelExecution('failed')).toBe(false);
  });

  it('cancelled NO puede cancelarse (ya cancelado)', () => {
    expect(canCancelExecution('cancelled')).toBe(false);
  });

  it('retrying NO puede cancelarse directamente', () => {
    expect(canCancelExecution('retrying')).toBe(false);
  });
});

// ─── validateExecutionDates ───────────────────────────────────────────────────

describe('validateExecutionDates', () => {
  const queuedAt = new Date('2026-08-04T10:00:00Z');

  it('fechas coherentes: sin error', () => {
    expect(validateExecutionDates({
      queuedAt,
      startedAt: new Date('2026-08-04T10:01:00Z'),
      completedAt: new Date('2026-08-04T10:02:00Z'),
    })).toBeNull();
  });

  it('solo queuedAt: válido', () => {
    expect(validateExecutionDates({
      queuedAt,
      startedAt: null,
      completedAt: null,
    })).toBeNull();
  });

  it('startedAt anterior a queuedAt: error', () => {
    expect(validateExecutionDates({
      queuedAt,
      startedAt: new Date('2026-08-04T09:59:00Z'),
      completedAt: null,
    })).not.toBeNull();
  });

  it('completedAt sin startedAt: error', () => {
    expect(validateExecutionDates({
      queuedAt,
      startedAt: null,
      completedAt: new Date('2026-08-04T10:05:00Z'),
    })).not.toBeNull();
  });

  it('completedAt anterior a startedAt: error', () => {
    expect(validateExecutionDates({
      queuedAt,
      startedAt: new Date('2026-08-04T10:02:00Z'),
      completedAt: new Date('2026-08-04T10:01:00Z'),
    })).not.toBeNull();
  });
});

// ─── isValidAttemptNumber ─────────────────────────────────────────────────────

describe('isValidAttemptNumber', () => {
  it('1 es válido', () => {
    expect(isValidAttemptNumber(1)).toBe(true);
  });

  it('3 es válido', () => {
    expect(isValidAttemptNumber(3)).toBe(true);
  });

  it('0 es inválido (1-based)', () => {
    expect(isValidAttemptNumber(0)).toBe(false);
  });

  it('-1 es inválido', () => {
    expect(isValidAttemptNumber(-1)).toBe(false);
  });

  it('1.5 es inválido (no entero)', () => {
    expect(isValidAttemptNumber(1.5)).toBe(false);
  });
});

// ─── automationExecutionId factory ───────────────────────────────────────────

describe('automationExecutionId', () => {
  it('crea un AutomationExecutionId desde string válido', () => {
    const id = automationExecutionId('exec-abc-123');
    expect(id).toBe('exec-abc-123');
  });

  it('lanza error si el string está vacío', () => {
    expect(() => automationExecutionId('')).toThrow();
  });

  it('lanza error si el string es solo espacios', () => {
    expect(() => automationExecutionId('   ')).toThrow();
  });
});

// ─── idempotencyKeyFromString ─────────────────────────────────────────────────

describe('idempotencyKeyFromString', () => {
  it('crea IdempotencyKey desde string válido', () => {
    const key = idempotencyKeyFromString('auto-1:run-2:2026-08-04');
    expect(key).toBe('auto-1:run-2:2026-08-04');
  });

  it('lanza error si está vacío', () => {
    expect(() => idempotencyKeyFromString('')).toThrow();
  });

  it('lanza error si es solo espacios', () => {
    expect(() => idempotencyKeyFromString('   ')).toThrow();
  });
});
