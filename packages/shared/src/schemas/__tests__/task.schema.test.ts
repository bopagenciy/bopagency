/**
 * Task schemas — tests unitarios
 */
import { describe, it, expect } from 'vitest';
import { taskStatusSchema, updateTaskStatusSchema } from '../task.schema';

const VALID_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

describe('taskStatusSchema', () => {
  it.each(['pending', 'in_progress', 'done', 'cancelled', 'blocked'])(
    'acepta status válido: %s',
    (status) => {
      const result = taskStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    },
  );

  it('rechaza status inválido', () => {
    const result = taskStatusSchema.safeParse('completed');
    expect(result.success).toBe(false);
  });

  it('rechaza status vacío', () => {
    const result = taskStatusSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('updateTaskStatusSchema', () => {
  it('acepta payload válido', () => {
    const result = updateTaskStatusSchema.safeParse({
      taskId: VALID_UUID,
      status: 'in_progress',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskId).toBe(VALID_UUID);
      expect(result.data.status).toBe('in_progress');
    }
  });

  it('rechaza taskId no UUID', () => {
    const result = updateTaskStatusSchema.safeParse({ taskId: 'not-uuid', status: 'pending' });
    expect(result.success).toBe(false);
  });

  it('rechaza status inválido', () => {
    const result = updateTaskStatusSchema.safeParse({ taskId: VALID_UUID, status: 'on_hold' });
    expect(result.success).toBe(false);
  });

  it('rechaza taskId ausente', () => {
    const result = updateTaskStatusSchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });

  it('rechaza status ausente', () => {
    const result = updateTaskStatusSchema.safeParse({ taskId: VALID_UUID });
    expect(result.success).toBe(false);
  });

  it('no incluye organizationId en el schema (seguridad)', () => {
    const result = updateTaskStatusSchema.safeParse({
      taskId: VALID_UUID,
      status: 'done',
    });
    if (result.success) {
      expect(Object.keys(result.data)).not.toContain('organizationId');
    }
  });
});
