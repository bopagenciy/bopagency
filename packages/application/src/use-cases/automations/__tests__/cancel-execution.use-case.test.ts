/**
 * Tests for cancelAutomationExecution — Phase 6D section 14B (correctivo)
 *
 * Cambios respecto a la versión anterior:
 * - H2: running + no dispatcher → CANCEL_NOT_SUPPORTED (no cancelled local)
 * - H2: running + dispatcher error → error devuelto, ejecución permanece running
 * - H2: running + dispatcher ok → cancelled localmente (comportamiento correcto)
 * - Tests B3 y B4 reescritos para reflejar la nueva semántica
 */

import { describe, it, expect, vi } from 'vitest';
import { cancelAutomationExecution } from '../cancel-execution.use-case';
import type { CancelAutomationExecutionInput, CancelAutomationExecutionDeps } from '../cancel-execution.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  AutomationExecution, AutomationExecutionId, AutomationExecutionRepository,
  ExecutionLogRepository, OrganizationId,
} from '@bop-agency/domain';
import { idempotencyKeyFromString } from '@bop-agency/domain';
import type { WorkflowDispatcherPort } from '../../../ports/workflow-dispatcher.port';
import type { LoggerPort } from '../../../ports/logger.port';

// ─── Factories ─────────────────────────────────────────────────────────────────

const ORG_ID   = 'org-1' as OrganizationId;
const EXEC_ID  = 'exec-1' as AutomationExecutionId;

function makeExecution(overrides: Partial<AutomationExecution> = {}): AutomationExecution {
  return {
    id: EXEC_ID, organizationId: ORG_ID, automationId: 'auto-1' as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    clientId: null, status: 'queued', attempt: 1,
    idempotencyKey: idempotencyKeyFromString('k1'), triggeredBy: 'u1',
    triggerType: 'manual', inputMetadata: {}, outputMetadata: null,
    errorCode: null, errorMessage: null, queuedAt: new Date(),
    startedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeExecRepo(execution: AutomationExecution | null, updateResult = ok(makeExecution({ status: 'cancelled' }))): AutomationExecutionRepository {
  return {
    findById:     vi.fn().mockResolvedValue(execution ? ok(execution) : err({ code: 'NOT_FOUND', message: 'nf' })),
    updateStatus: vi.fn().mockResolvedValue(updateResult),
    create: vi.fn(), findByIdempotencyKey: vi.fn(), findByAutomation: vi.fn(),
    findByOrganization: vi.fn(), countByStatus: vi.fn(),
  } as unknown as AutomationExecutionRepository;
}

function makeLogRepo(): ExecutionLogRepository {
  return { log: vi.fn().mockResolvedValue(ok(undefined)), findByExecution: vi.fn() } as unknown as ExecutionLogRepository;
}

function makeDispatcher(cancelResult = ok(undefined as void)): WorkflowDispatcherPort {
  return { dispatch: vi.fn(), cancel: vi.fn().mockResolvedValue(cancelResult) };
}

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeDeps(overrides: Partial<CancelAutomationExecutionDeps> = {}): CancelAutomationExecutionDeps {
  return {
    executionRepository: makeExecRepo(makeExecution()),
    executionLogRepository: makeLogRepo(),
    dispatcher: makeDispatcher(),
    logger: makeLogger(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<CancelAutomationExecutionInput> = {}): CancelAutomationExecutionInput {
  return { organizationId: ORG_ID, executionId: EXEC_ID, requestedBy: 'user-1', ...overrides };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('cancelAutomationExecution', () => {

  // ── B1: queued → cancelled localmente, sin dispatcher ────────────────────

  it('cancels a queued execution locally without calling external dispatcher', async () => {
    const dispatcher = makeDispatcher();
    const deps = makeDeps({ dispatcher, executionRepository: makeExecRepo(makeExecution({ status: 'queued' })) });
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.status).toBe('cancelled');
    expect(dispatcher.cancel).not.toHaveBeenCalled();
  });

  // ── B2: running + dispatcher ok → cancelled ───────────────────────────────

  it('cancels a running execution when dispatcher.cancel confirms success', async () => {
    const dispatcher = makeDispatcher(ok(undefined as void));
    const cancelledExec = makeExecution({ status: 'cancelled' });
    const execRepo = makeExecRepo(makeExecution({ status: 'running' }), ok(cancelledExec));
    const deps = makeDeps({ dispatcher, executionRepository: execRepo });
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.status).toBe('cancelled');
    expect(dispatcher.cancel).toHaveBeenCalledWith(String(EXEC_ID));
    expect(execRepo.updateStatus).toHaveBeenCalled();
  });

  // ── B3 (H2): running + no dispatcher → CANCEL_NOT_SUPPORTED ──────────────
  // Ejecución NO es marcada como cancelled. Error seguro devuelto al caller.

  it('returns CANCEL_NOT_SUPPORTED for running execution when no dispatcher is provided', async () => {
    const execRepo = makeExecRepo(makeExecution({ status: 'running' }));
    // No dispatcher — omit the property
    const deps: CancelAutomationExecutionDeps = {
      executionRepository: execRepo,
      executionLogRepository: makeLogRepo(),
      logger: makeLogger(),
    };
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CANCEL_NOT_SUPPORTED');
    // Execution must NOT have been updated to cancelled
    expect(execRepo.updateStatus).not.toHaveBeenCalled();
  });

  // ── B4 (H2): running + dispatcher falla → error devuelto, running se mantiene ──

  it('returns error and keeps execution running when external cancel fails', async () => {
    const dispatcher: WorkflowDispatcherPort = {
      dispatch: vi.fn(),
      cancel: vi.fn().mockResolvedValue(err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'n8n unreachable' })),
    };
    const execRepo = makeExecRepo(makeExecution({ status: 'running' }));
    const deps = makeDeps({ dispatcher, executionRepository: execRepo });
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    // Execution remains running — updateStatus must NOT have been called
    expect(execRepo.updateStatus).not.toHaveBeenCalled();
  });

  // ── B4b (H2): running + dispatcher timeout → error devuelto ──────────────

  it('returns error when external cancel times out — does not mark as cancelled', async () => {
    const dispatcher: WorkflowDispatcherPort = {
      dispatch: vi.fn(),
      cancel: vi.fn().mockResolvedValue(err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'timeout', details: { reason: 'timeout' } })),
    };
    const execRepo = makeExecRepo(makeExecution({ status: 'running' }));
    const deps = makeDeps({ dispatcher, executionRepository: execRepo });
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    expect(execRepo.updateStatus).not.toHaveBeenCalled();
  });

  // ── B5: succeeded → rechazado ─────────────────────────────────────────────

  it('rejects cancellation of succeeded execution', async () => {
    const deps = makeDeps({ executionRepository: makeExecRepo(makeExecution({ status: 'succeeded' })) });
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ── B6: failed → rechazado ────────────────────────────────────────────────

  it('rejects cancellation of failed execution', async () => {
    const deps = makeDeps({ executionRepository: makeExecRepo(makeExecution({ status: 'failed' })) });
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ── B7: cancelled — idempotente ───────────────────────────────────────────

  it('is idempotent when execution is already cancelled', async () => {
    const cancelledExec = makeExecution({ status: 'cancelled' });
    const execRepo = makeExecRepo(cancelledExec);
    const deps = makeDeps({ executionRepository: execRepo });
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.status).toBe('cancelled');
    expect(execRepo.updateStatus).not.toHaveBeenCalled();
  });

  // ── B8: Organization mismatch ─────────────────────────────────────────────

  it('returns NOT_FOUND for execution belonging to another org', async () => {
    const deps = makeDeps({ executionRepository: makeExecRepo(null) });
    const result = await cancelAutomationExecution(
      makeInput({ organizationId: 'other-org' as OrganizationId }),
      deps,
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  // ── B9: Not found ─────────────────────────────────────────────────────────

  it('returns NOT_FOUND when execution does not exist', async () => {
    const deps = makeDeps({ executionRepository: makeExecRepo(null) });
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  // ── B10: Reason sanitizado ────────────────────────────────────────────────

  it('strips control characters from reason', async () => {
    const execRepo = makeExecRepo(makeExecution({ status: 'queued' }), ok(makeExecution({ status: 'cancelled' })));
    const deps = makeDeps({ executionRepository: execRepo });
    await cancelAutomationExecution(makeInput({ reason: 'bad\x00reason\x1F' }), deps);
    const updateCall = (execRepo.updateStatus as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect((updateCall[2] as Record<string,string>).errorMessage).not.toMatch(/[\x00-\x1F]/);
  });

  it('truncates reason to 255 chars', async () => {
    const execRepo = makeExecRepo(makeExecution({ status: 'queued' }), ok(makeExecution({ status: 'cancelled' })));
    const deps = makeDeps({ executionRepository: execRepo });
    const longReason = 'x'.repeat(500);
    await cancelAutomationExecution(makeInput({ reason: longReason }), deps);
    const updateCall = (execRepo.updateStatus as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const arg2 = updateCall.at(2) as Record<string,string> | undefined;
    expect(arg2?.['errorMessage']?.length ?? 0).toBeLessThanOrEqual(300);
  });

  // ── B11: Log correcto ─────────────────────────────────────────────────────

  it('logs execution.cancelled event on success', async () => {
    const logRepo = makeLogRepo();
    const execRepo = makeExecRepo(makeExecution({ status: 'queued' }), ok(makeExecution({ status: 'cancelled' })));
    const deps = makeDeps({ executionLogRepository: logRepo, executionRepository: execRepo });
    await cancelAutomationExecution(makeInput(), deps);
    const events = (logRepo.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as { event: string }).event,
    );
    expect(events).toContain('execution.cancelled');
  });

  // ── B12: retrying → rechazado (estado no cancelable) ─────────────────────

  it('rejects cancellation of retrying execution', async () => {
    const deps = makeDeps({ executionRepository: makeExecRepo(makeExecution({ status: 'retrying' })) });
    const result = await cancelAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
