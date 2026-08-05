/**
 * Tests for startAutomationExecution use case — Phase 6D
 * Coverage: all scenarios from spec section 14A
 */

import { describe, it, expect, vi } from 'vitest';
import { startAutomationExecution } from '../start-execution.use-case';
import type { StartAutomationExecutionInput, StartAutomationExecutionDeps } from '../start-execution.use-case';
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

const ORG_ID = 'org-abc' as OrganizationId;
const AUTO_ID = 'auto-xyz' as AutomationId;
const EXEC_ID = 'exec-001' as AutomationExecutionId;

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: AUTO_ID,
    organizationId: ORG_ID,
    clientId: null,
    name: 'Test Automation',
    description: null,
    status: 'active',
    triggerConfig: { type: 'manual' },
    retryPolicy: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
    n8nWorkflowId: null,
    metadata: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeExecution(overrides: Partial<AutomationExecution> = {}): AutomationExecution {
  return {
    id: EXEC_ID,
    organizationId: ORG_ID,
    automationId: AUTO_ID,
    clientId: null,
    status: 'queued',
    attempt: 1,
    idempotencyKey: idempotencyKeyFromString('test-key'),
    triggeredBy: 'user-1',
    triggerType: 'manual',
    inputMetadata: {},
    outputMetadata: null,
    errorCode: null,
    errorMessage: null,
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Fake repos ────────────────────────────────────────────────────────────────

function makeAutomationRepo(automation: Automation | null = makeAutomation()): AutomationRepository {
  return {
    findById: vi.fn().mockResolvedValue(
      automation ? ok(automation) : err({ code: 'NOT_FOUND', message: 'not found' }),
    ),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    findByOrganization: vi.fn(),
    findByClient: vi.fn(),
    existsByName: vi.fn(),
    countByStatus: vi.fn(),
  } as unknown as AutomationRepository;
}

function makeExecutionRepo(opts: {
  existingByKey?: AutomationExecution | null;
  createResult?: ReturnType<typeof ok | typeof err>;
  updateResult?: ReturnType<typeof ok | typeof err>;
} = {}): AutomationExecutionRepository {
  return {
    create:               vi.fn().mockResolvedValue(opts.createResult ?? ok(makeExecution())),
    findByIdempotencyKey: vi.fn().mockResolvedValue(ok(opts.existingByKey ?? null)),
    findById:             vi.fn().mockResolvedValue(ok(makeExecution())),
    updateStatus:         vi.fn().mockResolvedValue(opts.updateResult ?? ok(makeExecution({ status: 'failed' }))),
    findByAutomation:     vi.fn(),
    findByOrganization:   vi.fn(),
    countByStatus:        vi.fn(),
  } as unknown as AutomationExecutionRepository;
}

function makeLogRepo(): ExecutionLogRepository {
  return { log: vi.fn().mockResolvedValue(ok(undefined)), findByExecution: vi.fn() } as unknown as ExecutionLogRepository;
}

function makeDispatcher(result: ReturnType<typeof ok | typeof err> = ok({ externalRunId: 'run-1', dispatchedAt: new Date() })): WorkflowDispatcherPort {
  return {
    dispatch: vi.fn().mockResolvedValue(result),
    cancel:   vi.fn().mockResolvedValue(ok(undefined)),
  };
}

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeDeps(overrides: Partial<StartAutomationExecutionDeps> = {}): StartAutomationExecutionDeps {
  return {
    automationRepository:   makeAutomationRepo(),
    executionRepository:    makeExecutionRepo(),
    executionLogRepository: makeLogRepo(),
    dispatcher:             makeDispatcher(),
    logger:                 makeLogger(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<StartAutomationExecutionInput> = {}): StartAutomationExecutionInput {
  return {
    organizationId: ORG_ID,
    automationId:   AUTO_ID,
    clientId:       null,
    triggerType:    'manual',
    triggeredBy:    'user-1',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('startAutomationExecution', () => {

  // ── A1: Automation inexistente ──────────────────────────────────────────────

  it('returns NOT_FOUND when automation does not exist', async () => {
    const deps = makeDeps({ automationRepository: makeAutomationRepo(null) });
    const result = await startAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  // ── A2: Automation de otra organización ────────────────────────────────────

  it('returns NOT_FOUND when automation belongs to another org (repo enforces isolation)', async () => {
    // The repo findById with (automationId, wrongOrg) returns NOT_FOUND
    const repo = {
      ...makeAutomationRepo(null),
      findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
    } as unknown as AutomationRepository;
    const deps = makeDeps({ automationRepository: repo });
    const result = await startAutomationExecution(
      makeInput({ organizationId: 'other-org' as OrganizationId }),
      deps,
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  // ── A3: Automation draft ───────────────────────────────────────────────────

  it('rejects draft automation', async () => {
    const deps = makeDeps({ automationRepository: makeAutomationRepo(makeAutomation({ status: 'draft' })) });
    const result = await startAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ── A4: Automation paused ─────────────────────────────────────────────────

  it('rejects paused automation', async () => {
    const deps = makeDeps({ automationRepository: makeAutomationRepo(makeAutomation({ status: 'paused' })) });
    const result = await startAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ── A5: Automation archived ───────────────────────────────────────────────

  it('rejects archived automation', async () => {
    const deps = makeDeps({ automationRepository: makeAutomationRepo(makeAutomation({ status: 'archived' })) });
    const result = await startAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  // ── A6: Active válida — flujo exitoso ──────────────────────────────────────

  it('creates and dispatches a new execution for an active automation', async () => {
    const deps = makeDeps();
    const result = await startAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.created).toBe(true);
      expect(result.value.dispatched).toBe(true);
      expect(result.value.duplicate).toBe(false);
      expect(result.value.execution.status).toBe('queued');
    }
  });

  // ── A7: clientId nullable ─────────────────────────────────────────────────

  it('accepts null clientId for global automations', async () => {
    const deps = makeDeps();
    const result = await startAutomationExecution(makeInput({ clientId: null }), deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.execution.clientId).toBeNull();
  });

  // ── A8: Idempotency — ejecución ya existe ─────────────────────────────────

  it('returns existing execution when idempotencyKey already exists', async () => {
    const existing = makeExecution({ status: 'queued' });
    const execRepo = makeExecutionRepo({ existingByKey: existing });
    const dispatcher = makeDispatcher();
    const deps = makeDeps({ executionRepository: execRepo, dispatcher });
    const result = await startAutomationExecution(
      makeInput({ idempotencyKey: 'existing-key' }),
      deps,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.duplicate).toBe(true);
      expect(result.value.created).toBe(false);
      expect(result.value.dispatched).toBe(false);
      expect(result.value.execution.id).toBe(existing.id);
    }
    // Must NOT dispatch again
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  // ── A9: Unique violation concurrente ──────────────────────────────────────

  it('recovers gracefully from concurrent unique violation (returns existing)', async () => {
    const existing = makeExecution();
    const execRepo = {
      ...makeExecutionRepo(),
      create: vi.fn().mockResolvedValue(err({ code: 'CONFLICT', message: 'duplicate key' })),
      findByIdempotencyKey: vi.fn()
        .mockResolvedValueOnce(ok(null))       // first call returns null (no existing)
        .mockResolvedValueOnce(ok(existing)),  // recovery call returns the concurrent one
      updateStatus: vi.fn(),
    } as unknown as AutomationExecutionRepository;
    const dispatcher = makeDispatcher();
    const deps = makeDeps({ executionRepository: execRepo, dispatcher });
    const result = await startAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.duplicate).toBe(true);
      expect(result.value.created).toBe(false);
    }
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  // ── A10: Dispatch exitoso ─────────────────────────────────────────────────

  it('marks dispatched=true on successful dispatch', async () => {
    const deps = makeDeps({
      dispatcher: makeDispatcher(ok({ externalRunId: 'n8n-run-99', dispatchedAt: new Date() })),
    });
    const result = await startAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.dispatched).toBe(true);
  });

  // ── A11: Dispatch fallido → ejecución marcada como failed ─────────────────

  it('marks execution as failed when dispatch fails', async () => {
    const failedExec = makeExecution({ status: 'failed', errorCode: 'DISPATCH_FAILED' });
    const execRepo = makeExecutionRepo({ updateResult: ok(failedExec) });
    const dispatcher = makeDispatcher(err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'n8n down' }));
    const deps = makeDeps({ executionRepository: execRepo, dispatcher });
    const result = await startAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.dispatched).toBe(false);
      expect(result.value.created).toBe(true);
      expect(result.value.execution.status).toBe('failed');
      expect(result.value.execution.errorCode).toBe('DISPATCH_FAILED');
    }
    expect(execRepo.updateStatus).toHaveBeenCalledWith(
      expect.anything(),
      ORG_ID,
      expect.objectContaining({ status: 'failed', errorCode: 'DISPATCH_FAILED' }),
    );
  });

  // ── A12: Timeout ambiguo ──────────────────────────────────────────────────

  it('treats timeout as dispatch failure and marks execution failed', async () => {
    const failedExec = makeExecution({ status: 'failed', errorCode: 'DISPATCH_FAILED' });
    const execRepo = makeExecutionRepo({ updateResult: ok(failedExec) });
    const dispatcher = makeDispatcher(err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'timeout', details: { reason: 'timeout' } }));
    const deps = makeDeps({ executionRepository: execRepo, dispatcher });
    const result = await startAutomationExecution(makeInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.execution.status).toBe('failed');
  });

  // ── A13: Error sanitizado — no propaga detalles técnicos ─────────────────

  it('does not expose raw error from dispatcher in execution errorMessage', async () => {
    const execRepo = makeExecutionRepo({ updateResult: ok(makeExecution({ status: 'failed', errorCode: 'DISPATCH_FAILED' })) });
    const dispatcher = makeDispatcher(err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'secret_token_xyz connection refused at 192.168.1.1' }));
    const deps = makeDeps({ executionRepository: execRepo, dispatcher });
    await startAutomationExecution(makeInput(), deps);
    const updateCall = (execRepo.updateStatus as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect((updateCall[2] as Record<string,string>).errorMessage).not.toContain('secret_token_xyz');
  });

  // ── A14: No doble dispatch ────────────────────────────────────────────────

  it('dispatches exactly once per new execution', async () => {
    const dispatcher = makeDispatcher();
    const deps = makeDeps({ dispatcher });
    await startAutomationExecution(makeInput(), deps);
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  // ── A15: Logs correctos ───────────────────────────────────────────────────

  it('logs execution.queued and execution.dispatched on success', async () => {
    const logRepo = makeLogRepo();
    const deps = makeDeps({ executionLogRepository: logRepo });
    await startAutomationExecution(makeInput(), deps);
    const calls = (logRepo.log as ReturnType<typeof vi.fn>).mock.calls;
    const events = calls.map((c: unknown[]) => (c[0] as { event: string }).event);
    expect(events).toContain('execution.queued');
    expect(events).toContain('execution.dispatched');
  });

  it('logs execution.dispatch_failed when dispatch fails', async () => {
    const logRepo = makeLogRepo();
    const execRepo = makeExecutionRepo({ updateResult: ok(makeExecution({ status: 'failed' })) });
    const dispatcher = makeDispatcher(err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'down' }));
    const deps = makeDeps({ executionLogRepository: logRepo, executionRepository: execRepo, dispatcher });
    await startAutomationExecution(makeInput(), deps);
    const events = (logRepo.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as { event: string }).event,
    );
    expect(events).toContain('execution.dispatch_failed');
  });

  // ── A16: Metadata sin secretos ────────────────────────────────────────────

  it('strips forbidden keys from inputMetadata before persisting', async () => {
    const execRepo = makeExecutionRepo();
    const deps = makeDeps({ executionRepository: execRepo });
    await startAutomationExecution(
      makeInput({ inputMetadata: { campaignId: 'c-1', secretToken: 'hidden', password: '123' } }),
      deps,
    );
    const createCall = (execRepo.create as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const createArg = createCall[0] as Record<string,unknown>;
    expect(createArg['inputMetadata']).toHaveProperty('campaignId');
    const meta = createArg['inputMetadata'] as Record<string,unknown>;
    expect(meta).not.toHaveProperty('secretToken');
    expect(meta).not.toHaveProperty('password');
  });
});
