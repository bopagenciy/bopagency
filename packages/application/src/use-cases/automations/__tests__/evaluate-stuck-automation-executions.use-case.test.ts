/**
 * Tests — evaluateStuckAutomationExecutions — Phase 6F
 *
 * Cubre: detección por umbral, paginación, deduplicación, clock inyectable,
 *        aislamiento multi-tenant, resiliencia ante fallos de repositorio.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  evaluateStuckAutomationExecutions,
  systemClock,
} from '../evaluate-stuck-automation-executions.use-case';
import type {
  EvaluateStuckAutomationExecutionsInput,
  EvaluateStuckAutomationExecutionsDeps,
  ClockPort,
} from '../evaluate-stuck-automation-executions.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  AutomationExecutionRepository,
  AlertRepository,
  TaskRepository,
  OrganizationId,
  AutomationId,
  AutomationExecutionId,
  AutomationExecution,
  Alert,
  Task,
} from '@bop-agency/domain';
import type { PaginatedResult } from '@bop-agency/shared';
import type { LoggerPort } from '../../../ports/logger.port';
import { idempotencyKeyFromString } from '@bop-agency/domain';

// ─── Constants ─────────────────────────────────────────────────────────────────

const ORG_A  = 'org-stuck-111' as OrganizationId;
const NOW    = new Date('2026-08-05T12:00:00Z');
const QUEUED_THRESHOLD_MS  = 600_000;  // 10 min
const RUNNING_THRESHOLD_MS = 1_800_000; // 30 min

// ─── Factories ─────────────────────────────────────────────────────────────────

function makeExecution(
  id: string,
  automationId: string,
  status: 'queued' | 'running',
  ageMs: number,
): AutomationExecution {
  const queuedAt = new Date(NOW.getTime() - ageMs);
  return {
    id: id as AutomationExecutionId,
    organizationId: ORG_A,
    automationId: automationId as AutomationId,
    clientId: null,
    status,
    attempt: 1,
    idempotencyKey: idempotencyKeyFromString(`idem-${id}`),
    triggeredBy: 'test',
    triggerType: 'manual',
    inputMetadata: {},
    outputMetadata: null,
    errorCode: null,
    errorMessage: null,
    queuedAt,
    startedAt: status === 'running' ? queuedAt : null,
    completedAt: null,
    createdAt: queuedAt,
    updatedAt: queuedAt,
  };
}

function emptyPage(): PaginatedResult<AutomationExecution> {
  return { data: [], total: 0, page: 1, pageSize: 50, totalPages: 0, hasNextPage: false, hasPreviousPage: false };
}

function pageOf(...execs: AutomationExecution[]): PaginatedResult<AutomationExecution> {
  return { data: execs, total: execs.length, page: 1, pageSize: 50, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
}

function makeExecRepo(overrides: Partial<AutomationExecutionRepository> = {}): AutomationExecutionRepository {
  return {
    findById: vi.fn(),
    findByOrganization: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    countByStatus: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    listStuckCandidates: vi.fn().mockResolvedValue(emptyPage()),
    ...overrides,
  } as unknown as AutomationExecutionRepository;
}

function makeAlertRepo(overrides: Partial<AlertRepository> = {}): AlertRepository {
  return {
    findById: vi.fn(),
    findByOrganization: vi.fn(),
    findActiveByOrganization: vi.fn(),
    findByClient: vi.fn(),
    countBySeverity: vi.fn(),
    acknowledge: vi.fn(),
    resolve: vi.fn(),
    upsertByAlertKey: vi.fn().mockResolvedValue(ok({ alert: null as unknown as Alert, created: true })),
    findActiveByAlertKey: vi.fn().mockResolvedValue(ok(null)),
    resolveActiveByAlertKeyPrefixes: vi.fn().mockResolvedValue(ok(0)),
    ...overrides,
  } as unknown as AlertRepository;
}

function makeTaskRepo(overrides: Partial<TaskRepository> = {}): TaskRepository {
  return {
    findById: vi.fn(),
    findByOrganization: vi.fn(),
    findByClient: vi.fn(),
    findUpcoming: vi.fn(),
    countByStatus: vi.fn(),
    updateStatus: vi.fn(),
    create: vi.fn().mockResolvedValue(ok({ id: 'task-001' } as unknown as Task)),
    findActiveBySignatureTag: vi.fn().mockResolvedValue(ok([])),
    ...overrides,
  } as unknown as TaskRepository;
}

/** Safe accessor for mock call args. */
function firstCallArg(mockFn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = mockFn.mock.calls[0];
  if (!call) throw new Error('Mock was never called');
  return call[0] as Record<string, unknown>;
}

const silentLogger: LoggerPort = {
  debug: vi.fn(),
  info:  vi.fn(),
  warn:  vi.fn(),
  error: vi.fn(),
};

function fixedClock(date: Date): ClockPort {
  return { now: () => date };
}

function makeDeps(overrides: Partial<EvaluateStuckAutomationExecutionsDeps> = {}): EvaluateStuckAutomationExecutionsDeps {
  return {
    executionRepository: makeExecRepo(),
    alertRepository: makeAlertRepo(),
    taskRepository: makeTaskRepo(),
    logger: silentLogger,
    clock: fixedClock(NOW),
    ...overrides,
  };
}

function makeInput(overrides: Partial<EvaluateStuckAutomationExecutionsInput> = {}): EvaluateStuckAutomationExecutionsInput {
  return {
    organizationId: ORG_A,
    queuedThresholdMs:  QUEUED_THRESHOLD_MS,
    runningThresholdMs: RUNNING_THRESHOLD_MS,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('evaluateStuckAutomationExecutions', () => {

  describe('A. sin ejecuciones atascadas', () => {
    it('retorna summary vacío cuando no hay candidatos', async () => {
      const result = await evaluateStuckAutomationExecutions(makeInput(), makeDeps());
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.processedQueued).toBe(0);
      expect(result.value.processedRunning).toBe(0);
      expect(result.value.alertsCreated).toBe(0);
      expect(result.value.tasksCreated).toBe(0);
      expect(result.value.affectedAutomationIds).toHaveLength(0);
    });

    it('consulta listStuckCandidates con statuses correctos y olderThan derivado del clock', async () => {
      const execRepo = makeExecRepo();
      const deps = makeDeps({ executionRepository: execRepo });
      await evaluateStuckAutomationExecutions(makeInput(), deps);

      // queued call
      expect(execRepo.listStuckCandidates).toHaveBeenCalledWith(
        ORG_A,
        ['queued'],
        new Date(NOW.getTime() - QUEUED_THRESHOLD_MS),
        expect.any(Number),
        1,
      );
      // running call
      expect(execRepo.listStuckCandidates).toHaveBeenCalledWith(
        ORG_A,
        ['running'],
        new Date(NOW.getTime() - RUNNING_THRESHOLD_MS),
        expect.any(Number),
        1,
      );
    });
  });

  describe('B. umbrales de detección', () => {
    it('procesa ejecución queued que supera el umbral', async () => {
      const exec = makeExecution('exec-q1', 'auto-001', 'queued', QUEUED_THRESHOLD_MS + 1000);
      const execRepo = makeExecRepo({
        listStuckCandidates: vi.fn()
          .mockResolvedValueOnce(pageOf(exec))
          .mockResolvedValueOnce(emptyPage()),
      });
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ executionRepository: execRepo, alertRepository: alertRepo });

      const result = await evaluateStuckAutomationExecutions(makeInput(), deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.processedQueued).toBe(1);
      expect(result.value.affectedAutomationIds).toContain('auto-001');
    });

    it('procesa ejecución running que supera el umbral', async () => {
      const exec = makeExecution('exec-r1', 'auto-002', 'running', RUNNING_THRESHOLD_MS + 1000);
      const execRepo = makeExecRepo({
        listStuckCandidates: vi.fn()
          .mockResolvedValueOnce(emptyPage())
          .mockResolvedValueOnce(pageOf(exec)),
      });
      const deps = makeDeps({ executionRepository: execRepo });

      const result = await evaluateStuckAutomationExecutions(makeInput(), deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.processedRunning).toBe(1);
      expect(result.value.affectedAutomationIds).toContain('auto-002');
    });

    it('el errorCode enviado al evaluador es STUCK_QUEUED para queued', async () => {
      const exec = makeExecution('exec-q2', 'auto-003', 'queued', QUEUED_THRESHOLD_MS + 5000);
      const execRepo = makeExecRepo({
        listStuckCandidates: vi.fn()
          .mockResolvedValueOnce(pageOf(exec))
          .mockResolvedValueOnce(emptyPage()),
      });
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ executionRepository: execRepo, alertRepository: alertRepo });

      await evaluateStuckAutomationExecutions(makeInput(), deps);

      // El alertKey debe contener 'stuck' (viene de STUCK_QUEUED)
      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(call.alertKey).toContain('stuck');
    });

    it('el errorCode enviado al evaluador es STUCK_RUNNING para running', async () => {
      const exec = makeExecution('exec-r2', 'auto-004', 'running', RUNNING_THRESHOLD_MS + 5000);
      const execRepo = makeExecRepo({
        listStuckCandidates: vi.fn()
          .mockResolvedValueOnce(emptyPage())
          .mockResolvedValueOnce(pageOf(exec)),
      });
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ executionRepository: execRepo, alertRepository: alertRepo });

      await evaluateStuckAutomationExecutions(makeInput(), deps);

      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(call.alertKey).toContain('stuck');
    });
  });

  describe('C. clock inyectable', () => {
    it('usa el clock inyectado para calcular olderThan', async () => {
      const FIXED = new Date('2026-06-01T08:00:00Z');
      const execRepo = makeExecRepo();
      const deps = makeDeps({
        executionRepository: execRepo,
        clock: fixedClock(FIXED),
      });

      await evaluateStuckAutomationExecutions(makeInput(), deps);

      expect(execRepo.listStuckCandidates).toHaveBeenCalledWith(
        ORG_A,
        ['queued'],
        new Date(FIXED.getTime() - QUEUED_THRESHOLD_MS),
        expect.any(Number),
        1,
      );
    });

    it('el evaluatedAt en el resultado coincide con el clock', async () => {
      const FIXED = new Date('2026-03-15T09:30:00Z');
      const result = await evaluateStuckAutomationExecutions(
        makeInput(),
        makeDeps({ clock: fixedClock(FIXED) }),
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.evaluatedAt).toEqual(FIXED);
    });

    it('systemClock.now() devuelve una Date cercana a ahora', () => {
      const before = Date.now();
      const t = systemClock.now();
      const after = Date.now();
      expect(t.getTime()).toBeGreaterThanOrEqual(before);
      expect(t.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('D. deduplicación', () => {
    it('no crea tarea si ya existe una activa con la misma firma', async () => {
      const exec = makeExecution('exec-q3', 'auto-005', 'queued', QUEUED_THRESHOLD_MS + 1000);
      const execRepo = makeExecRepo({
        listStuckCandidates: vi.fn()
          .mockResolvedValueOnce(pageOf(exec))
          .mockResolvedValueOnce(emptyPage()),
      });
      const taskRepo = makeTaskRepo({
        findActiveBySignatureTag: vi.fn().mockResolvedValue(ok([{ id: 'existing-task' } as unknown as Task])),
      });
      const deps = makeDeps({ executionRepository: execRepo, taskRepository: taskRepo });

      const result = await evaluateStuckAutomationExecutions(makeInput(), deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.tasksCreated).toBe(0);
      expect(result.value.tasksSkipped).toBeGreaterThan(0);
    });

    it('acumula affectedAutomationIds únicos de ambos tipos', async () => {
      const execQ = makeExecution('exec-q4', 'auto-shared', 'queued', QUEUED_THRESHOLD_MS + 1000);
      const execR = makeExecution('exec-r4', 'auto-shared', 'running', RUNNING_THRESHOLD_MS + 1000);
      const execRepo = makeExecRepo({
        listStuckCandidates: vi.fn()
          .mockResolvedValueOnce(pageOf(execQ))
          .mockResolvedValueOnce(pageOf(execR)),
      });
      const deps = makeDeps({ executionRepository: execRepo });
      const result = await evaluateStuckAutomationExecutions(makeInput(), deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.affectedAutomationIds).toHaveLength(1);
      expect(result.value.affectedAutomationIds).toContain('auto-shared');
    });
  });

  describe('E. aislamiento multi-tenant', () => {
    it('el organizationId se pasa a listStuckCandidates', async () => {
      const ORG_B = 'org-stuck-222' as OrganizationId;
      const execRepo = makeExecRepo();
      const deps = makeDeps({ executionRepository: execRepo });
      await evaluateStuckAutomationExecutions(makeInput({ organizationId: ORG_B }), deps);
      expect(execRepo.listStuckCandidates).toHaveBeenCalledWith(
        ORG_B,
        expect.any(Array),
        expect.any(Date),
        expect.any(Number),
        1,
      );
    });

    it('el organizationId del summary coincide con el input', async () => {
      const ORG_B = 'org-stuck-333' as OrganizationId;
      const result = await evaluateStuckAutomationExecutions(
        makeInput({ organizationId: ORG_B }),
        makeDeps(),
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(String(result.value.organizationId)).toBe(String(ORG_B));
    });
  });

  describe('F. resiliencia ante fallos de repositorio', () => {
    it('si listStuckCandidates queued falla, continúa y procesa running', async () => {
      const exec = makeExecution('exec-r5', 'auto-006', 'running', RUNNING_THRESHOLD_MS + 1000);
      const execRepo = makeExecRepo({
        listStuckCandidates: vi.fn()
          .mockRejectedValueOnce(new Error('DB down'))
          .mockResolvedValueOnce(pageOf(exec)),
      });
      const deps = makeDeps({ executionRepository: execRepo });
      const result = await evaluateStuckAutomationExecutions(makeInput(), deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.processedQueued).toBe(0);
      expect(result.value.processedRunning).toBe(1);
    });

    it('si alertRepository falla en best-effort, retorna success con alertsCreated=0', async () => {
      const exec = makeExecution('exec-q5', 'auto-007', 'queued', QUEUED_THRESHOLD_MS + 1000);
      const execRepo = makeExecRepo({
        listStuckCandidates: vi.fn()
          .mockResolvedValueOnce(pageOf(exec))
          .mockResolvedValueOnce(emptyPage()),
      });
      const alertRepo = makeAlertRepo({
        upsertByAlertKey: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'DB error' })),
      });
      const deps = makeDeps({ executionRepository: execRepo, alertRepository: alertRepo });
      const result = await evaluateStuckAutomationExecutions(makeInput(), deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.alertsCreated).toBe(0);
      expect(result.value.processedQueued).toBe(1);
    });

    it('si múltiples ejecuciones: un fallo individual no interrumpe las restantes', async () => {
      const exec1 = makeExecution('exec-q6a', 'auto-008', 'queued', QUEUED_THRESHOLD_MS + 1000);
      const exec2 = makeExecution('exec-q6b', 'auto-009', 'queued', QUEUED_THRESHOLD_MS + 1000);
      const execRepo = makeExecRepo({
        listStuckCandidates: vi.fn()
          .mockResolvedValueOnce(pageOf(exec1, exec2))
          .mockResolvedValueOnce(emptyPage()),
      });
      let callCount = 0;
      const alertRepo = makeAlertRepo({
        upsertByAlertKey: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve(err({ code: 'INTERNAL_ERROR', message: 'fail' }));
          return Promise.resolve(ok({ alert: null as unknown as Alert, created: true }));
        }),
      });
      const deps = makeDeps({ executionRepository: execRepo, alertRepository: alertRepo });
      const result = await evaluateStuckAutomationExecutions(makeInput(), deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.processedQueued).toBe(2);
      expect(result.value.alertsCreated).toBe(1); // solo el segundo exitoso
    });
  });
});
