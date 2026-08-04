/**
 * updateTaskStatus use case — tests unitarios
 *
 * Cubre:
 * - pending → in_progress (válido)
 * - pending → cancelled (válido)
 * - in_progress → done (válido)
 * - in_progress → blocked (válido)
 * - blocked → in_progress (válido)
 * - Idempotencia: misma transición retorna tarea actual sin error
 * - Transición inválida: done → any (estado final)
 * - Transición inválida: cancelled → any (estado final)
 * - Transición inválida: pending → done (salto prohibido)
 * - Entidad no encontrada (cross-tenant)
 * - Error del repositorio en updateStatus
 * - actorUserId se pasa al repositorio
 */

import { describe, it, expect, vi } from 'vitest';
import { updateTaskStatus } from '../update-task-status.use-case';
import type { UpdateTaskStatusInput } from '../update-task-status.use-case';
import type { TaskRepository } from '@bop-agency/domain';
import type { TaskId, Task } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';
import type { TaskStatus } from '@bop-agency/shared';
import { ok, err } from '@bop-agency/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1' as OrganizationId;
const TASK_ID = 'task-uuid-1' as TaskId;
const ACTOR_ID = 'user-uuid-1';

function makeTask(status: TaskStatus): Task {
  return {
    id: TASK_ID,
    organizationId: ORG_ID,
    clientId: null,
    title: 'Tarea de prueba',
    description: null,
    status,
    priority: 'medium',
    dueDate: null,
    tags: [],
    createdBy: ACTOR_ID,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

function makeInput(overrides: Partial<UpdateTaskStatusInput> = {}): UpdateTaskStatusInput {
  return {
    taskId: TASK_ID,
    status: 'in_progress',
    organizationId: ORG_ID,
    actorUserId: ACTOR_ID,
    ...overrides,
  };
}

function makeLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeRepo(
  currentStatus: TaskStatus = 'pending',
  overrides: Partial<TaskRepository> = {},
): TaskRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeTask(currentStatus))),
    findByOrganization: vi.fn(),
    findByClient: vi.fn(),
    findUpcoming: vi.fn(),
    countByStatus: vi.fn(),
    updateStatus: vi
      .fn()
      .mockImplementation((_id, status, _orgId, _updatedBy) =>
        Promise.resolve(ok(makeTask(status))),
      ),
    ...overrides,
  } as unknown as TaskRepository;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('updateTaskStatus use case', () => {
  describe('transiciones válidas', () => {
    it.each([
      ['pending', 'in_progress'],
      ['pending', 'cancelled'],
      ['in_progress', 'done'],
      ['in_progress', 'cancelled'],
      ['in_progress', 'blocked'],
      ['blocked', 'in_progress'],
      ['blocked', 'cancelled'],
    ] as [TaskStatus, TaskStatus][])('%s → %s retorna tarea actualizada', async (from, to) => {
      const repo = makeRepo(from);
      const result = await updateTaskStatus(makeInput({ status: to }), {
        taskRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.status).toBe(to);
      }
      expect(repo.updateStatus).toHaveBeenCalledWith(TASK_ID, to, ORG_ID, ACTOR_ID);
    });

    it('pasa actorUserId al repositorio para trazabilidad', async () => {
      const repo = makeRepo('pending');
      await updateTaskStatus(makeInput(), { taskRepository: repo, logger: makeLogger() });

      expect(repo.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        ACTOR_ID,
      );
    });
  });

  describe('idempotencia', () => {
    it('retorna la tarea actual si el estado ya es el deseado (sin llamar updateStatus)', async () => {
      const repo = makeRepo('in_progress');
      const result = await updateTaskStatus(makeInput({ status: 'in_progress' }), {
        taskRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(true);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('transiciones inválidas', () => {
    it.each([
      ['done', 'pending'],
      ['done', 'in_progress'],
      ['done', 'cancelled'],
      ['cancelled', 'pending'],
      ['cancelled', 'in_progress'],
      ['cancelled', 'done'],
    ] as [TaskStatus, TaskStatus][])(
      '%s → %s (estado final) retorna CONFLICT',
      async (from, to) => {
        const repo = makeRepo(from);
        const result = await updateTaskStatus(makeInput({ status: to }), {
          taskRepository: repo,
          logger: makeLogger(),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONFLICT');
          expect(result.error.message).toContain(from);
        }
        expect(repo.updateStatus).not.toHaveBeenCalled();
      },
    );

    it('pending → done (salto no permitido) retorna CONFLICT', async () => {
      const repo = makeRepo('pending');
      const result = await updateTaskStatus(makeInput({ status: 'done' }), {
        taskRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT');
      }
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('pending → blocked (salto no permitido) retorna CONFLICT', async () => {
      const repo = makeRepo('pending');
      const result = await updateTaskStatus(makeInput({ status: 'blocked' }), {
        taskRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('entidad no encontrada', () => {
    it('retorna NOT_FOUND si la tarea no existe en la organización', async () => {
      const repo = makeRepo('pending', {
        findById: vi
          .fn()
          .mockResolvedValue(err({ code: 'NOT_FOUND' as const, message: 'Tarea no encontrada' })),
      });
      const result = await updateTaskStatus(makeInput(), {
        taskRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('cross-tenant: tarea de otra organización → NOT_FOUND', async () => {
      const repo = makeRepo('pending', {
        findById: vi
          .fn()
          .mockResolvedValue(
            err({ code: 'NOT_FOUND' as const, message: 'Tarea no encontrada en la organización' }),
          ),
      });
      const result = await updateTaskStatus(
        makeInput({ organizationId: 'other-org' as OrganizationId }),
        { taskRepository: repo, logger: makeLogger() },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('error del repositorio', () => {
    it('propaga error de repositorio en updateStatus', async () => {
      const logger = makeLogger();
      const repo = makeRepo('pending', {
        updateStatus: vi
          .fn()
          .mockResolvedValue(err({ code: 'INTERNAL_ERROR' as const, message: 'DB write failed' })),
      });
      const result = await updateTaskStatus(makeInput(), { taskRepository: repo, logger });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
