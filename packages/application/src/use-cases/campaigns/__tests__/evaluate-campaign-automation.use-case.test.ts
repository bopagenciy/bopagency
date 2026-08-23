/**
 * Tests — evaluateCampaignAutomation — Phase 7F
 *
 * Cubre: creación de task/alert por tipo de evento, deduplicación (idempotencia),
 * aislamiento multi-tenant, no publicación externa, best-effort de repos,
 * y el caso especial de fallo de IA antes de que exista una campaña persistida
 * (campaignId null).
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluateCampaignAutomation } from '../evaluate-campaign-automation.use-case';
import type {
  EvaluateCampaignAutomationInput,
  EvaluateCampaignAutomationDeps,
} from '../evaluate-campaign-automation.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  AlertRepository,
  TaskRepository,
  OrganizationId,
  CampaignId,
  ClientId,
  Alert,
  Task,
  UpsertAlertResult,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

// ─── Factories ─────────────────────────────────────────────────────────────────

const ORG_A = 'org-aaa-111' as OrganizationId;
const ORG_B = 'org-bbb-222' as OrganizationId;
const CAMPAIGN_ID = 'campaign-xyz-001' as CampaignId;
const CLIENT_ID = 'client-abc-001' as ClientId;

const NOW = new Date('2026-08-23T10:00:00Z');
const ACTOR_ID = 'user-uuid-real-001';

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-001' as Alert['id'],
    organizationId: ORG_A,
    clientId: null,
    alertKey: 'campaign:org-aaa-111:campaign-xyz-001:ai-provider-failure:AI_TIMEOUT',
    alertType: 'campaign.campaign_ai_provider_failure',
    platform: null,
    accountId: null,
    severity: 'warning',
    status: 'active',
    title: 'Fallo de proveedor de IA',
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
    title: 'Revisar campaña: Test Campaign',
    description: null,
    status: 'pending',
    priority: 'medium',
    dueDate: null,
    tags: ['campaign', 'sig:org-aaa-111:campaign-xyz-001:campaign_review_requested'],
    createdBy: 'user-uuid-real-001',
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

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function baseInput(overrides: Partial<EvaluateCampaignAutomationInput> = {}): EvaluateCampaignAutomationInput {
  return {
    organizationId: ORG_A,
    campaignId: CAMPAIGN_ID,
    campaignName: 'Test Campaign',
    clientId: CLIENT_ID,
    automationType: 'campaign_review_requested',
    actorUserId: ACTOR_ID,
    occurredAt: NOW,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<EvaluateCampaignAutomationDeps> = {}): EvaluateCampaignAutomationDeps {
  return {
    alertRepository: makeAlertRepo(),
    taskRepository: makeTaskRepo(),
    logger: makeLogger(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('evaluateCampaignAutomation', () => {
  describe('campaign_review_requested', () => {
    it('creates exactly one task, no alert', async () => {
      const taskRepo = makeTaskRepo();
      const alertRepo = makeAlertRepo();
      const result = await evaluateCampaignAutomation(
        baseInput({ automationType: 'campaign_review_requested' }),
        makeDeps({ taskRepository: taskRepo, alertRepository: alertRepo }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.taskCreated).toBe(true);
        expect(result.value.alertCreated).toBe(false);
      }
      expect(taskRepo.create).toHaveBeenCalledTimes(1);
      expect(alertRepo.upsertByAlertKey).not.toHaveBeenCalled();
      const createArgs = (taskRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
        title: string;
        description: string;
        tags: string[];
        organizationId: string;
        createdBy: string;
      };
      expect(createArgs.title).toContain('Test Campaign');
      expect(createArgs.tags).toContain('sig:org-aaa-111:campaign-xyz-001:campaign_review_requested');
      // Regression: bug detectado en smoke — createdBy DEBE ser el UUID real
      // del actor, nunca un string hardcodeado (tasks.created_by es un FK a
      // auth.users; un valor no-UUID hace que la creación falle en silencio).
      expect(createArgs.createdBy).toBe(ACTOR_ID);
      expect(createArgs.createdBy).not.toBe('campaign-automation-evaluator');
    });

    it('is idempotent: a second call with an already-active task skips creation', async () => {
      const taskRepo = makeTaskRepo({
        findActiveBySignatureTag: vi.fn().mockResolvedValue(ok([makeTask()])),
      });
      const result = await evaluateCampaignAutomation(
        baseInput({ automationType: 'campaign_review_requested' }),
        makeDeps({ taskRepository: taskRepo }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.taskCreated).toBe(false);
        expect(result.value.taskSkipped).toBe(true);
      }
      expect(taskRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('campaign_rejected', () => {
    it('creates a task including the rejection note', async () => {
      const taskRepo = makeTaskRepo();
      const result = await evaluateCampaignAutomation(
        baseInput({ automationType: 'campaign_rejected', rejectionNote: 'Presupuesto insuficiente' }),
        makeDeps({ taskRepository: taskRepo }),
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.value.taskCreated).toBe(true);
      const createArgs = (taskRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
        title: string;
        description: string;
        tags: string[];
        organizationId: string;
      };
      expect(createArgs.description).toContain('Presupuesto insuficiente');
      expect(createArgs.title).toContain('rechazada');
    });
  });

  describe('campaign_approved', () => {
    it('creates a follow-up task and never mentions external publishing as an action taken', async () => {
      const taskRepo = makeTaskRepo();
      const result = await evaluateCampaignAutomation(
        baseInput({ automationType: 'campaign_approved' }),
        makeDeps({ taskRepository: taskRepo }),
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.value.taskCreated).toBe(true);
      const createArgs = (taskRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
        title: string;
        description: string;
        tags: string[];
        organizationId: string;
      };
      // REGLA CRÍTICA: nunca debe implicar que se publicó en un proveedor externo.
      expect(createArgs.description.toLowerCase()).not.toMatch(/publicad[oa] en meta|publicad[oa] en google/);
      expect(createArgs.description).toContain('NO implica publicación automática');
    });
  });

  describe('campaign_ai_provider_failure', () => {
    it('creates an alert (no task) and dedupes via alert_key on repeated failures of the same kind', async () => {
      const taskRepo = makeTaskRepo();
      const alertRepo = makeAlertRepo({
        upsertByAlertKey: vi.fn().mockResolvedValue(ok({ alert: makeAlert(), created: true })),
      });
      const result = await evaluateCampaignAutomation(
        baseInput({
          automationType: 'campaign_ai_provider_failure',
          aiErrorKind: 'AI_TIMEOUT',
          safeErrorMessage: 'timeout',
        }),
        makeDeps({ taskRepository: taskRepo, alertRepository: alertRepo }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.alertCreated).toBe(true);
        expect(result.value.taskCreated).toBe(false);
      }
      expect(taskRepo.create).not.toHaveBeenCalled();
      const upsertArgs = (alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { alertKey: string };
      expect(upsertArgs.alertKey).toBe('campaign:org-aaa-111:campaign-xyz-001:ai-provider-failure:AI_TIMEOUT');
    });

    it('scopes the alert by client when campaignId is null (failure before campaign creation)', async () => {
      const alertRepo = makeAlertRepo();
      await evaluateCampaignAutomation(
        baseInput({
          campaignId: null,
          automationType: 'campaign_ai_provider_failure',
          aiErrorKind: 'AI_RATE_LIMITED',
        }),
        makeDeps({ alertRepository: alertRepo }),
      );
      const upsertArgs = (alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { alertKey: string };
      expect(upsertArgs.alertKey).toBe(`campaign:org-aaa-111:client:${CLIENT_ID}:ai-provider-failure:AI_RATE_LIMITED`);
    });

    it('never persists secrets/raw provider payloads in alert metadata', async () => {
      const alertRepo = makeAlertRepo();
      await evaluateCampaignAutomation(
        baseInput({
          automationType: 'campaign_ai_provider_failure',
          aiErrorKind: 'AI_EXTERNAL_SERVICE_ERROR',
          safeErrorMessage: 'safe reason',
        }),
        makeDeps({ alertRepository: alertRepo }),
      );
      const upsertArgs = (alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { alertKey: string };
      const serialized = JSON.stringify(upsertArgs);
      expect(serialized).not.toMatch(/sk-|api[_-]?key|Bearer /i);
    });
  });

  describe('multi-tenant isolation', () => {
    it('never leaks ORG_A campaign into an ORG_B evaluation call (signature/scoping is org-scoped)', async () => {
      const taskRepo = makeTaskRepo();
      await evaluateCampaignAutomation(
        baseInput({ organizationId: ORG_B, automationType: 'campaign_review_requested' }),
        makeDeps({ taskRepository: taskRepo }),
      );
      const createArgs = (taskRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
        title: string;
        description: string;
        tags: string[];
        organizationId: string;
      };
      expect(createArgs.organizationId).toBe(ORG_B);
      expect(createArgs.tags.some((t: string) => t.includes(ORG_A))).toBe(false);
    });
  });

  describe('best-effort semantics', () => {
    it('returns ok() even when task creation fails at the repository level', async () => {
      const taskRepo = makeTaskRepo({
        create: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'db down' })),
      });
      const result = await evaluateCampaignAutomation(
        baseInput({ automationType: 'campaign_review_requested' }),
        makeDeps({ taskRepository: taskRepo }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.taskCreated).toBe(false);
      }
    });

    it('returns ok() even when alert upsert fails at the repository level', async () => {
      const alertRepo = makeAlertRepo({
        upsertByAlertKey: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'db down' })),
      });
      const result = await evaluateCampaignAutomation(
        baseInput({ automationType: 'campaign_ai_provider_failure', aiErrorKind: 'AI_TIMEOUT' }),
        makeDeps({ alertRepository: alertRepo }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.alertCreated).toBe(false);
      }
    });
  });

  describe('actor propagation (smoke bug fix — real UUID, never a fabricated string)', () => {
    it('propagates the real actorUserId to TaskRepository.create for campaign_rejected', async () => {
      const taskRepo = makeTaskRepo();
      await evaluateCampaignAutomation(
        baseInput({ automationType: 'campaign_rejected', rejectionNote: 'nota', actorUserId: 'user-uuid-real-002' }),
        makeDeps({ taskRepository: taskRepo }),
      );
      const createArgs = (taskRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { createdBy: string };
      expect(createArgs.createdBy).toBe('user-uuid-real-002');
    });

    it('propagates the real actorUserId to TaskRepository.create for campaign_approved', async () => {
      const taskRepo = makeTaskRepo();
      await evaluateCampaignAutomation(
        baseInput({ automationType: 'campaign_approved', actorUserId: 'user-uuid-real-003' }),
        makeDeps({ taskRepository: taskRepo }),
      );
      const createArgs = (taskRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { createdBy: string };
      expect(createArgs.createdBy).toBe('user-uuid-real-003');
    });

    it('includes actorUserId in alert metadata for campaign_ai_provider_failure (observability, not persisted as a column)', async () => {
      const alertRepo = makeAlertRepo();
      await evaluateCampaignAutomation(
        baseInput({
          automationType: 'campaign_ai_provider_failure',
          aiErrorKind: 'AI_TIMEOUT',
          actorUserId: 'user-uuid-real-004',
        }),
        makeDeps({ alertRepository: alertRepo }),
      );
      const upsertArgs = (alertRepo.upsertByAlertKey as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
        metadata: Record<string, unknown>;
      };
      expect(upsertArgs.metadata['actorUserId']).toBe('user-uuid-real-004');
    });

    it('never creates a task with a missing/empty actorUserId — skips instead of fabricating one', async () => {
      const taskRepo = makeTaskRepo();
      const result = await evaluateCampaignAutomation(
        baseInput({ automationType: 'campaign_review_requested', actorUserId: '' }),
        makeDeps({ taskRepository: taskRepo }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.taskCreated).toBe(false);
        expect(result.value.taskSkipped).toBe(true);
      }
      expect(taskRepo.create).not.toHaveBeenCalled();
    });

    it('idempotency still holds with a real actor: second call for the same event does not duplicate the task', async () => {
      const taskRepo = makeTaskRepo();
      const deps = makeDeps({ taskRepository: taskRepo });
      const input = baseInput({ automationType: 'campaign_approved', actorUserId: 'user-uuid-real-005' });

      await evaluateCampaignAutomation(input, deps);
      // Simulate the dedupe lookup now finding the task created on the first call.
      (taskRepo.findActiveBySignatureTag as ReturnType<typeof vi.fn>).mockResolvedValueOnce(ok([makeTask()]));
      const second = await evaluateCampaignAutomation(input, deps);

      expect(taskRepo.create).toHaveBeenCalledTimes(1);
      if (second.success) {
        expect(second.value.taskSkipped).toBe(true);
      }
    });
  });
});
