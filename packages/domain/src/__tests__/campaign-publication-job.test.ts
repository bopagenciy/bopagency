/**
 * campaign-publication-job (dominio) - tests unitarios (Phase 8B.1).
 * Cubre: transiciones validas/invalidas, guardas terminales, semantica de
 * unknown_outcome, semantica de retry, idempotency key, deadline de
 * reconciliacion.
 */
import { describe, it, expect } from 'vitest';
import {
  canTransitionPublicationJob,
  getPublicationJobNextStates,
  transitionPublicationJob,
  isPublicationJobTerminal,
  canDirectlyCancelPublicationJob,
  canRequestCooperativeCancel,
  canRetryPublicationJob,
  canReconcilePublicationJob,
  buildPublicationIdempotencyKey,
  computeReconciliationDeadline,
  campaignPublicationJobId,
} from '../entities/campaign-publication-job';
import type { OrganizationId } from '../entities/organization';
import type { CampaignActivationTargetId } from '../entities/campaign-activation-target';
import type { PublicationJobStatus } from '@bop-agency/shared';
import { PUBLICATION_JOB_STATUSES } from '@bop-agency/shared';

const ORG = 'org-1' as OrganizationId;
const TARGET = 'target-1' as CampaignActivationTargetId;

describe('canTransitionPublicationJob — valid transitions', () => {
  const validCases: Array<[PublicationJobStatus, PublicationJobStatus]> = [
    ['queued', 'claimed'],
    ['queued', 'cancelled'],
    ['claimed', 'in_progress'],
    ['claimed', 'cancelled'],
    ['in_progress', 'succeeded'],
    ['in_progress', 'failed'],
    ['in_progress', 'unknown_outcome'],
    ['unknown_outcome', 'succeeded'],
    ['unknown_outcome', 'failed'],
  ];

  it.each(validCases)('%s -> %s es valida', (from, to) => {
    expect(canTransitionPublicationJob(from, to)).toBe(true);
  });
});

describe('canTransitionPublicationJob — invalid transitions (CRITICO)', () => {
  const invalidCases: Array<[PublicationJobStatus, PublicationJobStatus]> = [
    // Nunca resurreccion desde terminal.
    ['succeeded', 'queued'],
    ['succeeded', 'in_progress'],
    ['failed', 'queued'],
    ['failed', 'in_progress'],
    ['cancelled', 'queued'],
    ['cancelled', 'in_progress'],
    // unknown_outcome nunca vuelve directamente a queued/in_progress (no auto-retry ciego).
    ['unknown_outcome', 'queued'],
    ['unknown_outcome', 'in_progress'],
    ['unknown_outcome', 'cancelled'],
    // in_progress nunca cancela directamente (cooperativo, no es edge del grafo).
    ['in_progress', 'cancelled'],
    // No hay salto de queued directo a in_progress/succeeded/failed.
    ['queued', 'in_progress'],
    ['queued', 'succeeded'],
    ['queued', 'failed'],
    // claimed no puede saltar directo a succeeded/failed sin pasar por in_progress.
    ['claimed', 'succeeded'],
    ['claimed', 'failed'],
  ];

  it.each(invalidCases)('%s -> %s es invalida', (from, to) => {
    expect(canTransitionPublicationJob(from, to)).toBe(false);
  });
});

describe('transitionPublicationJob', () => {
  it('retorna el estado destino en una transicion valida', () => {
    expect(transitionPublicationJob('queued', 'claimed')).toBe('claimed');
  });

  it('lanza en una transicion ilegal', () => {
    expect(() => transitionPublicationJob('succeeded', 'queued')).toThrow(/illegal transition/);
  });
});

describe('isPublicationJobTerminal', () => {
  it.each(['succeeded', 'failed', 'cancelled'] as PublicationJobStatus[])(
    '%s es terminal',
    (status) => {
      expect(isPublicationJobTerminal(status)).toBe(true);
    },
  );

  it.each(['queued', 'claimed', 'in_progress', 'unknown_outcome'] as PublicationJobStatus[])(
    '%s NO es terminal (unknown_outcome incluido - CRITICO)',
    (status) => {
      expect(isPublicationJobTerminal(status)).toBe(false);
    },
  );

  it('cubre todos los PUBLICATION_JOB_STATUSES sin lanzar', () => {
    for (const status of PUBLICATION_JOB_STATUSES) {
      expect(() => getPublicationJobNextStates(status)).not.toThrow();
    }
  });
});

describe('cancelacion — locked decision #2 (operator+ directa, strategist+ cooperativa)', () => {
  it.each(['queued', 'claimed'] as PublicationJobStatus[])(
    '%s permite cancelacion directa (operator+)',
    (status) => {
      expect(canDirectlyCancelPublicationJob(status)).toBe(true);
      expect(canRequestCooperativeCancel(status)).toBe(false);
    },
  );

  it('in_progress permite SOLO cancelacion cooperativa (strategist+), nunca directa', () => {
    expect(canDirectlyCancelPublicationJob('in_progress')).toBe(false);
    expect(canRequestCooperativeCancel('in_progress')).toBe(true);
  });

  it.each(['succeeded', 'failed', 'cancelled', 'unknown_outcome'] as PublicationJobStatus[])(
    '%s no permite ninguna forma de cancelacion',
    (status) => {
      expect(canDirectlyCancelPublicationJob(status)).toBe(false);
      expect(canRequestCooperativeCancel(status)).toBe(false);
    },
  );
});

describe('canRetryPublicationJob — nunca retry ciego desde unknown_outcome (CRITICO)', () => {
  it('unknown_outcome NUNCA es retryable directamente, sin importar failureCategory', () => {
    expect(
      canRetryPublicationJob({ status: 'unknown_outcome', failureCategory: 'UNKNOWN_OUTCOME' }),
    ).toBe(false);
    expect(
      canRetryPublicationJob({
        status: 'unknown_outcome',
        failureCategory: 'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED',
      }),
    ).toBe(false);
  });

  it('failed con categoria retryable SI es elegible', () => {
    expect(canRetryPublicationJob({ status: 'failed', failureCategory: 'RATE_LIMITED' })).toBe(true);
    expect(
      canRetryPublicationJob({
        status: 'failed',
        failureCategory: 'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED',
      }),
    ).toBe(true);
  });

  it('failed con categoria NO retryable (ej. PROVIDER_REJECTED) no es elegible', () => {
    expect(canRetryPublicationJob({ status: 'failed', failureCategory: 'PROVIDER_REJECTED' })).toBe(false);
    expect(canRetryPublicationJob({ status: 'failed', failureCategory: 'AUTH_EXPIRED' })).toBe(false);
  });

  it('cualquier otro estado no terminal no es retryable', () => {
    expect(canRetryPublicationJob({ status: 'queued', failureCategory: null })).toBe(false);
    expect(canRetryPublicationJob({ status: 'succeeded', failureCategory: null })).toBe(false);
  });
});

describe('canReconcilePublicationJob', () => {
  it('SOLO unknown_outcome es reconciliable', () => {
    expect(canReconcilePublicationJob('unknown_outcome')).toBe(true);
    for (const status of PUBLICATION_JOB_STATUSES) {
      if (status !== 'unknown_outcome') {
        expect(canReconcilePublicationJob(status)).toBe(false);
      }
    }
  });
});

describe('buildPublicationIdempotencyKey', () => {
  it('formato: publish:{org}:{target}:{retryCount}', () => {
    expect(buildPublicationIdempotencyKey(ORG, TARGET, 0)).toBe('publish:org-1:target-1:0');
    expect(buildPublicationIdempotencyKey(ORG, TARGET, 3)).toBe('publish:org-1:target-1:3');
  });

  it('es deterministico - misma entrada, misma salida', () => {
    const a = buildPublicationIdempotencyKey(ORG, TARGET, 1);
    const b = buildPublicationIdempotencyKey(ORG, TARGET, 1);
    expect(a).toBe(b);
  });

  it('retryCount distinto produce keys distintas', () => {
    expect(buildPublicationIdempotencyKey(ORG, TARGET, 0)).not.toBe(
      buildPublicationIdempotencyKey(ORG, TARGET, 1),
    );
  });

  it('rechaza retryCount negativo o no entero', () => {
    expect(() => buildPublicationIdempotencyKey(ORG, TARGET, -1)).toThrow();
    expect(() => buildPublicationIdempotencyKey(ORG, TARGET, 1.5)).toThrow();
  });
});

describe('computeReconciliationDeadline', () => {
  it('suma timeoutMinutes en milisegundos', () => {
    const started = new Date('2026-08-25T00:00:00.000Z');
    const deadline = computeReconciliationDeadline(started, 15);
    expect(deadline.toISOString()).toBe('2026-08-25T00:15:00.000Z');
  });

  it('rechaza timeout no positivo', () => {
    const started = new Date();
    expect(() => computeReconciliationDeadline(started, 0)).toThrow();
    expect(() => computeReconciliationDeadline(started, -5)).toThrow();
  });
});

describe('campaignPublicationJobId', () => {
  it('rechaza id vacio', () => {
    expect(() => campaignPublicationJobId('')).toThrow();
    expect(() => campaignPublicationJobId('   ')).toThrow();
  });

  it('acepta id no vacio', () => {
    expect(campaignPublicationJobId('job-1')).toBe('job-1');
  });
});
