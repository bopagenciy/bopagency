import { describe, it, expect } from 'vitest';
import { rowToTask, type TaskRow } from '../task.mapper';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseTaskRow: TaskRow = {
  id: 'task-uuid-1',
  organization_id: 'org-uuid-1',
  client_id: 'client-uuid-1',
  title: 'Revisar reporte de mayo',
  description: 'Verificar métricas de la campaña de meta',
  status: 'pending',
  priority: 'medium',
  due_date: '2026-08-15T00:00:00.000Z',
  tags: ['reporte', 'meta'],
  created_by: 'user-uuid-1',
  updated_by: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  deleted_at: null,
};

// ─── rowToTask ────────────────────────────────────────────────────────────────

describe('rowToTask', () => {
  it('mapea todos los campos básicos correctamente', () => {
    const task = rowToTask(baseTaskRow);
    expect(task.id).toBe('task-uuid-1');
    expect(task.organizationId).toBe('org-uuid-1');
    expect(task.clientId).toBe('client-uuid-1');
    expect(task.title).toBe('Revisar reporte de mayo');
    expect(task.description).toBe('Verificar métricas de la campaña de meta');
    expect(task.status).toBe('pending');
    expect(task.priority).toBe('medium');
    expect(task.dueDate).toBeInstanceOf(Date);
    expect(task.tags).toEqual(['reporte', 'meta']);
    expect(task.createdBy).toBe('user-uuid-1');
    expect(task.updatedBy).toBeNull();
    expect(task.createdAt).toBeInstanceOf(Date);
    expect(task.updatedAt).toBeInstanceOf(Date);
    expect(task.deletedAt).toBeNull();
  });

  it('mapea client_id null a null', () => {
    const task = rowToTask({ ...baseTaskRow, client_id: null });
    expect(task.clientId).toBeNull();
  });

  it('mapea due_date null a null', () => {
    const task = rowToTask({ ...baseTaskRow, due_date: null });
    expect(task.dueDate).toBeNull();
  });

  it('mapea deleted_at a Date cuando está presente (soft-delete)', () => {
    const task = rowToTask({ ...baseTaskRow, deleted_at: '2026-07-20T00:00:00.000Z' });
    expect(task.deletedAt).toBeInstanceOf(Date);
  });

  it('mapea tags vacío correctamente', () => {
    const task = rowToTask({ ...baseTaskRow, tags: [] });
    expect(task.tags).toEqual([]);
  });

  it('mapea todos los status válidos del DB enum', () => {
    const statuses = ['pending', 'in_progress', 'done', 'cancelled', 'blocked'] as const;
    for (const status of statuses) {
      const task = rowToTask({ ...baseTaskRow, status });
      expect(task.status).toBe(status);
    }
  });

  it('mapea todos los priority válidos del DB enum', () => {
    const priorities = ['low', 'medium', 'high', 'urgent'] as const;
    for (const priority of priorities) {
      const task = rowToTask({ ...baseTaskRow, priority });
      expect(task.priority).toBe(priority);
    }
  });

  it('lanza error si status no es válido (rechaza completed del enum viejo)', () => {
    expect(() => rowToTask({ ...baseTaskRow, status: 'completed' })).toThrow(
      'status "completed" no es válido',
    );
  });

  it('lanza error si status "on_hold" no existe en DB', () => {
    expect(() => rowToTask({ ...baseTaskRow, status: 'on_hold' })).toThrow(
      'status "on_hold" no es válido',
    );
  });

  it('lanza error si priority no es válida', () => {
    expect(() => rowToTask({ ...baseTaskRow, priority: 'critical' })).toThrow(
      'priority "critical" no es válido',
    );
  });

  it('lanza error si created_at no es fecha válida', () => {
    expect(() => rowToTask({ ...baseTaskRow, created_at: 'invalid-date' })).toThrow(
      '"created_at" no es una fecha válida',
    );
  });

  it('description null se mapea a null', () => {
    const task = rowToTask({ ...baseTaskRow, description: null });
    expect(task.description).toBeNull();
  });

  it('tags no-array se normaliza a []', () => {
    // En caso de corrupción de datos, se devuelve array vacío
    const task = rowToTask({ ...baseTaskRow, tags: null as unknown as string[] });
    expect(task.tags).toEqual([]);
  });
});
