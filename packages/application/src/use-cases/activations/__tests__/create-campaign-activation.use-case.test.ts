/**
 * createCampaignActivation use case — tests unitarios (Phase 8A.2).
 *
 * Cubre: campaign approved → activation creada OK (strategist/admin/owner);
 * draft/review/rejected fallan ANTES de persistir; org/cliente incorrectos
 * rechazados; se resuelve la aprobación REAL (nunca fabricada); snapshot
 * generado correctamente; nunca transiciona campaign a 'active'; nunca
 * publica externamente (no hay ningún adapter de publishing en deps);
 * errores de conflicto (activation no-terminal duplicada) propagados desde
 * el repositorio; señal best-effort post-commit (éxito y fallo).
 */

import { describe, it, expect, vi } from 'vitest';
import { createCampaignActivation } from '../create-campaign-activation.use-case';
import type { CreateCampaignActivationInput } from '../create-campaign-activation.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  CampaignApproval,
  CampaignApprovalId,
  CampaignApprovalRepository,
  CampaignActivation,
  CampaignActivationId,
  CampaignActivationRepository,
  OrganizationId,
  OrganizationMember,
  OrganizationRepository,
  OrganizationRole,
  TaskRepository,
  Task,
} from '@bop-agency/domain';
import { activationAlreadyActiveForCampaign } from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as OrganizationId;
const CAMPAIGN_ID = '22222222-2222-2222-2222-222222222222' as CampaignId;
const APPROVAL_ID = '33333333-3333-3333-3333-333333333333' as CampaignApprovalId;
const ACTIVATION_ID = '44444444-4444-4444-4444-444444444444' as CampaignActivationId;
const ACTOR_ID = '55555555-5555-5555-5555-555555555555';

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    organizationId: ORG_ID,
    clientId: '66666666-6666-6666-6666-666666666666' as Campaign['clientId'],
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
    id: APPROVAL_ID,
    organizationId: ORG_ID,
    campaignId: CAMPAIGN_ID,
    action: 'approved',
    note: null,
    actorUserId: '88888888-8888-8888-8888-888888888888',
    metadata: {},
    createdAt: new Date('2026-08-03'),
    ...overrides,
  };
}

function makeActivation(overrides: Partial<CampaignActivation> = {}): CampaignActivation {
  return {
    id: ACTIVATION_ID,
    organizationId: ORG_ID,
    clientId: '66666666-6666-6666-6666-666666666666' as CampaignActivation['clientId'],
    campaignId: CAMPAIGN_ID,
    campaignApprovalId: APPROVAL_ID,
    status: 'pending',
    approvedSnapshot: {
      schemaVersion: 'activation-snapshot-v1',
      campaign: {
        id: CAMPAIGN_ID,
        name: 'Campaña de Verano',
        objective: 'lead_generation',
        platform: 'meta_ads',
        budget: 5000000,
        currency: 'COP',
        startDate: null,
        endDate: null,
      },
      generatedContent: null,
      metadata: {},
      approval: {
        campaignApprovalId: APPROVAL_ID,
        approvedAt: '2026-08-03T00:00:00.000Z',
        approvedBy: '88888888-8888-8888-8888-888888888888',
      },
    },
    scheduledAt: null,
    preparedAt: null,
    readyAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    notes: null,
    metadata: {},
    createdBy: ACTOR_ID,
    updatedBy: null,
    createdAt: new Date('2026-08-24'),
    updatedAt: new Date('2026-08-24'),
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
    approve: vi.fn(),
    reject: vi.fn(),
    ...overrides,
  };
}

function makeApprovalRepo(
  overrides: Partial<CampaignApprovalRepository> = {},
): CampaignApprovalRepository {
  return {
    findByCampaignId: vi.fn(),
    findLatestByCampaignId: vi.fn().mockResolvedValue(ok(makeApproval())),
    ...overrides,
  };
}

function makeActivationRepo(
  overrides: Partial<CampaignActivationRepository> = {},
): CampaignActivationRepository {
  return {
    findById: vi.fn(),
    findByIdWithTargets: vi.fn(),
    findActiveByCampaign: vi.fn(),
    findByCampaign: vi.fn(),
    findByOrganization: vi.fn(),
    create: vi.fn().mockResolvedValue(ok(makeActivation())),
    cancel: vi.fn(),
    listTargets: vi.fn(),
    findTargetById: vi.fn(),
    addTarget: vi.fn(),
    removeTarget: vi.fn(),
    prepareTarget: vi.fn(),
    markTargetReady: vi.fn(),
    markTargetPublished: vi.fn(),
    markTargetPublishing: vi.fn(),
    markTargetFailed: vi.fn(),
    cancelTarget: vi.fn(),
    listEvents: vi.fn(),
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
    findMember: vi.fn().mockResolvedValue(ok(makeMember('strategist'))),
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

function makeInput(overrides: Partial<CreateCampaignActivationInput> = {}): CreateCampaignActivationInput {
  return {
    campaignId: CAMPAIGN_ID,
    organizationId: ORG_ID,
    actorUserId: ACTOR_ID,
    ...overrides,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    campaignRepository: makeCampaignRepo(),
    campaignApprovalRepository: makeApprovalRepo(),
    activationRepository: makeActivationRepo(),
    organizationRepository: makeOrgRepo(),
    logger: makeLogger(),
    ...overrides,
  };
}

describe('createCampaignActivation use case', () => {
  it('crea la activation cuando campaign.status === approved (strategist)', async () => {
    const activationRepository = makeActivationRepo();
    const deps = makeDeps({ activationRepository });

    const result = await createCampaignActivation(makeInput(), deps);

    expect(result.success).toBe(true);
    expect(activationRepository.create).toHaveBeenCalledOnce();
    const createArgs = (activationRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createArgs.campaignApprovalId).toBe(APPROVAL_ID);
    expect(createArgs.approvedSnapshot.campaign.id).toBe(CAMPAIGN_ID);
    expect(createArgs.approvedSnapshot.approval.campaignApprovalId).toBe(APPROVAL_ID);
  });

  it.each(['admin', 'owner'] as const)('permite a %s crear la activation', async (role) => {
    const organizationRepository = makeOrgRepo({
      findMember: vi.fn().mockResolvedValue(ok(makeMember(role))),
    });
    const result = await createCampaignActivation(makeInput(), makeDeps({ organizationRepository }));
    expect(result.success).toBe(true);
  });

  it.each(['viewer', 'operator'] as const)('rechaza a %s con FORBIDDEN, sin persistir', async (role) => {
    const organizationRepository = makeOrgRepo({
      findMember: vi.fn().mockResolvedValue(ok(makeMember(role))),
    });
    const activationRepository = makeActivationRepo();

    const result = await createCampaignActivation(
      makeInput(),
      makeDeps({ organizationRepository, activationRepository }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
    expect(activationRepository.create).not.toHaveBeenCalled();
  });

  it.each(['draft', 'review', 'rejected'] as const)(
    'rechaza si campaign.status es "%s" (no approved) ANTES de persistir',
    async (status) => {
      const campaignRepository = makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(ok(makeCampaign({ status }))),
      });
      const activationRepository = makeActivationRepo();

      const result = await createCampaignActivation(
        makeInput(),
        makeDeps({ campaignRepository, activationRepository }),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
      expect(activationRepository.create).not.toHaveBeenCalled();
    },
  );

  it('rechaza si el actor no es miembro de la organización', async () => {
    const organizationRepository = makeOrgRepo({
      findMember: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
    });
    const activationRepository = makeActivationRepo();

    const result = await createCampaignActivation(
      makeInput(),
      makeDeps({ organizationRepository, activationRepository }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
    expect(activationRepository.create).not.toHaveBeenCalled();
  });

  it('retorna NOT_FOUND si la campaña no existe / es de otra organización', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'Campaign not found' })),
    });
    const activationRepository = makeActivationRepo();

    const result = await createCampaignActivation(
      makeInput(),
      makeDeps({ campaignRepository, activationRepository }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(activationRepository.create).not.toHaveBeenCalled();
  });

  it('nunca fabrica un campaignApprovalId: si no hay ninguna aprobación real, falla', async () => {
    const campaignApprovalRepository = makeApprovalRepo({
      findLatestByCampaignId: vi.fn().mockResolvedValue(ok(null)),
    });
    const activationRepository = makeActivationRepo();

    const result = await createCampaignActivation(
      makeInput(),
      makeDeps({ campaignApprovalRepository, activationRepository }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(activationRepository.create).not.toHaveBeenCalled();
  });

  it('falla si la última decisión de aprobación no es "approved" (estado inconsistente)', async () => {
    const campaignApprovalRepository = makeApprovalRepo({
      findLatestByCampaignId: vi.fn().mockResolvedValue(ok(makeApproval({ action: 'rejected' }))),
    });
    const activationRepository = makeActivationRepo();

    const result = await createCampaignActivation(
      makeInput(),
      makeDeps({ campaignApprovalRepository, activationRepository }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(activationRepository.create).not.toHaveBeenCalled();
  });

  it('nunca transiciona campaign.status a "active" — no invoca ningún método de CampaignRepository más allá de findById', async () => {
    const campaignRepository = makeCampaignRepo();
    const result = await createCampaignActivation(makeInput(), makeDeps({ campaignRepository }));

    expect(result.success).toBe(true);
    expect(campaignRepository.update).not.toHaveBeenCalled();
    expect(campaignRepository.approve).not.toHaveBeenCalled();
  });

  it('propaga el error de conflicto (activation no-terminal duplicada) desde el repositorio, sin reintentar', async () => {
    const activationRepository = makeActivationRepo({
      create: vi.fn().mockResolvedValue(err(activationAlreadyActiveForCampaign(String(CAMPAIGN_ID)))),
    });

    const result = await createCampaignActivation(makeInput(), makeDeps({ activationRepository }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('el snapshot congela generatedContent: null cuando la campaña no tiene contenido generado', async () => {
    const activationRepository = makeActivationRepo();
    await createCampaignActivation(makeInput(), makeDeps({ activationRepository }));

    const createArgs = (activationRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createArgs.approvedSnapshot.generatedContent).toBeNull();
  });

  it('el snapshot congela el generatedContent REAL de la campaña cuando existe y matchea el schema (Phase 7D)', async () => {
    const validMetaAdsContent = {
      schemaVersion: 'campaign-content-v1',
      language: 'es',
      campaignConcept: 'Concepto de campaña',
      targetAudience: 'Audiencia objetivo',
      valueProposition: 'Propuesta de valor',
      messaging: ['Mensaje 1'],
      callsToAction: ['Comprar ahora'],
      landingPageRecommendations: [],
      complianceNotes: [],
      assumptions: [],
      platform: 'meta_ads',
      adSets: [
        {
          name: 'Ad set 1',
          audienceType: 'cold',
          targetingSummary: 'Resumen de targeting',
          placementSuggestions: ['feed'],
          creatives: [
            {
              hook: 'Hook',
              headline: 'Headline',
              primaryText: 'Primary text',
              format: 'image',
              visualSuggestion: 'Visual suggestion',
            },
          ],
        },
      ],
    };
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(ok(makeCampaign({ generatedContent: validMetaAdsContent }))),
    });
    const activationRepository = makeActivationRepo();

    const result = await createCampaignActivation(
      makeInput(),
      makeDeps({ campaignRepository, activationRepository }),
    );

    expect(result.success).toBe(true);
    const createArgs = (activationRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createArgs.approvedSnapshot.generatedContent).toEqual(validMetaAdsContent);
  });

  it('el snapshot congela generatedContent: null (con warning logueado) si el contenido de la campaña no matchea el schema', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(ok(makeCampaign({ generatedContent: { garbage: true } }))),
    });
    const activationRepository = makeActivationRepo();
    const logger = makeLogger();

    const result = await createCampaignActivation(
      makeInput(),
      makeDeps({ campaignRepository, activationRepository, logger }),
    );

    expect(result.success).toBe(true);
    const createArgs = (activationRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createArgs.approvedSnapshot.generatedContent).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('generatedContent'),
      expect.anything(),
    );
  });

  it('no invoca ningún adapter de publishing externo (deps no expone ninguno) — creación pura de dominio', async () => {
    const activationRepository = makeActivationRepo();
    const deps = makeDeps({ activationRepository });
    expect(Object.keys(deps)).not.toContain('metaAdsPort');
    expect(Object.keys(deps)).not.toContain('googleAdsPort');
    expect(Object.keys(deps)).not.toContain('n8nPort');

    const result = await createCampaignActivation(makeInput(), deps);
    expect(result.success).toBe(true);
  });

  it('señal post-commit: no afecta el resultado exitoso aunque taskRepository no esté wired', async () => {
    const logger = makeLogger();
    const result = await createCampaignActivation(makeInput(), makeDeps({ logger }));

    expect(result.success).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped'),
      expect.anything(),
    );
  });

  it('señal post-commit: crea la tarea de siguiente-paso con dedupe cuando taskRepository SÍ está wired', async () => {
    const taskRepository = makeTaskRepository();
    const result = await createCampaignActivation(makeInput(), makeDeps({ taskRepository }));

    expect(result.success).toBe(true);
    expect(taskRepository.findActiveBySignatureTag).toHaveBeenCalledOnce();
    expect(taskRepository.create).toHaveBeenCalledOnce();
  });

  it('señal post-commit: no crea una segunda tarea si ya existe una activa con la misma firma (dedupe)', async () => {
    const taskRepository = makeTaskRepository({
      findActiveBySignatureTag: vi.fn().mockResolvedValue(ok([{} as Task])),
    });
    const result = await createCampaignActivation(makeInput(), makeDeps({ taskRepository }));

    expect(result.success).toBe(true);
    expect(taskRepository.create).not.toHaveBeenCalled();
  });

  it('señal post-commit: un fallo del signal NUNCA revierte la creación ya persistida', async () => {
    const taskRepository = makeTaskRepository({
      findActiveBySignatureTag: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const activationRepository = makeActivationRepo();

    const result = await createCampaignActivation(makeInput(), makeDeps({ taskRepository, activationRepository }));

    expect(result.success).toBe(true);
    expect(activationRepository.create).toHaveBeenCalledOnce();
  });
});
