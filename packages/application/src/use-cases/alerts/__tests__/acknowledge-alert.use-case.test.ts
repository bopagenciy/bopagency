/**
 * acknowledgeAlert use case — tests unitarios
 *
 * Cubre:
 * - Reconocer alerta activa correctamente
 * - Rechazar transición inválida (alerta resuelta)
 * - Rechazar transición inválida (alerta ya reconocida)
 * - Entidad no encontrada (cross-tenant)
 * - Error del repositorio en acknowledge
 * - Error del repositorio en findById
 */

import { describe, it, expect, vi } from 'vitest';
import { acknowledgeAlert } from '../acknowledge-alert.use-case';
import type { AcknowledgeAlertInput } from '../acknowledge-alert.use-case';
import type { AlertRepository } from '@bop-agency/domain';
import type { AlertId, Alert } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';
import { ok, err } from '@bop-agency/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1' as OrganizationId;
const ALERT_ID = 'alert-uuid-1' as AlertId;
const ACTOR_ID = 'user-uuid-1';

function makeActiveAlert(): Alert {
  return {
    id: ALERT_ID,
    organizationId: ORG_ID,
    clientId: null,
    alertKey: 'key-1',
    alertType: 'ctr_drop',
    platform: null,
    accountId: null,
    severity: 'warning',
    status: 'active',
    title: 'CTR bajo',
    description: null,
    metadata: {},
    detectedAt: new Date(),
    acknowledgedAt: null,
    acknowledgedBy: null,
    snoozedUntil: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeAcknowledgedAlert(): Alert {
  return {
    ...makeActiveAlert(),
    status: 'acknowledged',
    acknowledgedAt: new Date(),
    acknowledgedBy: ACTOR_ID,
  };
}

function makeResolvedAlert(): Alert {
  return { ...makeActiveAlert(), status: 'resolved', resolvedAt: new Date(), resolvedBy: ACTOR_ID };
}

function makeInput(overrides: Partial<AcknowledgeAlertInput> = {}): AcknowledgeAlertInput {
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

function makeRepo(partial: Partial<AlertRepository> = {}): AlertRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeActiveAlert())),
    findByOrganization: vi.fn(),
    findActiveByOrganization: vi.fn(),
    findByClient: vi.fn(),
    countBySeverity: vi.fn(),
    acknowledge: vi.fn().mockResolvedValue(ok(undefined)),
    resolve: vi.fn(),
    ...partial,
  } as unknown as AlertRepository;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('acknowledgeAlert use case', () => {
  describe('éxito', () => {
    it('reconoce una alerta activa', async () => {
      const repo = makeRepo();
      const result = await acknowledgeAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(true);
      expect(repo.findById).toHaveBeenCalledWith(ALERT_ID, ORG_ID);
      expect(repo.acknowledge).toHaveBeenCalledWith(ALERT_ID, ORG_ID);
    });

    it('pasa el actorUserId al logger (no al repositorio directamente)', async () => {
      const logger = makeLogger();
      const repo = makeRepo();
      await acknowledgeAlert(makeInput(), { alertRepository: repo, logger });

      expect(logger.info).toHaveBeenCalledWith(
        'acknowledgeAlert: ok',
        expect.objectContaining({ actorUserId: ACTOR_ID }),
      );
    });
  });

  describe('transición inválida', () => {
    it('rechaza reconocer una alerta ya resuelta', async () => {
      const repo = makeRepo({ findById: vi.fn().mockResolvedValue(ok(makeResolvedAlert())) });
      const result = await acknowledgeAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.message).toContain('resolved');
      }
      expect(repo.acknowledge).not.toHaveBeenCalled();
    });

    it('rechaza reconocer una alerta ya reconocida', async () => {
      const repo = makeRepo({
        findById: vi.fn().mockResolvedValue(ok(makeAcknowledgedAlert())),
      });
      const result = await acknowledgeAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT');
      }
      expect(repo.acknowledge).not.toHaveBeenCalled();
    });
  });

  describe('entidad no encontrada', () => {
    it('retorna NOT_FOUND si la alerta no existe en la organización', async () => {
      const repo = makeRepo({
        findById: vi
          .fn()
          .mockResolvedValue(err({ code: 'NOT_FOUND' as const, message: 'Alerta no encontrada' })),
      });
      const result = await acknowledgeAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
      expect(repo.acknowledge).not.toHaveBeenCalled();
    });

    it('cross-tenant: alerta de otra organización → NOT_FOUND', async () => {
      const otherOrgId = 'other-org-uuid' as OrganizationId;
      const repo = makeRepo({
        findById: vi
          .fn()
          .mockResolvedValue(
            err({ code: 'NOT_FOUND' as const, message: 'Alerta no encontrada en la organización' }),
          ),
      });
      const result = await acknowledgeAlert(makeInput({ organizationId: otherOrgId }), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('error del repositorio', () => {
    it('propaga error de repositorio en acknowledge', async () => {
      const repo = makeRepo({
        acknowledge: vi
          .fn()
          .mockResolvedValue(err({ code: 'INTERNAL_ERROR' as const, message: 'DB error' })),
      });
      const logger = makeLogger();
      const result = await acknowledgeAlert(makeInput(), { alertRepository: repo, logger });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
      expect(logger.error).toHaveBeenCalled();
    });

    it('propaga error de repositorio en findById', async () => {
      const repo = makeRepo({
        findById: vi
          .fn()
          .mockResolvedValue(err({ code: 'INTERNAL_ERROR' as const, message: 'DB error' })),
      });
      const result = await acknowledgeAlert(makeInput(), {
        alertRepository: repo,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
