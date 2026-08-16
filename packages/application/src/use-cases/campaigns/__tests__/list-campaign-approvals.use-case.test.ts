/**
 * listCampaignApprovals use case — tests unitarios (Phase 7C).
 *
 * Cubre: lista el audit trail correctamente, aísla por organización (carga
 * la campaña primero para producir NOT_FOUND claro si es inexistente/de
 * otra organización), campaignId inválido, lista vacía, y propagación de
 * errores del repositorio de aprobaciones.
 */

import { describe, it, expect, vi } from 'vitest';
import { listCampaignApprovals } from '../list-campaign-approvals.use-case';
import type { ListCampaignApprovalsInput } from '../list-campaign-approvals.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignApproval,
  CampaignApprovalId,
  CampaignApprovalRepository,
  CampaignId,
  CampaignRepository,
  OrganizationId,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

const ORG_ID = 'org-uuid-1' as OrganizationId;
const CAMPAIGN_ID = 'campaign-uuid-1' as CampaignId;
const ACTOR_ID = 'user-uuid-1';

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    organizationId: ORG_ID,
    clientId: 'client_1' as Campaign['clientId'],
    name: 'Campaña de Verano',
    platform: 'meta_ads',
    objective: 'lead_generation',
    status: 'approved',
    brief: null,
    budget: 5000000,
    currency: 'COP',
    startDate: null,
    endDate: null,
    generatedContent: null,
    metadata: {},
    createdBy: 'user_1',
    updatedBy: null,
    submittedForReviewAt: new Date('2026-08-02'),
    approvedAt: new Date('2026-08-03'),
    rejectedAt: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-03'),
    ...overrides,
  };
}

function makeApproval(overrides: Partial<CampaignApproval> = {}): CampaignApproval {
  return {
    id: 'approval-uuid-1' as CampaignApprovalId,
    organizationId: ORG_ID,
    campaignId: CAMPAIGN_ID,
    action: 'approved',
    note: null,
    actorUserId: ACTOR_ID,
    metadata: {},
    createdAt: new Date('2026-08-03'),
    ...overrides,
  };
}

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeCampaignRepo(overrides: Partial<CampaignRepository> = {}): CampaignRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeCampaign())),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    ...overrides,
  };
}

function makeApprovalRepo(
  overrides: Partial<CampaignApprovalRepository> = {},
): CampaignApprovalRepository {
  return {
    findByCampaignId: vi.fn().mockResolvedValue(ok([makeApproval()])),
    findLatestByCampaignId: vi.fn(),
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<ListCampaignApprovalsInput> = {},
): ListCampaignApprovalsInput {
  return { campaignId: CAMPAIGN_ID, organizationId: ORG_ID, ...overrides };
}

describe('listCampaignApprovals use case', () => {
  it('lista el audit trail de la campaña', async () => {
    const campaignRepository = makeCampaignRepo();
    const campaignApprovalRepository = makeApprovalRepo();

    const result = await listCampaignApprovals(makeInput(), {
      campaignRepository,
      campaignApprovalRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.action).toBe('approved');
    }
    expect(campaignApprovalRepository.findByCampaignId).toHaveBeenCalledWith(CAMPAIGN_ID, ORG_ID);
  });

  it('retorna lista vacía si la campaña aún no tiene decisiones', async () => {
    const campaignRepository = makeCampaignRepo();
    const campaignApprovalRepository = makeApprovalRepo({
      findByCampaignId: vi.fn().mockResolvedValue(ok([])),
    });

    const result = await listCampaignApprovals(makeInput(), {
      campaignRepository,
      campaignApprovalRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual([]);
    }
  });

  it('retorna NOT_FOUND si la campaña no existe / es de otra organización, sin consultar approvals', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'Campaign not found' })),
    });
    const campaignApprovalRepository = makeApprovalRepo();

    const result = await listCampaignApprovals(makeInput(), {
      campaignRepository,
      campaignApprovalRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(campaignApprovalRepository.findByCampaignId).not.toHaveBeenCalled();
  });

  it('rechaza campaignId vacío con VALIDATION_ERROR', async () => {
    const campaignRepository = makeCampaignRepo();
    const campaignApprovalRepository = makeApprovalRepo();

    const result = await listCampaignApprovals(makeInput({ campaignId: '' }), {
      campaignRepository,
      campaignApprovalRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(campaignRepository.findById).not.toHaveBeenCalled();
  });

  it('propaga error del repositorio de approvals', async () => {
    const campaignRepository = makeCampaignRepo();
    const campaignApprovalRepository = makeApprovalRepo({
      findByCampaignId: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'db error' })),
    });

    const result = await listCampaignApprovals(makeInput(), {
      campaignRepository,
      campaignApprovalRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});
