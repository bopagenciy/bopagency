/**
 * approveCampaign use case — tests unitarios (Phase 7C).
 *
 * Cubre: review → approved OK (admin/owner), viewer/operator/strategist
 * denegados, actor no-miembro, campaña inexistente/otra organización,
 * transición inválida (status actual ≠ review), delegación a
 * CampaignRepository.approve (RPC), y propagación de errores del RPC
 * (mapeados por el repositorio a códigos de error tipados).
 */

import { describe, it, expect, vi } from 'vitest';
import { approveCampaign } from '../approve-campaign.use-case';
import type { ApproveCampaignInput } from '../approve-campaign.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  ClientRepository,
  OrganizationId,
  OrganizationMember,
  OrganizationRepository,
  OrganizationRole,
  AlertRepository,
  TaskRepository,
  Alert,
  Task,
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
    status: 'review',
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
    approvedAt: null,
    rejectedAt: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-02'),
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
    update: vi.fn(),
    approve: vi.fn().mockResolvedValue(ok(makeCampaign({ status: 'approved', approvedAt: new Date() }))),
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
    findMember: vi.fn().mockResolvedValue(ok(makeMember('admin'))),
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

function makeInput(overrides: Partial<ApproveCampaignInput> = {}): ApproveCampaignInput {
  return { campaignId: CAMPAIGN_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID, ...overrides };
}

describe('approveCampaign use case', () => {
  it('aprueba review → approved (admin) delegando en el repositorio (RPC)', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo({
      findMember: vi.fn().mockResolvedValue(ok(makeMember('admin'))),
    });

    const result = await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(true);
    expect(campaignRepository.approve).toHaveBeenCalledWith(CAMPAIGN_ID, ORG_ID, ACTOR_ID);
  });

  it('permite a owner aprobar', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo({
      findMember: vi.fn().mockResolvedValue(ok(makeMember('owner'))),
    });

    const result = await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(true);
  });

  it.each(['viewer', 'operator', 'strategist'] as const)(
    'rechaza a %s con FORBIDDEN',
    async (role) => {
      const campaignRepository = makeCampaignRepo();
      const organizationRepository = makeOrgRepo({
        findMember: vi.fn().mockResolvedValue(ok(makeMember(role))),
      });

      const result = await approveCampaign(makeInput(), {
        campaignRepository,
        organizationRepository,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FORBIDDEN');
      }
      expect(campaignRepository.approve).not.toHaveBeenCalled();
    },
  );

  it('rechaza si el actor no es miembro de la organización', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo({
      findMember: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
    });

    const result = await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
    expect(campaignRepository.approve).not.toHaveBeenCalled();
  });

  it('retorna NOT_FOUND si la campaña no existe / es de otra organización', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'Campaign not found' })),
    });
    const organizationRepository = makeOrgRepo();

    const result = await approveCampaign(makeInput({ organizationId: OTHER_ORG_ID }), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(campaignRepository.approve).not.toHaveBeenCalled();
  });

  it('rechaza transición inválida si el status actual no es review', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(ok(makeCampaign({ status: 'draft' }))),
    });
    const organizationRepository = makeOrgRepo();

    const result = await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(campaignRepository.approve).not.toHaveBeenCalled();
  });

  it('rechaza también si la campaña ya fue aprobada (approved → approved inválido)', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(ok(makeCampaign({ status: 'approved', approvedAt: new Date() }))),
    });
    const organizationRepository = makeOrgRepo();

    const result = await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(campaignRepository.approve).not.toHaveBeenCalled();
  });

  it('propaga error del repositorio/RPC en approve (p. ej. rol insuficiente detectado por la RPC)', async () => {
    const campaignRepository = makeCampaignRepo({
      approve: vi.fn().mockResolvedValue(err({ code: 'FORBIDDEN', message: 'lacks admin/owner role' })),
    });
    const organizationRepository = makeOrgRepo();
    const logger = makeLogger();

    const result = await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('Phase 7F — campaign automation hook (best-effort, post-commit)', () => {
  function makeAlertRepository(overrides: Partial<AlertRepository> = {}): AlertRepository {
    return {
      findById: vi.fn(),
      findByOrganization: vi.fn(),
      findActiveByOrganization: vi.fn(),
      findByClient: vi.fn(),
      countBySeverity: vi.fn(),
      acknowledge: vi.fn(),
      resolve: vi.fn(),
      upsertByAlertKey: vi.fn().mockResolvedValue(
        ok({ alert: {} as Alert, created: true }),
      ),
      findActiveByAlertKey: vi.fn(),
      resolveActiveByAlertKeyPrefixes: vi.fn(),
      ...overrides,
    } as unknown as AlertRepository;
  }

  function makeTaskRepository(overrides: Partial<TaskRepository> = {}): TaskRepository {
    return {
      findById: vi.fn(),
      findByOrganization: vi.fn(),
      findByClient: vi.fn(),
      findUpcoming: vi.fn(),
      countByStatus: vi.fn(),
      updateStatus: vi.fn(),
      create: vi.fn().mockResolvedValue(ok({} as Task)),
      findActiveBySignatureTag: vi.fn().mockResolvedValue(ok([])),
      ...overrides,
    } as unknown as TaskRepository;
  }

  it('is a no-op (does not throw, does not affect the result) when alertRepository/taskRepository are not wired', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();
    const logger = makeLogger();

    const result = await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      logger,
    });

    expect(result.success).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped'),
      expect.anything(),
    );
  });

  it('dispatches the campaign automation event when alertRepository/taskRepository ARE wired, without altering the transition result', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();
    const logger = makeLogger();
    const taskRepository = makeTaskRepository();
    const alertRepository = makeAlertRepository();

    const result = await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      alertRepository,
      taskRepository,
      logger,
    });

    expect(result.success).toBe(true);
    expect(taskRepository.findActiveBySignatureTag).toHaveBeenCalled();
    const call = (taskRepository.findActiveBySignatureTag as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string] | undefined;
    const tag = call?.[0];
    expect(tag).toContain('campaign_approved');
  });

  it('propagates the real actorUserId (ACTOR_ID) to TaskRepository.create.createdBy — smoke bug fix regression', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();
    const logger = makeLogger();
    const taskRepository = makeTaskRepository();
    const alertRepository = makeAlertRepository();

    await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      alertRepository,
      taskRepository,
      logger,
    });

    expect(taskRepository.create).toHaveBeenCalledOnce();
    const createArgs = (taskRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { createdBy: string };
    expect(createArgs.createdBy).toBe(ACTOR_ID);
    expect(createArgs.createdBy).not.toBe('campaign-automation-evaluator');
  });

  it('never reverts the already-committed transition when the automation dispatch throws unexpectedly', async () => {
    const campaignRepository = makeCampaignRepo();
    const organizationRepository = makeOrgRepo();
    const logger = makeLogger();
    const taskRepository = makeTaskRepository({
      findActiveBySignatureTag: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const alertRepository = makeAlertRepository();

    const result = await approveCampaign(makeInput(), {
      campaignRepository,
      organizationRepository,
      alertRepository,
      taskRepository,
      logger,
    });

    // El resultado principal (la transición ya persistida) NUNCA se ve
    // afectado por un fallo del side effect interno.
    expect(result.success).toBe(true);
  });

  describe('Google Ads Activation Config (Phase 8F.0 & Phase 8F.2A)', () => {
    const validGoogleAdsConfig = {
      dailyBudget: { amount: 50, currency: 'USD' },
      biddingStrategy: 'MAXIMIZE_CLICKS',
      finalUrl: 'https://app.client.com/landing',
      geoTargetIds: ['2170'],
      languageCriterionIds: ['1003'],
      keywordMatchPolicy: 'PHRASE',
      negativeKeywordMatchPolicy: 'BROAD',
      euPoliticalAdvertisingDeclaration: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    };

    const makeMockClientRepo = (website: string | null = 'https://client.com') => ({
      findById: vi.fn().mockResolvedValue(ok({ id: 'client_1', website })),
    });

    it('rechaza una campaña de Google Ads sin googleAdsConfig en metadata', async () => {
      const campaignRepository = makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(ok(makeCampaign({ platform: 'google_ads', metadata: {} }))),
      });
      const organizationRepository = makeOrgRepo();
      const logger = makeLogger();

      const result = await approveCampaign(makeInput(), {
        campaignRepository,
        organizationRepository,
        logger,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('googleAdsConfig');
      }
    });

    it('rechaza aprobación de campaña de Google Ads si googleAdsConfig no tiene la declaración de publicidad política de la UE (8F.2A)', async () => {
      const legacyConfigWithoutEU = {
        dailyBudget: { amount: 50, currency: 'USD' },
        biddingStrategy: 'MAXIMIZE_CLICKS',
        finalUrl: 'https://app.client.com/landing',
        geoTargetIds: ['2170'],
        languageCriterionIds: ['1003'],
        keywordMatchPolicy: 'PHRASE',
        negativeKeywordMatchPolicy: 'BROAD',
      };

      const campaignRepository = makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(
          ok(makeCampaign({ platform: 'google_ads', metadata: { googleAdsConfig: legacyConfigWithoutEU } })),
        ),
      });

      const result = await approveCampaign(makeInput(), {
        campaignRepository,
        organizationRepository: makeOrgRepo(),
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('Declaración de publicidad política de la UE requerida');
      }
    });

    it('rechaza una campaña de Google Ads con config inválida', async () => {
      const campaignRepository = makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(
          ok(makeCampaign({ platform: 'google_ads', metadata: { googleAdsConfig: { dailyBudget: -10 } } })),
        ),
      });
      const organizationRepository = makeOrgRepo();
      const logger = makeLogger();

      const result = await approveCampaign(makeInput(), {
        campaignRepository,
        organizationRepository,
        logger,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('aprueba una campaña de Google Ads con config válida y hostname de cliente válido', async () => {
      const campaignRepository = makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(
          ok(makeCampaign({ platform: 'google_ads', metadata: { googleAdsConfig: validGoogleAdsConfig } })),
        ),
      });
      const organizationRepository = makeOrgRepo();
      const clientRepository = makeMockClientRepo('https://client.com') as unknown as ClientRepository;
      const logger = makeLogger();

      const result = await approveCampaign(makeInput(), {
        campaignRepository,
        organizationRepository,
        clientRepository,
        logger,
      });

      expect(result.success).toBe(true);
    });

    it('rechaza aprobaciones de Google Ads cuando finalUrl no coincide con el dominio del cliente', async () => {
      const campaignRepository = makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(
          ok(makeCampaign({ platform: 'google_ads', metadata: { googleAdsConfig: validGoogleAdsConfig } })),
        ),
      });
      const organizationRepository = makeOrgRepo();
      const clientRepository = makeMockClientRepo('https://otherdomain.com') as unknown as ClientRepository;
      const logger = makeLogger();

      const result = await approveCampaign(makeInput(), {
        campaignRepository,
        organizationRepository,
        clientRepository,
        logger,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('pertenecer al sitio web registrado');
      }
    });

    it('no afecta a campañas que no son de Google Ads (Meta Ads sin config)', async () => {
      const campaignRepository = makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(ok(makeCampaign({ platform: 'meta_ads', metadata: {} }))),
      });
      const organizationRepository = makeOrgRepo();
      const logger = makeLogger();

      const result = await approveCampaign(makeInput(), {
        campaignRepository,
        organizationRepository,
        logger,
      });

      expect(result.success).toBe(true);
    });
  });
});
