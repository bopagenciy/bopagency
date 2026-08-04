import { describe, it, expect } from 'vitest';
import { canTransitionTask, getTaskNextStates, isTaskOverdue } from '../entities/task';
import type { Task, TaskId } from '../entities/task';

describe('canTransitionTask', () => {
  // Transiciones válidas
  it('pending → in_progress: válido', () => {
    expect(canTransitionTask('pending', 'in_progress')).toBe(true);
  });

  it('pending → cancelled: válido', () => {
    expect(canTransitionTask('pending', 'cancelled')).toBe(true);
  });

  it('in_progress → done: válido', () => {
    expect(canTransitionTask('in_progress', 'done')).toBe(true);
  });

  it('in_progress → blocked: válido', () => {
    expect(canTransitionTask('in_progress', 'blocked')).toBe(true);
  });

  it('in_progress → cancelled: válido', () => {
    expect(canTransitionTask('in_progress', 'cancelled')).toBe(true);
  });

  it('blocked → in_progress: válido (desbloquear)', () => {
    expect(canTransitionTask('blocked', 'in_progress')).toBe(true);
  });

  it('blocked → cancelled: válido', () => {
    expect(canTransitionTask('blocked', 'cancelled')).toBe(true);
  });

  // Transiciones inválidas
  it('done → in_progress: inválido (estado final)', () => {
    expect(canTransitionTask('done', 'in_progress')).toBe(false);
  });

  it('done → pending: inválido (estado final)', () => {
    expect(canTransitionTask('done', 'pending')).toBe(false);
  });

  it('cancelled → pending: inválido (estado final)', () => {
    expect(canTransitionTask('cancelled', 'pending')).toBe(false);
  });

  it('cancelled → in_progress: inválido (estado final)', () => {
    expect(canTransitionTask('cancelled', 'in_progress')).toBe(false);
  });

  it('pending → done: inválido (debe pasar por in_progress)', () => {
    expect(canTransitionTask('pending', 'done')).toBe(false);
  });

  it('pending → blocked: inválido', () => {
    expect(canTransitionTask('pending', 'blocked')).toBe(false);
  });
});

describe('getTaskNextStates', () => {
  it('pending → [in_progress, cancelled]', () => {
    const next = getTaskNextStates('pending');
    expect(next).toContain('in_progress');
    expect(next).toContain('cancelled');
    expect(next).toHaveLength(2);
  });

  it('in_progress → [done, cancelled, blocked]', () => {
    const next = getTaskNextStates('in_progress');
    expect(next).toContain('done');
    expect(next).toContain('cancelled');
    expect(next).toContain('blocked');
    expect(next).toHaveLength(3);
  });

  it('done → [] (estado final)', () => {
    expect(getTaskNextStates('done')).toEqual([]);
  });

  it('cancelled → [] (estado final)', () => {
    expect(getTaskNextStates('cancelled')).toEqual([]);
  });

  it('blocked → [in_progress, cancelled]', () => {
    const next = getTaskNextStates('blocked');
    expect(next).toContain('in_progress');
    expect(next).toContain('cancelled');
    expect(next).toHaveLength(2);
  });
});

// ─── isTaskOverdue ─────────────────────────────────────────────────────────────

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 'task-1' as TaskId,
  organizationId: 'org-1' as unknown as Task['organizationId'],
  clientId: null,
  title: 'Test',
  description: null,
  status: 'pending',
  priority: 'medium',
  dueDate: null,
  tags: [],
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  deletedAt: null,
  ...overrides,
});

describe('isTaskOverdue', () => {
  const now = new Date('2026-08-01');

  it('tarea sin dueDate → no vencida', () => {
    expect(isTaskOverdue(makeTask({ dueDate: null }), now)).toBe(false);
  });

  it('tarea con dueDate futura → no vencida', () => {
    expect(isTaskOverdue(makeTask({ dueDate: new Date('2026-09-01') }), now)).toBe(false);
  });

  it('tarea con dueDate pasada y status pending → vencida', () => {
    expect(
      isTaskOverdue(makeTask({ dueDate: new Date('2026-07-01'), status: 'pending' }), now),
    ).toBe(true);
  });

  it('tarea con dueDate pasada y status in_progress → vencida', () => {
    expect(
      isTaskOverdue(makeTask({ dueDate: new Date('2026-07-01'), status: 'in_progress' }), now),
    ).toBe(true);
  });

  it('tarea con dueDate pasada y status done → NO vencida (ya terminó)', () => {
    expect(isTaskOverdue(makeTask({ dueDate: new Date('2026-07-01'), status: 'done' }), now)).toBe(
      false,
    );
  });

  it('tarea con dueDate pasada y status cancelled → NO vencida', () => {
    expect(
      isTaskOverdue(makeTask({ dueDate: new Date('2026-07-01'), status: 'cancelled' }), now),
    ).toBe(false);
  });
});
