/**
 * resolveAlert use case — tests unitarios
 *
 * Cubre:
 * - Resolver alerta activa
 * - Resolver alerta reconocida
 * - Resolver alerta snoozed
 * - Rechazar alerta ya resuelta (estado final)
 * - Entidad no encontrada (cross-tenant)
 * - Error del repositorio en resolve
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveAlert } from '../resolve-alert.use-case';
import type { ResolveAlertInput } from '../resolve-alert.use-case';
import type { AlertRepository } from '@bop-agency/domain';
import type { AlertId, Alert } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';
import { ok, err } from '@bop-agency/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1' as OrganizationId;
const ALERT_ID = 'alert-uuid-1' as AlertId;
const ACTOR_ID = 'user-uuid-1';

function makeAlert(status: Alert['status']): Alert {
  return {
    id: ALERT_ID,
    organizationId: ORG_ID,
    clientId: null,
    alertKey: 'key-1',
    alertType: 'budget_exceeded',
    platform: null,
    accountId: null,
    severity: 'critical',
    status,
    title: 'Presupuesto excedido',
    description: null,
    metadata: {},
    detectedAt: new Date(),
    acknowledgedAt: status !== 'active' ? new Date() : null,
    acknowledgedBy: status !== 'active' ? ACTOR_ID : null,
    snoozedUntil: status === 'snoozed' ? new Date() : null,
    resolvedAt: status === 'resolved' ? new Date() : null,
    resolvedBy: status === 'resolved' ? ACTOR_ID : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeInput(overrides: Partial<ResolveAlertInput> = {}): ResolveAlertInput {
  return {
    alertId: ALERT_ID,
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
  statusOrOverrides: Alert['status'] | Partial<AlertRepository> = 'active',
): AlertRepository {
  const status = typeof statusOrOverrides === 'string' ? statusOrOverrides : 'active';
  const overrides = typeof statusOrOverrides === 'object' ? statusOrOverrides : {};
  return {
    findById: vi.fn().mockResolvedValue(ok(makeAlert(status))),
    findByOrganization: vi.fn(),
    findActiveByOrganization: vi.fn(),
    findByClient: vi.fn(),
    countBySeverity: vi.fn(),
    acknowledge: vi.fn(),
    resolve: vi.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  } as unknown as AlertRepository;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('resolveAlert use case', () => {
  describe('éxito', () => {
    it('resuelve una alerta activa', async () => {
      const repo = makeRepo('active');
      const result = await resolveAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(true);
      expect(repo.resolve).toHaveBeenCalledWith(ALERT_ID, ORG_ID);
    });

    it('resuelve una alerta reconocida (acknowledged → resolved)', async () => {
      const repo = makeRepo('acknowledged');
      const result = await resolveAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(true);
      expect(repo.resolve).toHaveBeenCalledWith(ALERT_ID, ORG_ID);
    });

    it('resuelve una alerta snoozed (snoozed → resolved)', async () => {
      const repo = makeRepo('snoozed');
      const result = await resolveAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(true);
      expect(repo.resolve).toHaveBeenCalledWith(ALERT_ID, ORG_ID);
    });
  });

  describe('transición inválida', () => {
    it('rechaza resolver una alerta ya resuelta (estado final)', async () => {
      const repo = makeRepo('resolved');
      const result = await resolveAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.message).toContain('resolved');
      }
      expect(repo.resolve).not.toHaveBeenCalled();
    });
  });

  describe('entidad no encontrada', () => {
    it('retorna NOT_FOUND si la alerta no existe en la organización', async () => {
      const repo = makeRepo({
        findById: vi
          .fn()
          .mockResolvedValue(err({ code: 'NOT_FOUND' as const, message: 'Alerta no encontrada' })),
        resolve: vi.fn(),
      });
      const result = await resolveAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
      expect(repo.resolve).not.toHaveBeenCalled();
    });

    it('cross-tenant: alerta de otra organización → NOT_FOUND', async () => {
      const repo = makeRepo({
        findById: vi
          .fn()
          .mockResolvedValue(
            err({ code: 'NOT_FOUND' as const, message: 'Alerta no encontrada en la organización' }),
          ),
        resolve: vi.fn(),
      });
      const result = await resolveAlert(
        makeInput({ organizationId: 'other-org' as OrganizationId }),
        { alertRepository: repo, logger: makeLogger() },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('error del repositorio', () => {
    it('propaga error de repositorio en resolve', async () => {
      const logger = makeLogger();
      const repo = makeRepo({
        findById: vi.fn().mockResolvedValue(ok(makeAlert('active'))),
        resolve: vi
          .fn()
          .mockResolvedValue(err({ code: 'INTERNAL_ERROR' as const, message: 'RPC failed' })),
      });
      const result = await resolveAlert(makeInput(), { alertRepository: repo, logger });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
