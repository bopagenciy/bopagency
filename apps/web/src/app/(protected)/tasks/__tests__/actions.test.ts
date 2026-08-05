/**
 * Task Server Actions — tests unitarios
 *
 * Estrategia: mocks totales de dependencias externas.
 * vi.mock() hoistado impide que server-only, next/cache, auth real y Supabase real se carguen.
 *
 * Cubre:
 * updateTaskStatusAction:
 *   - payload válido → ok
 *   - Zod inválido (no UUID) → VALIDATION_ERROR
 *   - Zod inválido (status desconocido) → VALIDATION_ERROR
 *   - rol insuficiente → FORBIDDEN
 *   - tarea no encontrada → NOT_FOUND
 *   - transición inválida → CONFLICT
 *   - error de repositorio → INTERNAL_ERROR
 *   - revalidatePath solo en éxito
 *   - organizationId del cliente ignorado
 *   - actorUserId viene de sesión (no del cliente)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@bop-agency/shared';

// ─── Mocks hoisted (vi.hoisted garantiza inicialización antes que vi.mock) ────

const {
  mockRevalidatePath,
  mockRequireOrganizationRole,
  mockCreateServerSupabaseClient,
  mockUpdateTaskStatus,
  MockTaskRepository,
} = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockRequireOrganizationRole: vi.fn(),
  mockCreateServerSupabaseClient: vi.fn(),
  mockUpdateTaskStatus: vi.fn(),
  MockTaskRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

vi.mock('@/lib/auth/server', () => ({
  requireOrganization: vi.fn(),
  requireOrganizationRole: mockRequireOrganizationRole,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock('@bop-agency/application', () => ({
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
  updateTaskStatus: mockUpdateTaskStatus,
}));

vi.mock('@bop-agency/infrastructure', () => ({
  SupabaseAlertRepository: vi.fn().mockImplementation(() => ({})),
  SupabaseTaskRepository: MockTaskRepository,
  consoleLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { updateTaskStatusAction } from '../actions';
import type { Task } from '@bop-agency/domain';
import type { TaskId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_TASK_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const MOCK_CONTEXT = {
  user: { id: 'user-uuid-1', email: 'user@bop.com' },
  organization: { id: 'org-uuid-1', name: 'BopAgency' },
  membership: { role: 'operator', status: 'active' },
};

const MOCK_TASK: Task = {
  id: VALID_TASK_UUID as TaskId,
  organizationId: 'org-uuid-1' as OrganizationId,
  clientId: null,
  title: 'Tarea de prueba',
  description: null,
  status: 'in_progress',
  priority: 'medium',
  dueDate: null,
  tags: [],
  createdBy: 'user-uuid-1',
  updatedBy: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateServerSupabaseClient.mockResolvedValue({});
  mockRequireOrganizationRole.mockResolvedValue(MOCK_CONTEXT);
  mockUpdateTaskStatus.mockResolvedValue(ok(MOCK_TASK));
});

// ─── updateTaskStatusAction ───────────────────────────────────────────────────

describe('updateTaskStatusAction', () => {
  it('retorna ok:true con payload válido (operator)', async () => {
    const result = await updateTaskStatusAction({ taskId: VALID_TASK_UUID, status: 'in_progress' });
    expect(result.ok).toBe(true);
  });

  it('llama revalidatePath en éxito', async () => {
    await updateTaskStatusAction({ taskId: VALID_TASK_UUID, status: 'in_progress' });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/tasks');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('NO llama revalidatePath si el use case falla', async () => {
    mockUpdateTaskStatus.mockResolvedValue(
      err({ code: 'CONFLICT' as const, message: 'Transición inválida' }),
    );
    await updateTaskStatusAction({ taskId: VALID_TASK_UUID, status: 'in_progress' });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  describe('validación Zod', () => {
    it('retorna VALIDATION_ERROR con taskId inválido (no UUID)', async () => {
      const result = await updateTaskStatusAction({ taskId: 'not-a-uuid', status: 'in_progress' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
      expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
    });

    it('retorna VALIDATION_ERROR con status desconocido', async () => {
      const result = await updateTaskStatusAction({
        taskId: VALID_TASK_UUID,
        status: 'invalid_status',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
      expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
    });

    it('retorna VALIDATION_ERROR con payload vacío', async () => {
      const result = await updateTaskStatusAction({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('ignora organizationId enviado por el cliente (no está en schema)', async () => {
      await updateTaskStatusAction({
        taskId: VALID_TASK_UUID,
        status: 'done',
        organizationId: 'attacker-org',
      });
      // Debe fallar solo por la transición, no por organizationId
      // El use case recibe orgId del contexto (mock), no del payload
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-uuid-1' }),
        expect.anything(),
      );
    });

    it('status "done" es un valor válido en Zod (la transición la valida el dominio)', async () => {
      await updateTaskStatusAction({ taskId: VALID_TASK_UUID, status: 'done' });
      // Zod acepta 'done' — el use case decide si la transición es válida
      expect(mockUpdateTaskStatus).toHaveBeenCalled();
    });
  });

  describe('autorización', () => {
    it('retorna FORBIDDEN si requireOrganizationRole lanza (rol insuficiente)', async () => {
      mockRequireOrganizationRole.mockRejectedValue(new Error('redirect'));
      const result = await updateTaskStatusAction({
        taskId: VALID_TASK_UUID,
        status: 'in_progress',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('FORBIDDEN');
      }
    });

    it('verifica rol operator (llama requireOrganizationRole con "operator")', async () => {
      await updateTaskStatusAction({ taskId: VALID_TASK_UUID, status: 'in_progress' });
      expect(mockRequireOrganizationRole).toHaveBeenCalledWith('operator');
    });

    it('actorUserId proviene de la sesión (user.id del context), no del payload', async () => {
      await updateTaskStatusAction({ taskId: VALID_TASK_UUID, status: 'in_progress' });
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: 'user-uuid-1' }),
        expect.anything(),
      );
    });
  });

  describe('errores del use case', () => {
    it('retorna NOT_FOUND si la tarea no existe', async () => {
      mockUpdateTaskStatus.mockResolvedValue(
        err({ code: 'NOT_FOUND' as const, message: 'Tarea no encontrada' }),
      );
      const result = await updateTaskStatusAction({
        taskId: VALID_TASK_UUID,
        status: 'in_progress',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOT_FOUND');
      }
    });

    it('retorna CONFLICT si la transición es inválida', async () => {
      mockUpdateTaskStatus.mockResolvedValue(
        err({ code: 'CONFLICT' as const, message: "No se puede cambiar de 'done' a 'pending'" }),
      );
      const result = await updateTaskStatusAction({ taskId: VALID_TASK_UUID, status: 'pending' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('CONFLICT');
      }
    });

    it('retorna INTERNAL_ERROR en error desconocido del use case', async () => {
      mockUpdateTaskStatus.mockResolvedValue(
        err({ code: 'INTERNAL_ERROR' as const, message: 'DB write failed' }),
      );
      const result = await updateTaskStatusAction({
        taskId: VALID_TASK_UUID,
        status: 'in_progress',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
