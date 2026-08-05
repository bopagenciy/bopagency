/**
 * Automation Server Actions — unit tests — Phase 6E
 *
 * Estrategia: mocks totales de dependencias externas.
 * vi.hoisted() garantiza inicialización antes que vi.mock().
 *
 * Cubre:
 * activateAutomationAction:  Zod error, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, ok + revalidatePath
 * pauseAutomationAction:     Zod error, FORBIDDEN, ok
 * archiveAutomationAction:   Zod error, FORBIDDEN, NOT_FOUND, ok
 * startExecutionAction:      Zod error, FORBIDDEN, EXTERNAL_SERVICE_ERROR, ok
 * cancelExecutionAction:     Zod error, FORBIDDEN, CANCEL_NOT_SUPPORTED, ok
 * retryExecutionAction:      Zod error, FORBIDDEN, ok (immediate), ok (deferred)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@bop-agency/shared';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const {
  mockRevalidatePath,
  mockRequireOrganizationRole,
  mockCreateServerSupabaseClient,
  mockUseCases,
  MockComposition,
} = vi.hoisted(() => {
  const mockUseCases = {
    listAutomations: vi.fn(),
    getAutomation: vi.fn(),
    activateAutomation: vi.fn(),
    pauseAutomation: vi.fn(),
    archiveAutomation: vi.fn(),
    startExecution: vi.fn(),
    cancelExecution: vi.fn(),
    retryExecution: vi.fn(),
    getExecution: vi.fn(),
    listExecutions: vi.fn(),
  };
  const MockComposition = vi.fn().mockReturnValue({ useCases: mockUseCases, repositories: {} });

  return {
    mockRevalidatePath: vi.fn(),
    mockRequireOrganizationRole: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn().mockResolvedValue({}),
    mockUseCases,
    MockComposition,
  };
});

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

vi.mock('@/lib/auth/server', () => ({
  requireOrganization: vi.fn(),
  requireOrganizationRole: mockRequireOrganizationRole,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock('@/lib/composition/automation.composition', () => ({
  createAutomationComposition: MockComposition,
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import {
  activateAutomationAction,
  pauseAutomationAction,
  archiveAutomationAction,
  startExecutionAction,
  cancelExecutionAction,
  retryExecutionAction,
} from '../actions';

// ─── Auth context helpers ─────────────────────────────────────────────────────

const MOCK_CONTEXT = {
  user: { id: 'user-1', email: 'test@test.com' },
  organization: { id: 'org-1', name: 'Org 1', slug: 'org-1' },
  membership: { role: 'admin' },
};

function authOk() {
  mockRequireOrganizationRole.mockResolvedValue(MOCK_CONTEXT);
}

function authForbidden() {
  mockRequireOrganizationRole.mockRejectedValue(new Error('forbidden'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateServerSupabaseClient.mockResolvedValue({});
  MockComposition.mockReturnValue({ useCases: mockUseCases, repositories: {} });
});

// ─── activateAutomationAction ─────────────────────────────────────────────────

describe('activateAutomationAction', () => {
  it('returns VALIDATION_ERROR for invalid payload', async () => {
    const result = await activateAutomationAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns FORBIDDEN when auth fails', async () => {
    authForbidden();
    const result = await activateAutomationAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND when automation missing', async () => {
    authOk();
    mockUseCases.activateAutomation.mockResolvedValue(err({ code: 'NOT_FOUND', message: 'nf' }));
    const result = await activateAutomationAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR on invalid transition', async () => {
    authOk();
    mockUseCases.activateAutomation.mockResolvedValue(err({ code: 'VALIDATION_ERROR', message: 'Cannot transition' }));
    const result = await activateAutomationAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns ok and revalidates paths on success', async () => {
    authOk();
    mockUseCases.activateAutomation.mockResolvedValue(ok({ id: 'auto-1', status: 'active' }));
    const result = await activateAutomationAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/automations');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/automations/auto-1');
  });

  it('passes organizationId from session, not from client', async () => {
    authOk();
    mockUseCases.activateAutomation.mockResolvedValue(ok({ id: 'auto-1', status: 'active' }));
    await activateAutomationAction({ automationId: 'auto-1', organizationId: 'hacker-org' });
    const call = (mockUseCases.activateAutomation.mock.calls[0] as typeof mockUseCases.activateAutomation.mock.calls[number])[0];
    expect(call.organizationId).toBe('org-1'); // from session, not client
  });
});

// ─── pauseAutomationAction ────────────────────────────────────────────────────

describe('pauseAutomationAction', () => {
  it('returns VALIDATION_ERROR for invalid payload', async () => {
    const result = await pauseAutomationAction({ automationId: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns FORBIDDEN when auth fails', async () => {
    authForbidden();
    const result = await pauseAutomationAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns ok and revalidates on success', async () => {
    authOk();
    mockUseCases.pauseAutomation.mockResolvedValue(ok({ id: 'auto-1', status: 'paused' }));
    const result = await pauseAutomationAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/automations');
  });
});

// ─── archiveAutomationAction ──────────────────────────────────────────────────

describe('archiveAutomationAction', () => {
  it('returns FORBIDDEN when auth fails', async () => {
    authForbidden();
    const result = await archiveAutomationAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND when automation missing', async () => {
    authOk();
    mockUseCases.archiveAutomation.mockResolvedValue(err({ code: 'NOT_FOUND', message: 'nf' }));
    const result = await archiveAutomationAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('returns ok on success', async () => {
    authOk();
    mockUseCases.archiveAutomation.mockResolvedValue(ok(undefined));
    const result = await archiveAutomationAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/automations');
  });
});

// ─── startExecutionAction ─────────────────────────────────────────────────────

describe('startExecutionAction', () => {
  it('returns VALIDATION_ERROR for invalid payload', async () => {
    const result = await startExecutionAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns FORBIDDEN when auth fails', async () => {
    authForbidden();
    const result = await startExecutionAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns error on EXTERNAL_SERVICE_ERROR', async () => {
    authOk();
    mockUseCases.startExecution.mockResolvedValue(err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'dispatch failed' }));
    const result = await startExecutionAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(false);
  });

  it('returns ok and revalidates on success', async () => {
    authOk();
    mockUseCases.startExecution.mockResolvedValue(ok({ id: 'exec-1', status: 'queued', dispatched: true }));
    const result = await startExecutionAction({ automationId: 'auto-1' });
    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/automations/auto-1');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/automations/auto-1/executions');
  });

  it('passes triggeredBy from session, triggerType=manual', async () => {
    authOk();
    mockUseCases.startExecution.mockResolvedValue(ok({ id: 'exec-1', status: 'queued' }));
    await startExecutionAction({ automationId: 'auto-1' });
    const call = (mockUseCases.startExecution.mock.calls[0] as typeof mockUseCases.startExecution.mock.calls[number])[0];
    expect(call.triggeredBy).toBe('user-1');
    expect(call.triggerType).toBe('manual');
    expect(call.organizationId).toBe('org-1');
  });
});

// ─── cancelExecutionAction ────────────────────────────────────────────────────

describe('cancelExecutionAction', () => {
  it('returns VALIDATION_ERROR for invalid payload', async () => {
    const result = await cancelExecutionAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns FORBIDDEN when auth fails', async () => {
    authForbidden();
    const result = await cancelExecutionAction({ executionId: 'exec-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns CANCEL_NOT_SUPPORTED correctly', async () => {
    authOk();
    mockUseCases.cancelExecution.mockResolvedValue(err({ code: 'CANCEL_NOT_SUPPORTED', message: 'no gateway' }));
    const result = await cancelExecutionAction({ executionId: 'exec-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CANCEL_NOT_SUPPORTED');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('returns ok and revalidates on success', async () => {
    authOk();
    mockUseCases.cancelExecution.mockResolvedValue(ok({ id: 'exec-1', status: 'cancelled' }));
    const result = await cancelExecutionAction({ executionId: 'exec-1' });
    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalled();
  });
});

// ─── retryExecutionAction ─────────────────────────────────────────────────────

describe('retryExecutionAction', () => {
  it('returns VALIDATION_ERROR for invalid payload', async () => {
    const result = await retryExecutionAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns FORBIDDEN when auth fails', async () => {
    authForbidden();
    const result = await retryExecutionAction({ executionId: 'exec-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('returns ok with retryDeferred=false and revalidates on immediate retry', async () => {
    authOk();
    mockUseCases.retryExecution.mockResolvedValue(ok({
      retryDeferred: false,
      execution: { id: 'exec-2', status: 'queued' },
      previousExecutionId: 'exec-1',
      attempt: 2,
      dispatched: true,
      nextEligibleAt: null,
    }));
    const result = await retryExecutionAction({ executionId: 'exec-1' });
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).data?.retryDeferred).toBe(false);
    expect(mockRevalidatePath).toHaveBeenCalled();
  });

  it('returns ok with retryDeferred=true and does NOT revalidate on deferred retry', async () => {
    authOk();
    mockUseCases.retryExecution.mockResolvedValue(ok({
      retryDeferred: true,
      nextEligibleAt: new Date(Date.now() + 30000),
      previousExecutionId: 'exec-1',
    }));
    const result = await retryExecutionAction({ executionId: 'exec-1' });
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).data?.retryDeferred).toBe(true);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
