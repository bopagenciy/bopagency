/**
 * editCampaignDraft use case — tests unitarios (auditoría de completitud
 * Phase 7E — draft edit flow).
 *
 * Cubre: edición OK en 'draft', roles permitidos (operator/strategist/
 * admin/owner) vs viewer denegado, actor no-miembro, campaña inexistente/
 * otra organización, edición rechazada si status ≠ 'draft', payload de
 * update nunca incluye status/generatedContent/metadata, campaignId
 * inválido, budget inválido/negativo rechazado, y propagación de errores
 * del repositorio.
 */

import { describe, it, expect, vi } from 'vitest';
import { editCampaignDraft } from '../edit-campaign-draft.use-case';
import type { EditCampaignDraftInput } from '../edit-campaign-draft.use-case';
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
    generatedContent: { campaignConcept: 'Concepto original' },
    metadata: { ai: { provider: 'gemini' } },
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
    update: vi.fn().mockResolvedValue(ok(makeCampaign({ name: 'Campaña actualizada' }))),
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

function makeInput(overrides: Partial<EditCampaignDraftInput> = {}): EditCampaignDraftInput {
  return {
    campaignId: CAMPAIGN_ID,
    organizationId: ORG_ID,
    actorUserId: ACTOR_ID,
    name: 'Campaña actualizada',
    budget: 6000000,
    ...overrides,
  };
}

describe('editCampaignDraft use case', () => {
  it('edita una campaña en draft correctamente (operator)', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();

    const result = await editCampaignDraft(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(true);
    expect(campaignRepository.update).toHaveBeenCalledWith(CAMPAIGN_ID, ORG_ID, {
      name: 'Campaña actualizada',
      budget: 6000000,
      updatedBy: ACTOR_ID,
    });
  });

  it('permite a strategist/admin/owner editar', async () => {
    for (const role of ['strategist', 'admin', 'owner'] as const) {
      const campaignRepository = makeCampaignRepo();
      const organizationRepository = makeOrgRepo({
        findMember: vi.fn().mockResolvedValue(ok(makeMember(role))),
      });

      const result = await editCampaignDraft(makeInput(), {
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

    const result = await editCampaignDraft(makeInput(), {
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

    const result = await editCampaignDraft(makeInput(), {
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

    const result = await editCampaignDraft(makeInput({ organizationId: OTHER_ORG_ID }), {
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

  it('rechaza edición si el status actual no es draft', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(ok(makeCampaign({ status: 'review' }))),
    });
    const organizationRepository = makeOrgRepo();

    const result = await editCampaignDraft(makeInput(), {
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

  it('rechaza edición de campañas approved/rejected/active/paused/completed', async () => {
    for (const status of ['approved', 'rejected', 'active', 'paused', 'completed'] as const) {
      const campaignRepository = makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(ok(makeCampaign({ status }))),
      });
      const organizationRepository = makeOrgRepo();

      const result = await editCampaignDraft(makeInput(), {
        campaignRepository,
        organizationRepository,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      expect(campaignRepository.update).not.toHaveBeenCalled();
    }
  });

  it('nunca incluye status/generatedContent/metadata en el payload de update', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();

    await editCampaignDraft(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    const updateArg = (campaignRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(updateArg).not.toHaveProperty('status');
    expect(updateArg).not.toHaveProperty('generatedContent');
    expect(updateArg).not.toHaveProperty('metadata');
  });

  it('solo envía al repositorio los campos provistos en el input', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();

    const input: EditCampaignDraftInput = {
      campaignId: CAMPAIGN_ID,
      organizationId: ORG_ID,
      actorUserId: ACTOR_ID,
      brief: 'Nuevo brief',
    };
    await editCampaignDraft(input, {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    const updateArg = (campaignRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(updateArg).toEqual({ brief: 'Nuevo brief', updatedBy: ACTOR_ID });
  });

  it('rechaza campaignId vacío con VALIDATION_ERROR', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();

    const result = await editCampaignDraft(makeInput({ campaignId: '' as CampaignId }), {
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

  it('rechaza budget negativo con VALIDATION_ERROR', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();

    const result = await editCampaignDraft(makeInput({ budget: -100 }), {
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

    const result = await editCampaignDraft(makeInput(), {
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
