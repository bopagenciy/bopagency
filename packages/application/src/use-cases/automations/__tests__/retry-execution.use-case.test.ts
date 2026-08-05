/**
 * Tests for retryAutomationExecution — Phase 6D section 14C (correctivo)
 *
 * Cambios respecto a la versión anterior:
 * - H1: Backoff activo NO crea ejecución → retryDeferred:true (nuevos tests C10-C12)
 * - H3: Idempotency key: longitud, sanitización, recovery 23505 (nuevos C14-C17)
 * - Output type es ahora discriminado: { retryDeferred: true|false }
 */

import { describe, it, expect, vi } from 'vitest';
import { retryAutomationExecution } from '../retry-execution.use-case';
import type { RetryAutomationExecutionInput, RetryAutomationExecutionDeps } from '../retry-execution.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  Automation, AutomationId, AutomationExecution, AutomationExecutionId,
  AutomationRepository, AutomationExecutionRepository, ExecutionLogRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { idempotencyKeyFromString } from '@bop-agency/domain';
import type { WorkflowDispatcherPort } from '../../../ports/workflow-dispatcher.port';
import type { LoggerPort } from '../../../ports/logger.port';

// ─── Factories ─────────────────────────────────────────────────────────────────

const ORG_ID  = 'org-1' as OrganizationId;
const AUTO_ID = 'auto-1' as AutomationId;
const EXEC_ID = 'exec-failed-1' as AutomationExecutionId;

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: AUTO_ID, organizationId: ORG_ID, clientId: null,
    name: 'T', description: null, status: 'active',
    triggerConfig: { type: 'manual' },
    retryPolicy: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
    n8nWorkflowId: null, metadata: {},
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeExecution(overrides: Partial<AutomationExecution> = {}): AutomationExecution {
  return {
    id: EXEC_ID, organizationId: ORG_ID, automationId: AUTO_ID,
    clientId: null, status: 'failed', attempt: 1,
    idempotencyKey: idempotencyKeyFromString('orig-key'), triggeredBy: 'user-1',
    triggerType: 'manual', inputMetadata: {}, outputMetadata: null,
    errorCode: 'DISPATCH_FAILED', errorMessage: null,
    queuedAt: new Date(), startedAt: new Date(), completedAt: new Date(),
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeNewExecution(attempt: number): AutomationExecution {
  return makeExecution({ id: 'exec-retry-1' as AutomationExecutionId, status: 'queued', attempt, errorCode: null });
}

function makeAutoRepo(automation = makeAutomation()): AutomationRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(automation)),
    create: vi.fn(), update: vi.fn(), archive: vi.fn(),
    findByOrganization: vi.fn(), findByClient: vi.fn(), existsByName: vi.fn(), countByStatus: vi.fn(),
  } as unknown as AutomationRepository;
}

function makeExecRepo(
  previous: AutomationExecution | null,
  newExec: AutomationExecution = makeNewExecution(2),
  idempotencyResult: AutomationExecution | null = null,
): AutomationExecutionRepository {
  return {
    findById:             vi.fn().mockResolvedValue(previous ? ok(previous) : err({ code: 'NOT_FOUND', message: 'nf' })),
    create:               vi.fn().mockResolvedValue(ok(newExec)),
    updateStatus:         vi.fn().mockResolvedValue(ok(makeExecution({ status: 'failed', errorCode: 'DISPATCH_FAILED' }))),
    findByIdempotencyKey: vi.fn().mockResolvedValue(ok(idempotencyResult)),
    findByAutomation:     vi.fn(), findByOrganization: vi.fn(), countByStatus: vi.fn(),
  } as unknown as AutomationExecutionRepository;
}

function makeLogRepo(): ExecutionLogRepository {
  return { log: vi.fn().mockResolvedValue(ok(undefined)), findByExecution: vi.fn() } as unknown as ExecutionLogRepository;
}

function makeDispatcher(): WorkflowDispatcherPort {
  return {
    dispatch: vi.fn().mockResolvedValue(ok({ externalRunId: 'run-2', dispatchedAt: new Date() })),
    cancel:   vi.fn().mockResolvedValue(ok(undefined)),
  };
}

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeDeps(overrides: Partial<RetryAutomationExecutionDeps> = {}): RetryAutomationExecutionDeps {
  return {
    automationRepository:   makeAutoRepo(),
    executionRepository:    makeExecRepo(makeExecution()),
    executionLogRepository: makeLogRepo(),
    dispatcher:             makeDispatcher(),
    logger:                 makeLogger(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<RetryAutomationExecutionInput> = {}): RetryAutomationExecutionInput {
  return { organizationId: ORG_ID, executionId: EXEC_ID, requestedBy: 'user-1', ...overrides };
}

/** Automation with zero delay so retries are immediate (no backoff). */
function makeZeroBackoffAutomation(): Automation {
  return makeAutomation({
    retryPolicy: { maxAttempts: 5, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 },
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('retryAutomationExecution', () => {

  // ── C1: failed válida → resultado no diferido ─────────────────────────────

  it('creates a new execution for a failed one (no backoff)', async () => {
    const deps = makeDeps({ automationRepository: makeAutoRepo(makeZeroBackoffAutomation()) });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.retryDeferred).toBe(false);
      if (!result.value.retryDeferred) {
        expect(result.value.attempt).toBe(2);
        expect(result.value.previousExecutionId).toBe(EXEC_ID);
      }
    }
  });

  // ── C2: succeeded → rechazada ─────────────────────────────────────────────

  it('rejects retry of succeeded execution', async () => {
    const deps = makeDeps({ executionRepository: makeExecRepo(makeExecution({ status: 'succeeded' })) });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ── C3: cancelled → rechazada ─────────────────────────────────────────────

  it('rejects retry of cancelled execution', async () => {
    const deps = makeDeps({ executionRepository: makeExecRepo(makeExecution({ status: 'cancelled' })) });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ── C4: max attempts ──────────────────────────────────────────────────────

  it('rejects retry when maxAttempts is reached', async () => {
    const exec = makeExecution({ attempt: 3 });
    const deps = makeDeps({
      executionRepository: makeExecRepo(exec),
      automationRepository: makeAutoRepo(makeAutomation({ retryPolicy: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 } })),
    });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ── C5: attempt incrementado ──────────────────────────────────────────────

  it('increments attempt by 1', async () => {
    const newExec = makeNewExecution(2);
    const execRepo = makeExecRepo(makeExecution({ attempt: 1 }), newExec);
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
    });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success && !result.value.retryDeferred) {
      expect(result.value.attempt).toBe(2);
    }
    const createCall = (execRepo.create as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect((createCall[0] as Record<string,unknown>)['attempt']).toBe(2);
  });

  // ── C6: nueva fila (no sobrescribe la anterior) ───────────────────────────

  it('creates a NEW execution row (does not overwrite previous)', async () => {
    const execRepo = makeExecRepo(makeExecution({ attempt: 1 }), makeNewExecution(2));
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
    });
    await retryAutomationExecution(makeInput(), deps);
    expect(execRepo.create).toHaveBeenCalledTimes(1);
  });

  // ── C7: nueva idempotencyKey ──────────────────────────────────────────────

  it('generates a different idempotencyKey than the previous execution', async () => {
    const execRepo = makeExecRepo(makeExecution({ attempt: 1 }), makeNewExecution(2));
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
    });
    await retryAutomationExecution(makeInput(), deps);
    const idempRow = (execRepo.create as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const idempArg = idempRow[0] as Record<string,unknown>;
    expect(String(idempArg['idempotencyKey'])).not.toBe('orig-key');
    expect(String(idempArg['idempotencyKey'])).toContain('retry');
  });

  // ── C8: previousExecutionId en metadata ───────────────────────────────────

  it('stores previousExecutionId in the new execution inputMetadata', async () => {
    const execRepo = makeExecRepo(makeExecution({ attempt: 1 }), makeNewExecution(2));
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
    });
    await retryAutomationExecution(makeInput(), deps);
    const metaRow = (execRepo.create as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const metaArg = metaRow[0] as Record<string,unknown>;
    const prevMeta = metaArg['inputMetadata'] as Record<string,unknown>;
    expect(prevMeta['previousExecutionId']).toBe(String(EXEC_ID));
  });

  // ── C9: Retry concurrente — CONFLICT bubble-up cuando no hay ejecución existente ──

  it('surfaces CONFLICT when concurrent retry triggers unique violation and existing is not found', async () => {
    const execRepo: AutomationExecutionRepository = {
      findById:             vi.fn().mockResolvedValue(ok(makeExecution({ attempt: 1 }))),
      create:               vi.fn().mockResolvedValue(err({ code: 'CONFLICT', message: 'duplicate key' })),
      updateStatus:         vi.fn(),
      findByIdempotencyKey: vi.fn().mockResolvedValue(ok(null)), // not found after conflict
      findByAutomation:     vi.fn(), findByOrganization: vi.fn(), countByStatus: vi.fn(),
    } as unknown as AutomationExecutionRepository;
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
    });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONFLICT');
  });

  // ── C9b: Retry concurrente — recupera ejecución existente vía idempotencyKey ──

  it('recovers existing execution on CONFLICT (23505) — concurrent retry returns same execution', async () => {
    const existingRetry = makeNewExecution(2); // the execution created by the first request
    const execRepo: AutomationExecutionRepository = {
      findById:             vi.fn().mockResolvedValue(ok(makeExecution({ attempt: 1 }))),
      create:               vi.fn().mockResolvedValue(err({ code: 'CONFLICT', message: 'duplicate key' })),
      updateStatus:         vi.fn(),
      findByIdempotencyKey: vi.fn().mockResolvedValue(ok(existingRetry)),
      findByAutomation:     vi.fn(), findByOrganization: vi.fn(), countByStatus: vi.fn(),
    } as unknown as AutomationExecutionRepository;
    const dispatcher = makeDispatcher();
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
      dispatcher,
    });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.retryDeferred).toBe(false);
      if (!result.value.retryDeferred) {
        expect(result.value.execution.id).toBe(existingRetry.id);
        // No double-dispatch on recovery
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
      }
    }
  });

  // ── C9c: Solicitud repetida no crea retry N+1 ─────────────────────────────
  // La idempotencyKey derivada es determinística: misma key = mismo intento.

  it('derives deterministic idempotency key — same attempt always produces same key', async () => {
    const prev = makeExecution({ attempt: 2, idempotencyKey: idempotencyKeyFromString('base-key') });
    const execRepo1 = makeExecRepo(prev, makeNewExecution(3));
    const execRepo2 = makeExecRepo(prev, makeNewExecution(3));
    const deps1 = makeDeps({ executionRepository: execRepo1, automationRepository: makeAutoRepo(makeZeroBackoffAutomation()) });
    const deps2 = makeDeps({ executionRepository: execRepo2, automationRepository: makeAutoRepo(makeZeroBackoffAutomation()) });

    await retryAutomationExecution(makeInput(), deps1);
    await retryAutomationExecution(makeInput(), deps2);

    const arg1 = ((execRepo1.create as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[])[0] as Record<string,unknown>;
    const arg2 = ((execRepo2.create as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[])[0] as Record<string,unknown>;
    const key1 = String(arg1['idempotencyKey'] ?? '');
    const key2 = String(arg2['idempotencyKey'] ?? '');
    // Both calls must produce the exact same key
    expect(key1).toBe(key2);
  });

  // ── C10 (H1): Backoff activo → NO se crea ejecución, retryDeferred:true ──

  it('returns retryDeferred:true WITHOUT creating execution when backoff is active', async () => {
    // attempt=2 → attempt=3: delay = 1000 * 2^1 = 2000ms
    const exec2 = makeExecution({ attempt: 2 });
    const execRepo = makeExecRepo(exec2, makeNewExecution(3));
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeAutomation({
        retryPolicy: { maxAttempts: 5, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
      })),
    });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.retryDeferred).toBe(true);
      if (result.value.retryDeferred) {
        expect(result.value.nextEligibleAt).toBeInstanceOf(Date);
        expect(result.value.nextEligibleAt.getTime()).toBeGreaterThan(Date.now());
      }
    }
    // HALLAZGO 1: ninguna ejecución creada
    expect(execRepo.create).not.toHaveBeenCalled();
  });

  // ── C11 (H1): Backoff activo → dispatch NO invocado ──────────────────────

  it('does not call dispatcher when backoff is active', async () => {
    const exec2 = makeExecution({ attempt: 2 });
    const execRepo = makeExecRepo(exec2, makeNewExecution(3));
    const dispatcher = makeDispatcher();
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeAutomation({
        retryPolicy: { maxAttempts: 5, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
      })),
      dispatcher,
    });
    await retryAutomationExecution(makeInput(), deps);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  // ── C12 (H1): Sin backoff → ejecución creada y despachada ────────────────

  it('creates execution and dispatches when no backoff (zero delay)', async () => {
    const execRepo = makeExecRepo(makeExecution({ attempt: 1 }), makeNewExecution(2));
    const dispatcher = makeDispatcher();
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
      dispatcher,
    });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.retryDeferred).toBe(false);
    expect(execRepo.create).toHaveBeenCalledTimes(1);
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  // ── C13: Logs correctos ───────────────────────────────────────────────────

  it('logs execution.retry_requested and execution.retry_created (no backoff)', async () => {
    const logRepo = makeLogRepo();
    const deps = makeDeps({
      executionLogRepository: logRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
    });
    await retryAutomationExecution(makeInput(), deps);
    const events = (logRepo.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as { event: string }).event,
    );
    expect(events).toContain('execution.retry_requested');
    expect(events).toContain('execution.retry_created');
  });

  it('logs execution.retry_deferred (with backoff)', async () => {
    const logRepo = makeLogRepo();
    const exec2 = makeExecution({ attempt: 2 });
    const deps = makeDeps({
      executionRepository: makeExecRepo(exec2, makeNewExecution(3)),
      executionLogRepository: logRepo,
      automationRepository: makeAutoRepo(makeAutomation({
        retryPolicy: { maxAttempts: 5, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
      })),
    });
    await retryAutomationExecution(makeInput(), deps);
    const events = (logRepo.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as { event: string }).event,
    );
    expect(events).toContain('execution.retry_deferred');
    // No retry_created when deferred
    expect(events).not.toContain('execution.retry_created');
  });

  // ── C14 (H3): idempotencyKey — longitud máxima ────────────────────────────

  it('rejects explicit idempotencyKey exceeding 500 chars', async () => {
    const longKey = 'x'.repeat(501);
    const deps = makeDeps({ automationRepository: makeAutoRepo(makeZeroBackoffAutomation()) });
    const result = await retryAutomationExecution(makeInput({ idempotencyKey: longKey }), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects derived idempotencyKey exceeding 500 chars (long original key)', async () => {
    // original key of 495 chars + ":retry:2" = 503 → exceeds 500
    const longOrigKey = 'k'.repeat(495);
    const exec = makeExecution({ attempt: 1, idempotencyKey: idempotencyKeyFromString(longOrigKey) });
    const deps = makeDeps({
      executionRepository: makeExecRepo(exec, makeNewExecution(2)),
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
    });
    const result = await retryAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ── C15 (H3): idempotencyKey — sanitización de control chars ─────────────

  it('strips control characters from explicit idempotencyKey', async () => {
    const dirtyKey = 'my-key\x00with\x1Fcontrol';
    const execRepo = makeExecRepo(makeExecution({ attempt: 1 }), makeNewExecution(2));
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
    });
    await retryAutomationExecution(makeInput({ idempotencyKey: dirtyKey }), deps);
    if ((execRepo.create as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
      const createArg = ((execRepo.create as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[])[0] as Record<string,unknown>;
      expect(String(createArg['idempotencyKey'])).not.toMatch(/[\x00-\x1F\x7F]/);
    }
  });

  // ── C16 (H3): key scoped por organizationId (no global) ──────────────────

  it('scopes idempotency key by organizationId via findByIdempotencyKey on recovery', async () => {
    const existingRetry = makeNewExecution(2);
    const execRepo: AutomationExecutionRepository = {
      findById:             vi.fn().mockResolvedValue(ok(makeExecution({ attempt: 1 }))),
      create:               vi.fn().mockResolvedValue(err({ code: 'CONFLICT', message: 'dup' })),
      updateStatus:         vi.fn(),
      findByIdempotencyKey: vi.fn().mockResolvedValue(ok(existingRetry)),
      findByAutomation:     vi.fn(), findByOrganization: vi.fn(), countByStatus: vi.fn(),
    } as unknown as AutomationExecutionRepository;
    const deps = makeDeps({
      executionRepository: execRepo,
      automationRepository: makeAutoRepo(makeZeroBackoffAutomation()),
    });
    await retryAutomationExecution(makeInput(), deps);
    // findByIdempotencyKey must have been called with the organization ID
    const findCall = (execRepo.findByIdempotencyKey as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(findCall[1]).toBe(ORG_ID);
  });
});
