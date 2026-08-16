/**
 * submitCampaignForReview use case — tests unitarios (Phase 7C).
 *
 * Cubre: draft → review OK, roles permitidos (operator/strategist/admin/
 * owner) vs viewer denegado, actor no-miembro, campaña inexistente/otra
 * organización, transición inválida (status actual ≠ draft), payload de
 * update no toca approvedAt/rejectedAt, campaignId inválido, y propagación
 * de errores del repositorio.
 */

import { describe, it, expect, vi } from 'vitest';
import { submitCampaignForReview } from '../submit-campaign-for-review.use-case';
import type { SubmitCampaignForReviewInput } from '../submit-campaign-for-review.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  OrganizationId,
  OrganizationMember,
  OrganizationRepository,
  OrganizationRole,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

const ORG_ID = 'org-uuid-1' as OrganizationId;
const OTHER_ORG_ID = 'org-uuid-2' as OrganizationId;
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
    status: 'draft',
    brief: null,
    budget: 5000000,
    currency: 'COP',
    startDate: null,
    endDate: null,
    generatedContent: null,
    metadata: {},
    createdBy: 'user_1',
    updatedBy: null,
    submittedForReviewAt: null,
    approvedAt: null,
    rejectedAt: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

function makeMember(
  role: OrganizationRole,
  overrides: Partial<OrganizationMember> = {},
): OrganizationMember {
  return {
    id: 'member-1',
    organizationId: ORG_ID,
    userId: ACTOR_ID,
    role,
    status: 'active',
    invitedBy: null,
    joinedAt: new Date('2026-01-01'),
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
    update: vi.fn().mockResolvedValue(ok(makeCampaign({ status: 'review' }))),
    approve: vi.fn(),
    reject: vi.fn(),
    ...overrides,
  };
}

function makeOrgRepo(overrides: Partial<OrganizationRepository> = {}): OrganizationRepository {
  return {
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMembers: vi.fn(),
    findMember: vi.fn().mockResolvedValue(ok(makeMember('operator'))),
    addMember: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    findInvitations: vi.fn(),
    findInvitationByToken: vi.fn(),
    createInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
    cancelInvitation: vi.fn(),
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<SubmitCampaignForReviewInput> = {},
): SubmitCampaignForReviewInput {
  return { campaignId: CAMPAIGN_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID, ...overrides };
}

describe('submitCampaignForReview use case', () => {
  it('transiciona draft → review correctamente (operator)', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();

    const result = await submitCampaignForReview(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(true);
    expect(campaignRepository.update).toHaveBeenCalledWith(CAMPAIGN_ID, ORG_ID, {
      status: 'review',
      updatedBy: ACTOR_ID,
    });
  });

  it('permite a strategist/admin/owner enviar a revisión', async () => {
    for (const role of ['strategist', 'admin', 'owner'] as const) {
      const campaignRepository = makeCampaignRepo();
      const organizationRepository = makeOrgRepo({
        findMember: vi.fn().mockResolvedValue(ok(makeMember(role))),
      });

      const result = await submitCampaignForReview(makeInput(), {
        campaignRepository,
        organizationRepository,
        logger: makeLogger(),
      });

      expect(result.success).toBe(true);
    }
  });

  it('rechaza a viewer con FORBIDDEN', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo({
      findMember: vi.fn().mockResolvedValue(ok(makeMember('viewer'))),
    });

    const result = await submitCampaignForReview(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
    expect(campaignRepository.update).not.toHaveBeenCalled();
  });

  it('rechaza si el actor no es miembro de la organización', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo({
      findMember: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
    });

    const result = await submitCampaignForReview(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
    expect(campaignRepository.update).not.toHaveBeenCalled();
  });

  it('retorna NOT_FOUND si la campaña no existe / es de otra organización', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'Campaign not found' })),
    });
    const organizationRepository = makeOrgRepo();

    const result = await submitCampaignForReview(makeInput({ organizationId: OTHER_ORG_ID }), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(campaignRepository.update).not.toHaveBeenCalled();
  });

  it('rechaza transición inválida si el status actual no es draft', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(ok(makeCampaign({ status: 'review' }))),
    });
    const organizationRepository = makeOrgRepo();

    const result = await submitCampaignForReview(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(campaignRepository.update).not.toHaveBeenCalled();
  });

  it('no incluye approvedAt/rejectedAt en el payload de update', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();

    await submitCampaignForReview(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    const updateArg = (campaignRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(updateArg).not.toHaveProperty('approvedAt');
    expect(updateArg).not.toHaveProperty('rejectedAt');
  });

  it('rechaza campaignId vacío con VALIDATION_ERROR', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();

    const result = await submitCampaignForReview(makeInput({ campaignId: '' }), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(campaignRepository.findById).not.toHaveBeenCalled();
  });

  it('propaga error del repositorio en update', async () => {
    const campaignRepository = makeCampaignRepo({
      update: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'db error' })),
    });
    const organizationRepository = makeOrgRepo();
    const logger = makeLogger();

    const result = await submitCampaignForReview(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
    expect(logger.error).toHaveBeenCalled();
  });
});
