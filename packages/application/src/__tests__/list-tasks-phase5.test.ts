/**
 * Tests para listTasks use case (Phase 5A — con organizationId y filtros).
 */

import { describe, it, expect } from 'vitest';
import { listTasks } from '../use-cases/tasks/list-tasks.use-case';
import type { ListTasksInput, ListTasksDeps } from '../use-cases/tasks/list-tasks.use-case';
import type { TaskRepository, TaskCountByStatus } from '@bop-agency/domain';
import type { Task, TaskFilter, TaskId } from '@bop-agency/domain';
import type { PaginatedResult, PaginationParams, Result } from '@bop-agency/shared';
import { paginate, ok } from '@bop-agency/shared';
import type { LoggerPort } from '../ports/logger.port';

// ─── Fake TaskRepository ──────────────────────────────────────────────────────

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1' as TaskId,
  organizationId: 'org-1' as unknown as Task['organizationId'],
  clientId: null,
  title: 'Revisar reporte',
  description: null,
  status: 'pending',
  priority: 'medium',
  dueDate: null,
  tags: [],
  createdBy: 'user-1',
  updatedBy: null,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  deletedAt: null,
  ...overrides,
});

class FakeTaskRepository implements TaskRepository {
  private tasks: Task[];

  constructor(tasks: Task[] = []) {
    this.tasks = tasks;
  }

  async findByOrganization(
    filter: TaskFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Task>> {
    let filtered = this.tasks.filter((t) => t.organizationId === filter.organizationId);
    if (!filter.includeDeleted) {
      filtered = filtered.filter((t) => t.deletedAt === null);
    }
    if (filter.status) {
      filtered = filtered.filter((t) => t.status === filter.status);
    }
    const total = filtered.length;
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 20;
    const sliced = filtered.slice((page - 1) * pageSize, page * pageSize);
    return paginate(sliced, total, pagination);
  }

  async findById(id: TaskId, _orgId: Task['organizationId']): Promise<Result<Task>> {
    const found = this.tasks.find((t) => t.id === id);
    if (!found) return { success: false, error: { code: 'NOT_FOUND', message: 'not found' } };
    return ok(found);
  }

  async findByClient(
    clientId: Task['clientId'],
    orgId: Task['organizationId'],
    _filters: unknown,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Task>> {
    const filtered = this.tasks.filter(
      (t) => t.clientId === clientId && t.organizationId === orgId,
    );
    return paginate(filtered, filtered.length, pagination);
  }

  async findUpcoming(_orgId: Task['organizationId'], _days: number): Promise<Result<Task[]>> {
    return ok([]);
  }

  async countByStatus(_orgId: Task['organizationId']): Promise<Result<TaskCountByStatus>> {
    return ok({ pending: 1, in_progress: 0, done: 0, cancelled: 0, blocked: 0 });
  }

  async updateStatus(
    id: TaskId,
    status: Task['status'],
    orgId: Task['organizationId'],
    updatedBy: string,
  ): Promise<Result<Task>> {
    const task = this.tasks.find((t) => t.id === id && t.organizationId === orgId);
    if (!task) return { success: false, error: { code: 'NOT_FOUND', message: 'not found' } };
    const updated = { ...task, status, updatedBy };
    return ok(updated);
  }

  async create(_input: unknown): Promise<Result<Task>> {
    return ok(makeTask());
  }

  async findActiveBySignatureTag(_tag: string, _orgId: Task['organizationId']): Promise<Result<Task[]>> {
    return ok([]);
  }
}

const silentLogger: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('listTasks (Phase 5A)', () => {
  const org1 = 'org-1' as unknown as Task['organizationId'];
  const org2 = 'org-2' as unknown as Task['organizationId'];

  const tasks = [
    makeTask({ id: 't1' as TaskId, organizationId: org1, status: 'pending' }),
    makeTask({ id: 't2' as TaskId, organizationId: org1, status: 'in_progress' }),
    makeTask({ id: 't3' as TaskId, organizationId: org1, status: 'done', deletedAt: null }),
    makeTask({
      id: 't4' as TaskId,
      organizationId: org1,
      status: 'pending',
      deletedAt: new Date(),
    }),
    makeTask({ id: 't5' as TaskId, organizationId: org2, status: 'pending' }),
  ];

  const makeDeps = (ts: Task[]): ListTasksDeps => ({
    taskRepository: new FakeTaskRepository(ts),
    logger: silentLogger,
  });

  it('filtra por organizationId — no devuelve tareas de otra org', async () => {
    const input: ListTasksInput = { organizationId: org1, pagination: {} };
    const result = await listTasks(input, makeDeps(tasks));
    expect(result.success).toBe(true);
    if (!result.success) return;
    // t4 está soft-deleted, t5 es org2 → 3 tareas
    expect(result.value.data).toHaveLength(3);
    expect(result.value.data.every((t) => t.organizationId === org1)).toBe(true);
  });

  it('excluye tareas soft-deleted por defecto', async () => {
    const input: ListTasksInput = { organizationId: org1, pagination: {} };
    const result = await listTasks(input, makeDeps(tasks));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.data.find((t) => t.id === 't4')).toBeUndefined();
  });

  it('filtra por status=pending', async () => {
    const input: ListTasksInput = { organizationId: org1, status: 'pending', pagination: {} };
    const result = await listTasks(input, makeDeps(tasks));
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Solo t1 (t4 está deleted)
    expect(result.value.data).toHaveLength(1);
    expect(result.value.data.at(0)?.id).toBe('t1');
  });

  it('devuelve ok([]) si no hay tareas para la organización', async () => {
    const input: ListTasksInput = {
      organizationId: 'org-inexistente' as unknown as Task['organizationId'],
      pagination: {},
    };
    const result = await listTasks(input, makeDeps(tasks));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.data).toHaveLength(0);
    expect(result.value.total).toBe(0);
  });

  it('aplica paginación', async () => {
    const input: ListTasksInput = { organizationId: org1, pagination: { page: 1, pageSize: 2 } };
    const result = await listTasks(input, makeDeps(tasks));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.data).toHaveLength(2);
    expect(result.value.total).toBe(3);
    expect(result.value.hasNextPage).toBe(true);
  });

  it('propaga error del repositorio como err()', async () => {
    class ThrowingRepo extends FakeTaskRepository {
      override async findByOrganization(): Promise<never> {
        throw new Error('DB timeout');
      }
    }
    const deps: ListTasksDeps = { taskRepository: new ThrowingRepo(), logger: silentLogger };
    const result = await listTasks({ organizationId: org1, pagination: {} }, deps);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});
