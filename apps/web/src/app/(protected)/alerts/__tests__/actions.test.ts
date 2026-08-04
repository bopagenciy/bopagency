/**
 * Alert Server Actions — tests unitarios
 *
 * Estrategia: mocks totales de dependencias externas para evitar
 * ejecución de server-only, next/cache, Supabase real y auth real.
 *
 * vi.mock() hoistado impide que @/lib/auth/server y @/lib/supabase/server
 * se carguen de verdad (lo que fallaría por 'server-only' no instalado).
 *
 * Cubre:
 * acknowledgeAlertAction:
 *   - payload válido → ok
 *   - Zod inválido → VALIDATION_ERROR
 *   - usuario no autenticado → UNAUTHENTICATED
 *   - alerta no encontrada → NOT_FOUND
 *   - transición inválida → CONFLICT
 *   - error de repositorio → INTERNAL_ERROR
 *   - revalidatePath solo en éxito
 *   - organizationId del cliente ignorado
 *
 * resolveAlertAction:
 *   - payload válido → ok
 *   - Zod inválido → VALIDATION_ERROR
 *   - rol insuficiente → FORBIDDEN
 *   - alerta ya resuelta → CONFLICT
 *   - not found → NOT_FOUND
 *   - error de repositorio → INTERNAL_ERROR
 *   - revalidatePath solo en éxito
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@bop-agency/shared';

// ─── Mocks (hoisted por vitest) ────────────────────────────────────────────────

const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

const mockRequireOrganization = vi.fn();
const mockRequireOrganizationRole = vi.fn();
vi.mock('@/lib/auth/server', () => ({
  requireOrganization: mockRequireOrganization,
  requireOrganizationRole: mockRequireOrganizationRole,
}));

const mockCreateServerSupabaseClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

const mockAcknowledgeAlert = vi.fn();
const mockResolveAlert = vi.fn();
vi.mock('@bop-agency/application', () => ({
  acknowledgeAlert: mockAcknowledgeAlert,
  resolveAlert: mockResolveAlert,
  updateTaskStatus: vi.fn(),
}));

const MockAlertRepository = vi.fn().mockImplementation(() => ({}));
vi.mock('@bop-agency/infrastructure', () => ({
  SupabaseAlertRepository: MockAlertRepository,
  SupabaseTaskRepository: vi.fn().mockImplementation(() => ({})),
  consoleLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { acknowledgeAlertAction, resolveAlertAction } from '../actions';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_ALERT_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const MOCK_CONTEXT = {
  user: { id: 'user-uuid-1', email: 'user@bop.com' },
  organization: { id: 'org-uuid-1', name: 'BopAgency' },
  membership: { role: 'operator', status: 'active' },
};

const MOCK_SUPABASE = {};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateServerSupabaseClient.mockResolvedValue(MOCK_SUPABASE);
  mockRequireOrganization.mockResolvedValue(MOCK_CONTEXT);
  mockRequireOrganizationRole.mockResolvedValue(MOCK_CONTEXT);
  mockAcknowledgeAlert.mockResolvedValue(ok(undefined));
  mockResolveAlert.mockResolvedValue(ok(undefined));
});

// ─── acknowledgeAlertAction ───────────────────────────────────────────────────

describe('acknowledgeAlertAction', () => {
  it('retorna ok:true con payload válido', async () => {
    const result = await acknowledgeAlertAction({ alertId: VALID_ALERT_UUID });
    expect(result.ok).toBe(true);
  });

  it('llama revalidatePath en éxito', async () => {
    await acknowledgeAlertAction({ alertId: VALID_ALERT_UUID });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/alerts');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('NO llama revalidatePath si el use case falla', async () => {
    mockAcknowledgeAlert.mockResolvedValue(
      err({ code: 'NOT_FOUND' as const, message: 'Alerta no encontrada' }),
    );
    await acknowledgeAlertAction({ alertId: VALID_ALERT_UUID });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  describe('validación Zod', () => {
    it('retorna VALIDATION_ERROR con alertId inválido (no UUID)', async () => {
      const result = await acknowledgeAlertAction({ alertId: 'not-a-uuid' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
      expect(mockAcknowledgeAlert).not.toHaveBeenCalled();
    });

    it('retorna VALIDATION_ERROR con payload vacío', async () => {
      const result = await acknowledgeAlertAction({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('retorna VALIDATION_ERROR con payload null', async () => {
      const result = await acknowledgeAlertAction(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('ignora organizationId enviado por el cliente (no está en schema)', async () => {
      const result = await acknowledgeAlertAction({
        alertId: VALID_ALERT_UUID,
        organizationId: 'attacker-org',
      });
      // Debe tener éxito y usar el orgId del servidor
      expect(result.ok).toBe(true);
      // El use case recibe orgId del contexto (mock), no del payload
      expect(mockAcknowledgeAlert).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-uuid-1' }),
        expect.anything(),
      );
    });
  });

  describe('autenticación', () => {
    it('retorna UNAUTHENTICATED si requireOrganization lanza', async () => {
      mockRequireOrganization.mockRejectedValue(new Error('redirect'));
      const result = await acknowledgeAlertAction({ alertId: VALID_ALERT_UUID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('UNAUTHENTICATED');
      }
    });
  });

  describe('errores del use case', () => {
    it('retorna NOT_FOUND si la alerta no existe', async () => {
      mockAcknowledgeAlert.mockResolvedValue(
        err({ code: 'NOT_FOUND' as const, message: 'Alerta no encontrada' }),
      );
      const result = await acknowledgeAlertAction({ alertId: VALID_ALERT_UUID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOT_FOUND');
      }
    });

    it('retorna CONFLICT si la transición es inválida', async () => {
      mockAcknowledgeAlert.mockResolvedValue(
        err({
          code: 'CONFLICT' as const,
          message: "No se puede reconocer una alerta en estado 'resolved'",
        }),
      );
      const result = await acknowledgeAlertAction({ alertId: VALID_ALERT_UUID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('CONFLICT');
      }
    });

    it('retorna INTERNAL_ERROR en error desconocido del use case', async () => {
      mockAcknowledgeAlert.mockResolvedValue(
        err({ code: 'INTERNAL_ERROR' as const, message: 'DB error' }),
      );
      const result = await acknowledgeAlertAction({ alertId: VALID_ALERT_UUID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});

// ─── resolveAlertAction ───────────────────────────────────────────────────────

describe('resolveAlertAction', () => {
  it('retorna ok:true con payload válido (operator)', async () => {
    const result = await resolveAlertAction({ alertId: VALID_ALERT_UUID });
    expect(result.ok).toBe(true);
  });

  it('llama revalidatePath en éxito', async () => {
    await resolveAlertAction({ alertId: VALID_ALERT_UUID });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/alerts');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('NO llama revalidatePath si el use case falla', async () => {
    mockResolveAlert.mockResolvedValue(
      err({ code: 'CONFLICT' as const, message: 'Alerta ya resuelta' }),
    );
    await resolveAlertAction({ alertId: VALID_ALERT_UUID });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  describe('validación Zod', () => {
    it('retorna VALIDATION_ERROR con alertId inválido', async () => {
      const result = await resolveAlertAction({ alertId: 'bad-id' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
      expect(mockResolveAlert).not.toHaveBeenCalled();
    });
  });

  describe('autorización', () => {
    it('retorna FORBIDDEN si requireOrganizationRole lanza (rol insuficiente)', async () => {
      mockRequireOrganizationRole.mockRejectedValue(new Error('redirect'));
      const result = await resolveAlertAction({ alertId: VALID_ALERT_UUID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('FORBIDDEN');
      }
    });

    it('verifica rol operator (llama requireOrganizationRole con "operator")', async () => {
      await resolveAlertAction({ alertId: VALID_ALERT_UUID });
      expect(mockRequireOrganizationRole).toHaveBeenCalledWith('operator');
    });
  });

  describe('errores del use case', () => {
    it('retorna CONFLICT si la alerta ya está resuelta', async () => {
      mockResolveAlert.mockResolvedValue(
        err({
          code: 'CONFLICT' as const,
          message: "No se puede resolver una alerta en estado 'resolved'",
        }),
      );
      const result = await resolveAlertAction({ alertId: VALID_ALERT_UUID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('CONFLICT');
      }
    });

    it('retorna NOT_FOUND si la alerta no existe', async () => {
      mockResolveAlert.mockResolvedValue(
        err({ code: 'NOT_FOUND' as const, message: 'Alerta no encontrada' }),
      );
      const result = await resolveAlertAction({ alertId: VALID_ALERT_UUID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOT_FOUND');
      }
    });

    it('retorna INTERNAL_ERROR en error desconocido', async () => {
      mockResolveAlert.mockResolvedValue(
        err({ code: 'INTERNAL_ERROR' as const, message: 'DB error' }),
      );
      const result = await resolveAlertAction({ alertId: VALID_ALERT_UUID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
