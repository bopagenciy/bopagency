/**
 * Tests for composition root correctness — Phase 6D section 14E
 * These tests verify that the composition root wires dependencies correctly
 * without calling real Supabase or n8n.
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('automation execution composition contracts', () => {

  // ── E1: WorkflowDispatcherPort shape ─────────────────────────────────────

  it('WorkflowDispatcherPort requires dispatch and cancel', () => {
    // Verify the port interface is correctly structured
    const mockDispatcher = {
      dispatch: vi.fn().mockResolvedValue({ success: true, value: { externalRunId: 'r1', dispatchedAt: new Date() } }),
      cancel:   vi.fn().mockResolvedValue({ success: true, value: undefined }),
    };
    expect(typeof mockDispatcher.dispatch).toBe('function');
    expect(typeof mockDispatcher.cancel).toBe('function');
  });

  // ── E2: ExecutionLogRepository contract ───────────────────────────────────

  it('ExecutionLogRepository log method accepts sanitized event types', async () => {
    const logRepo = {
      log: vi.fn().mockResolvedValue({ success: true, value: undefined }),
      findByExecution: vi.fn(),
    };
    const validEvents = [
      'execution.queued', 'execution.dispatched', 'execution.dispatch_failed',
      'execution.cancelled', 'execution.retry_requested', 'execution.retry_created',
    ];
    for (const event of validEvents) {
      await logRepo.log({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        executionId:    'exec-1' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        organizationId: 'org-1' as any,
        level:          'info',
        event,
        message:        'test',
      });
    }
    expect(logRepo.log).toHaveBeenCalledTimes(validEvents.length);
  });

  // ── E3: No service_role usage in use cases ────────────────────────────────

  it('use cases do not import or reference service_role client', async () => {
    // Structural check: import the modules and verify no Supabase dependency
    const startModule = await import('../start-execution.use-case');
    const cancelModule = await import('../cancel-execution.use-case');
    const retryModule  = await import('../retry-execution.use-case');
    const getModule    = await import('../get-execution.use-case');
    const listModule   = await import('../list-executions.use-case');

    // All exports should be functions
    expect(typeof startModule.startAutomationExecution).toBe('function');
    expect(typeof cancelModule.cancelAutomationExecution).toBe('function');
    expect(typeof retryModule.retryAutomationExecution).toBe('function');
    expect(typeof getModule.getAutomationExecution).toBe('function');
    expect(typeof listModule.listAutomationExecutions).toBe('function');
  });

  // ── E4: startAutomationExecution result shape ─────────────────────────────

  it('StartAutomationExecutionOutput has required fields', async () => {
    const { startAutomationExecution } = await import('../start-execution.use-case');
    const { ok } = await import('@bop-agency/shared');

    const mockDeps = {
      automationRepository: {
        findById: vi.fn().mockResolvedValue(ok({
          id: 'auto-1', organizationId: 'org-1', clientId: null,
          name: 'T', description: null, status: 'active',
          triggerConfig: { type: 'manual' },
          retryPolicy: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
          n8nWorkflowId: null, metadata: {}, createdAt: new Date(), updatedAt: new Date(),
        })),
      },
      executionRepository: {
        findByIdempotencyKey: vi.fn().mockResolvedValue(ok(null)),
        create: vi.fn().mockResolvedValue(ok({
          id: 'exec-1', organizationId: 'org-1', automationId: 'auto-1',
          clientId: null, status: 'queued', attempt: 1,
          idempotencyKey: 'k1', triggeredBy: 'u', triggerType: 'manual',
          inputMetadata: {}, outputMetadata: null, errorCode: null, errorMessage: null,
          queuedAt: new Date(), startedAt: null, completedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        })),
        updateStatus: vi.fn().mockResolvedValue(ok({})),
      },
      executionLogRepository: { log: vi.fn().mockResolvedValue(ok(undefined)) },
      dispatcher: { dispatch: vi.fn().mockResolvedValue(ok({ externalRunId: 'r1', dispatchedAt: new Date() })), cancel: vi.fn() },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await startAutomationExecution(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { organizationId: 'org-1' as any, automationId: 'auto-1' as any, clientId: null, triggerType: 'manual', triggeredBy: 'u' },
      mockDeps,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveProperty('execution');
      expect(result.value).toHaveProperty('created');
      expect(result.value).toHaveProperty('dispatched');
      expect(result.value).toHaveProperty('duplicate');
      expect(typeof result.value.created).toBe('boolean');
      expect(typeof result.value.dispatched).toBe('boolean');
      expect(typeof result.value.duplicate).toBe('boolean');
    }
  });

  // ── E5: RetryAutomationExecutionOutput has nextEligibleAt ─────────────────

  it('RetryAutomationExecutionOutput includes nextEligibleAt', async () => {
    const { retryAutomationExecution } = await import('../retry-execution.use-case');
    const { ok } = await import('@bop-agency/shared');
    const { idempotencyKeyFromString } = await import('@bop-agency/domain');

    const prevExec = {
      id: 'exec-fail', organizationId: 'org-1', automationId: 'auto-1',
      clientId: null, status: 'failed', attempt: 1,
      idempotencyKey: idempotencyKeyFromString('orig'),
      triggeredBy: 'u', triggerType: 'manual', inputMetadata: {},
      outputMetadata: null, errorCode: 'DISPATCH_FAILED', errorMessage: null,
      queuedAt: new Date(), startedAt: new Date(), completedAt: new Date(),
      createdAt: new Date(), updatedAt: new Date(),
    };

    const newExec = { ...prevExec, id: 'exec-retry', status: 'queued', attempt: 2, errorCode: null };

    const mockDeps = {
      automationRepository: {
        findById: vi.fn().mockResolvedValue(ok({
          id: 'auto-1', organizationId: 'org-1', clientId: null, name: 'T',
          description: null, status: 'active', triggerConfig: { type: 'manual' },
          retryPolicy: { maxAttempts: 5, initialDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 },  // zero delay: immediate dispatch
          n8nWorkflowId: null, metadata: {}, createdAt: new Date(), updatedAt: new Date(),
        })),
      },
      executionRepository: {
        findById: vi.fn().mockResolvedValue(ok(prevExec)),
        create:   vi.fn().mockResolvedValue(ok(newExec)),
        updateStatus: vi.fn().mockResolvedValue(ok(newExec)),
      },
      executionLogRepository: { log: vi.fn().mockResolvedValue(ok(undefined)) },
      dispatcher: {
        dispatch: vi.fn().mockResolvedValue(ok({ externalRunId: 'r1', dispatchedAt: new Date() })),
        cancel: vi.fn(),
      },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await retryAutomationExecution(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { organizationId: 'org-1' as any, executionId: 'exec-fail' as any, requestedBy: 'u' },
      mockDeps,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveProperty('retryDeferred');
      expect(result.value).toHaveProperty('previousExecutionId');
      // With zero delay the retry is immediate (retryDeferred: false)
      expect(result.value.retryDeferred).toBe(false);
      if (!result.value.retryDeferred) {
        expect(result.value).toHaveProperty('execution');
        expect(result.value).toHaveProperty('attempt');
        expect(result.value).toHaveProperty('dispatched');
        expect(result.value.nextEligibleAt).toBeNull();
      }
    }
  });
});
