/**
 * Tests — evaluateAutomationIncident — Phase 6F
 *
 * Cubre: incident evaluator, deduplicación, recuperación, severidad,
 *        aislamiento multi-tenant, mensajes sanitizados, best-effort de repos.
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluateAutomationIncident } from '../evaluate-automation-incident.use-case';
import type {
  EvaluateAutomationIncidentInput,
  EvaluateAutomationIncidentDeps,
} from '../evaluate-automation-incident.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  AlertRepository,
  TaskRepository,
  OrganizationId,
  AutomationId,
  AutomationExecutionId,
  Alert,
  Task,
  UpsertAlertResult,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

// ─── Factories ─────────────────────────────────────────────────────────────────

const ORG_A   = 'org-aaa-111' as OrganizationId;
const ORG_B   = 'org-bbb-222' as OrganizationId;
const AUTO_ID = 'auto-xyz-001' as AutomationId;
const EXEC_ID = 'exec-000-001' as AutomationExecutionId;

const NOW = new Date('2026-08-05T10:00:00Z');

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-001' as Alert['id'],
    organizationId: ORG_A,
    clientId: null,
    alertKey: 'automation:org-aaa-111:auto-xyz-001:dispatch-failed',
    alertType: 'automation.dispatch_failed',
    platform: null,
    accountId: null,
    severity: 'warning',
    status: 'active',
    title: 'Dispatch fallido',
    description: 'Descripción',
    metadata: {},
    detectedAt: NOW,
    acknowledgedAt: null,
    acknowledgedBy: null,
    snoozedUntil: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001' as Task['id'],
    organizationId: ORG_A,
    clientId: null,
    title: 'Revisar conexión',
    description: null,
    status: 'pending',
    priority: 'high',
    dueDate: null,
    tags: ['automation', 'sig:org-aaa-111:auto-xyz-001:dispatch_failed'],
    createdBy: 'automation-incident-evaluator',
    updatedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeAlertRepo(overrides: Partial<AlertRepository> = {}): AlertRepository {
  return {
    findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
    findByOrganization: vi.fn(),
    findActiveByOrganization: vi.fn(),
    findByClient: vi.fn(),
    countBySeverity: vi.fn(),
    acknowledge: vi.fn(),
    resolve: vi.fn(),
    upsertByAlertKey: vi.fn().mockResolvedValue(ok({ alert: makeAlert(), created: true } as UpsertAlertResult)),
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
    create: vi.fn().mockResolvedValue(ok(makeTask())),
    findActiveBySignatureTag: vi.fn().mockResolvedValue(ok([])),
    ...overrides,
  } as unknown as TaskRepository;
}

/** Safe accessor for mock call args — throws if no call was made. */
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

function makeDeps(overrides: Partial<EvaluateAutomationIncidentDeps> = {}): EvaluateAutomationIncidentDeps {
  return {
    alertRepository: makeAlertRepo(),
    taskRepository:  makeTaskRepo(),
    logger:          silentLogger,
    ...overrides,
  };
}

function makeInput(overrides: Partial<EvaluateAutomationIncidentInput> = {}): EvaluateAutomationIncidentInput {
  return {
    organizationId:  ORG_A,
    automationId:    AUTO_ID,
    executionId:     EXEC_ID,
    clientId:        null,
    eventType:       'dispatch_failed',
    errorCode:       'DISPATCH_FAILED',
    safeErrorMessage: 'Dispatch failed.',
    occurredAt:      NOW,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('evaluateAutomationIncident', () => {

  describe('A. dispatch_failed', () => {
    it('crea alerta y tarea en el primer fallo', async () => {
      const deps = makeDeps();
      const result = await evaluateAutomationIncident(makeInput(), deps);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.value.alertCreated).toBe(true);
      expect(result.value.taskCreated).toBe(true);
      expect(result.value.alertResolved).toBe(false);
    });

    it('llama a upsertByAlertKey con severity=warning', async () => {
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(makeInput({ eventType: 'dispatch_failed' }), deps);

      expect(alertRepo.upsertByAlertKey).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'warning', alertType: 'automation.dispatch_failed' }),
      );
    });

    it('la firma de alerta incluye organizationId y automationId', async () => {
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(makeInput(), deps);

      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(call.alertKey).toContain(String(ORG_A));
      expect(call.alertKey).toContain(String(AUTO_ID));
      expect(call.alertKey).toContain('dispatch-failed');
    });

    it('no incluye executionId en la firma de la alerta', async () => {
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(makeInput(), deps);

      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(call.alertKey).not.toContain(String(EXEC_ID));
    });

    it('no incluye datos sensibles en título o descripción', async () => {
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(
        makeInput({ safeErrorMessage: 'Bearer sk-secret token leaked' }),
        deps,
      );

      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(call.title).not.toContain('Bearer');
      expect(call.title).not.toContain('sk-secret');
      expect(call.description).not.toContain('Bearer');
    });
  });

  describe('B. deduplicación', () => {
    it('cuando upsertByAlertKey devuelve created=false, marca alertUpdated=true', async () => {
      const alertRepo = makeAlertRepo({
        upsertByAlertKey: vi.fn().mockResolvedValue(
          ok({ alert: makeAlert(), created: false } as UpsertAlertResult),
        ),
      });
      const deps = makeDeps({ alertRepository: alertRepo });
      const result = await evaluateAutomationIncident(makeInput(), deps);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.alertCreated).toBe(false);
      expect(result.value.alertUpdated).toBe(true);
    });

    it('no crea tarea si ya existe una activa con la misma firma', async () => {
      const taskRepo = makeTaskRepo({
        findActiveBySignatureTag: vi.fn().mockResolvedValue(ok([makeTask()])),
      });
      const deps = makeDeps({ taskRepository: taskRepo });
      const result = await evaluateAutomationIncident(makeInput(), deps);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.taskCreated).toBe(false);
      expect(result.value.taskSkipped).toBe(true);
      expect(taskRepo.create).not.toHaveBeenCalled();
    });

    it('no crea tarea para EXECUTION_FAILED_GENERIC (sin acción humana clara)', async () => {
      const taskRepo = makeTaskRepo();
      const deps = makeDeps({ taskRepository: taskRepo });
      await evaluateAutomationIncident(
        makeInput({ eventType: 'execution_failed', errorCode: 'SOME_TRANSIENT_ERROR' }),
        deps,
      );
      expect(taskRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('C. execution_failed con distintos errorCodes', () => {
    it('TIMEOUT → severity warning', async () => {
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(
        makeInput({ eventType: 'execution_failed', errorCode: 'TIMEOUT' }),
        deps,
      );
      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(call.severity).toBe('warning');
    });

    it('WORKFLOW_NOT_FOUND → severity warning (critical execution error)', async () => {
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(
        makeInput({ eventType: 'execution_failed', errorCode: 'WORKFLOW_NOT_FOUND' }),
        deps,
      );
      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(call.severity).toBe('warning');
    });

    it('errorCode genérico → severity info', async () => {
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(
        makeInput({ eventType: 'execution_failed', errorCode: 'SOME_UNKNOWN_ERROR' }),
        deps,
      );
      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(call.severity).toBe('info');
    });
  });

  describe('D. max_attempts_reached', () => {
    it('crea alerta warning y tarea high', async () => {
      const alertRepo = makeAlertRepo();
      const taskRepo  = makeTaskRepo();
      const deps = makeDeps({ alertRepository: alertRepo, taskRepository: taskRepo });

      const result = await evaluateAutomationIncident(
        makeInput({ eventType: 'max_attempts_reached', errorCode: 'MAX_ATTEMPTS_REACHED' }),
        deps,
      );

      expect(result.success).toBe(true);
      expect(firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>).severity).toBe('warning');
      expect(taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'high' }),
      );
    });

    it('la firma de alerta incluye max-attempts', async () => {
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(
        makeInput({ eventType: 'max_attempts_reached', errorCode: 'MAX_ATTEMPTS_REACHED' }),
        deps,
      );
      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(call.alertKey).toContain('max-attempts');
    });
  });

  describe('E. execution_succeeded — recuperación', () => {
    it('resuelve alertas recuperables activas de la misma automation', async () => {
      const alertRepo = makeAlertRepo({
        resolveActiveByAlertKeyPrefixes: vi.fn().mockResolvedValue(ok(2)),
      });
      const deps = makeDeps({ alertRepository: alertRepo });

      const result = await evaluateAutomationIncident(
        makeInput({ eventType: 'execution_succeeded', errorCode: null }),
        deps,
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.alertResolved).toBe(true);
      expect(result.value.alertsResolvedCount).toBe(2);
      expect(result.value.taskCreated).toBe(false);
    });

    it('no llama a upsertByAlertKey en recuperación', async () => {
      const alertRepo = makeAlertRepo({
        resolveActiveByAlertKeyPrefixes: vi.fn().mockResolvedValue(ok(0)),
      });
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(
        makeInput({ eventType: 'execution_succeeded', errorCode: null }),
        deps,
      );
      expect(alertRepo.upsertByAlertKey).not.toHaveBeenCalled();
    });

    it('los prefijos de resolución incluyen la automation y org correctas', async () => {
      const alertRepo = makeAlertRepo({
        resolveActiveByAlertKeyPrefixes: vi.fn().mockResolvedValue(ok(0)),
      });
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(
        makeInput({ eventType: 'execution_succeeded', organizationId: ORG_A, automationId: AUTO_ID }),
        deps,
      );
      const call = (alertRepo.resolveActiveByAlertKeyPrefixes as ReturnType<typeof vi.fn>).mock.calls[0] as [string[], ...unknown[]] | undefined;
      const prefixes: string[] = (call?.[0] ?? []) as string[];
      expect(prefixes.some((p) => p.includes(String(ORG_A)))).toBe(true);
      expect(prefixes.some((p) => p.includes(String(AUTO_ID)))).toBe(true);
    });
  });

  describe('F. aislamiento multi-tenant', () => {
    it('la firma incluye siempre organizationId para aislar tenants', async () => {
      const alertRepoA = makeAlertRepo();
      const alertRepoB = makeAlertRepo();

      await evaluateAutomationIncident(makeInput({ organizationId: ORG_A }), makeDeps({ alertRepository: alertRepoA }));
      await evaluateAutomationIncident(makeInput({ organizationId: ORG_B }), makeDeps({ alertRepository: alertRepoB }));

      const callA = firstCallArg(alertRepoA.upsertByAlertKey as ReturnType<typeof vi.fn>);
      const callB = firstCallArg(alertRepoB.upsertByAlertKey as ReturnType<typeof vi.fn>);

      expect(callA.alertKey).toContain(String(ORG_A));
      expect(callB.alertKey).toContain(String(ORG_B));
      expect(callA.alertKey).not.toBe(callB.alertKey);
    });

    it('el organizationId de la alerta coincide con el input', async () => {
      const alertRepo = makeAlertRepo();
      const deps = makeDeps({ alertRepository: alertRepo });
      await evaluateAutomationIncident(makeInput({ organizationId: ORG_B }), deps);
      const call = firstCallArg(alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>);
      expect(String(call.organizationId)).toBe(String(ORG_B));
    });
  });

  describe('G. best-effort — fallo de repositorios', () => {
    it('si upsertByAlertKey falla, retorna success con alertCreated=false', async () => {
      const alertRepo = makeAlertRepo({
        upsertByAlertKey: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'DB down' })),
      });
      const deps = makeDeps({ alertRepository: alertRepo });
      const result = await evaluateAutomationIncident(makeInput(), deps);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.alertCreated).toBe(false);
      expect(result.value.alertUpdated).toBe(false);
    });

    it('si taskRepository.create falla, retorna success con taskCreated=false', async () => {
      const taskRepo = makeTaskRepo({
        create: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'DB down' })),
      });
      const deps = makeDeps({ taskRepository: taskRepo });
      const result = await evaluateAutomationIncident(makeInput(), deps);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.taskCreated).toBe(false);
    });

    it('si resolveActiveByAlertKeyPrefixes falla en recuperación, retorna success', async () => {
      const alertRepo = makeAlertRepo({
        resolveActiveByAlertKeyPrefixes: vi.fn().mockResolvedValue(
          err({ code: 'INTERNAL_ERROR', message: 'DB error' }),
        ),
      });
      const deps = makeDeps({ alertRepository: alertRepo });
      const result = await evaluateAutomationIncident(
        makeInput({ eventType: 'execution_succeeded' }),
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.alertResolved).toBe(false);
      expect(result.value.alertsResolvedCount).toBe(0);
    });
  });
});
