/**
 * Tests for getAutomationExecution and listAutomationExecutions — Phase 6D section 14D
 */

import { describe, it, expect, vi } from 'vitest';
import { getAutomationExecution } from '../get-execution.use-case';
import { listAutomationExecutions } from '../list-executions.use-case';
import type { GetAutomationExecutionDeps } from '../get-execution.use-case';
import type { ListAutomationExecutionsInput, ListAutomationExecutionsDeps } from '../list-executions.use-case';
import { ok, err, paginate } from '@bop-agency/shared';
import type {
  AutomationExecution, AutomationExecutionId, AutomationExecutionRepository,
  OrganizationId, AutomationId,
} from '@bop-agency/domain';
import { idempotencyKeyFromString } from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

// ─── Factories ─────────────────────────────────────────────────────────────────

const ORG_A = 'org-a' as OrganizationId;
const ORG_B = 'org-b' as OrganizationId;
const AUTO_A = 'auto-a' as AutomationId;
const EXEC_1 = 'exec-1' as AutomationExecutionId;

function makeExecution(overrides: Partial<AutomationExecution> = {}): AutomationExecution {
  return {
    id: EXEC_1, organizationId: ORG_A, automationId: AUTO_A,
    clientId: null, status: 'queued', attempt: 1,
    idempotencyKey: idempotencyKeyFromString('k1'), triggeredBy: 'u1',
    triggerType: 'manual', inputMetadata: {}, outputMetadata: null,
    errorCode: null, errorMessage: null, queuedAt: new Date(),
    startedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// ─── getAutomationExecution tests ─────────────────────────────────────────────

describe('getAutomationExecution', () => {

  function makeDeps(found: AutomationExecution | null): GetAutomationExecutionDeps {
    return {
      executionRepository: {
        findById: vi.fn().mockResolvedValue(found ? ok(found) : err({ code: 'NOT_FOUND', message: 'nf' })),
        create: vi.fn(), findByIdempotencyKey: vi.fn(), updateStatus: vi.fn(),
        findByAutomation: vi.fn(), findByOrganization: vi.fn(), countByStatus: vi.fn(),
      } as unknown as AutomationExecutionRepository,
      logger: makeLogger(),
    };
  }

  // ── D1: organization isolation ────────────────────────────────────────────

  it('passes organizationId to repository (enforces tenant isolation)', async () => {
    const exec = makeExecution();
    const deps = makeDeps(exec);
    await getAutomationExecution({ organizationId: ORG_A, executionId: EXEC_1 }, deps);
    expect(deps.executionRepository.findById).toHaveBeenCalledWith(EXEC_1, ORG_A);
  });

  it('returns NOT_FOUND when execution does not exist', async () => {
    const deps = makeDeps(null);
    const result = await getAutomationExecution({ organizationId: ORG_A, executionId: EXEC_1 }, deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns execution when found', async () => {
    const exec = makeExecution({ status: 'running' });
    const deps = makeDeps(exec);
    const result = await getAutomationExecution({ organizationId: ORG_A, executionId: EXEC_1 }, deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.status).toBe('running');
  });

  it('does NOT return executions from another org (repo enforces isolation)', async () => {
    // Repo returns NOT_FOUND for wrong org
    const deps = makeDeps(null);
    const result = await getAutomationExecution({ organizationId: ORG_B, executionId: EXEC_1 }, deps);
    expect(result.success).toBe(false);
  });
});

// ─── listAutomationExecutions tests ───────────────────────────────────────────

describe('listAutomationExecutions', () => {

  function makeListRepo(items: AutomationExecution[] = []): AutomationExecutionRepository {
    return {
      findByOrganization: vi.fn().mockResolvedValue(paginate(items, items.length, { page: 1, pageSize: 20 })),
      findById: vi.fn(), create: vi.fn(), findByIdempotencyKey: vi.fn(),
      updateStatus: vi.fn(), findByAutomation: vi.fn(), countByStatus: vi.fn(),
    } as unknown as AutomationExecutionRepository;
  }

  function makeListDeps(items: AutomationExecution[] = []): ListAutomationExecutionsDeps {
    return { executionRepository: makeListRepo(items), logger: makeLogger() };
  }

  function makeListInput(overrides: Partial<ListAutomationExecutionsInput> = {}): ListAutomationExecutionsInput {
    return { organizationId: ORG_A, pagination: { page: 1, pageSize: 20 }, ...overrides };
  }

  // ── D2: organization isolation ────────────────────────────────────────────

  it('always passes organizationId to repository', async () => {
    const deps = makeListDeps();
    await listAutomationExecutions(makeListInput(), deps);
    expect(deps.executionRepository.findByOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A }),
      expect.any(Object),
    );
  });

  // ── D3: filtros ───────────────────────────────────────────────────────────

  it('passes automationId filter when provided', async () => {
    const deps = makeListDeps();
    await listAutomationExecutions(makeListInput({ automationId: AUTO_A }), deps);
    expect(deps.executionRepository.findByOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ automationId: AUTO_A }),
      expect.any(Object),
    );
  });

  it('passes status filter when provided', async () => {
    const deps = makeListDeps();
    await listAutomationExecutions(makeListInput({ status: 'failed' }), deps);
    expect(deps.executionRepository.findByOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
      expect.any(Object),
    );
  });

  it('does NOT pass automationId when undefined (no over-filtering)', async () => {
    const deps = makeListDeps();
    await listAutomationExecutions(makeListInput(), deps);
    const calls = (deps.executionRepository.findByOrganization as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const filterArg = calls[0] as Record<string,unknown>;
    expect(filterArg).not.toHaveProperty('automationId');
  });

  // ── D4: paginación ────────────────────────────────────────────────────────

  it('passes pagination params to repository', async () => {
    const deps = makeListDeps();
    await listAutomationExecutions(makeListInput({ pagination: { page: 2, pageSize: 10 } }), deps);
    expect(deps.executionRepository.findByOrganization).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });

  // ── D5: resultado paginado ────────────────────────────────────────────────

  it('returns paginated result with items', async () => {
    const items = [makeExecution(), makeExecution({ id: 'exec-2' as AutomationExecutionId })];
    const deps = makeListDeps(items);
    const result = await listAutomationExecutions(makeListInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.data).toHaveLength(2);
      expect(result.value.total).toBe(2);
    }
  });

  it('returns empty result when no executions found', async () => {
    const deps = makeListDeps([]);
    const result = await listAutomationExecutions(makeListInput(), deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.data).toHaveLength(0);
  });

  // ── D6: status filter ─────────────────────────────────────────────────────

  it('filters by multiple statuses (one call per status)', async () => {
    for (const status of ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'retrying'] as const) {
      const deps = makeListDeps([makeExecution({ status })]);
      await listAutomationExecutions(makeListInput({ status }), deps);
      expect(deps.executionRepository.findByOrganization).toHaveBeenCalledWith(
        expect.objectContaining({ status }),
        expect.any(Object),
      );
    }
  });
});
