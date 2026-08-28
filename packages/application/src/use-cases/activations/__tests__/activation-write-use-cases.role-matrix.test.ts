/**
 * Role matrix + transition-guard tests para los 6 write use cases restantes
 * de Phase 8A.2: addCampaignActivationTarget, prepareActivationTarget,
 * markActivationTargetReady, markActivationTargetPublished,
 * cancelActivationTarget, cancelCampaignActivation.
 *
 * Matriz de roles verificada contra los guards reales de las RPCs (Phase
 * 8A.1 runtime rounds B–E):
 * - addCampaignActivationTarget: strategist+ (no hay RPC — INSERT directo,
 *   pero la matriz de roles del kickoff exige strategist para "add targets").
 * - prepareActivationTarget / markActivationTargetReady /
 *   markActivationTargetPublished: operator+ (RPC: "actor lacks operator+ role").
 * - cancelActivationTarget / cancelCampaignActivation: strategist+ (RPC:
 *   "actor lacks strategist+ role").
 */

import { describe, it, expect, vi } from 'vitest';
import { ok, err } from '@bop-agency/shared';
import type {
  CampaignActivation,
  CampaignActivationId,
  CampaignActivationTarget,
  CampaignActivationTargetId,
  CampaignActivationRepository,
  ClientId,
  OrganizationId,
  OrganizationMember,
  OrganizationRepository,
  OrganizationRole,
} from '@bop-agency/domain';
import { activationInvalidStatus, activationTargetInvalidStatus } from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

import { addCampaignActivationTarget } from '../add-campaign-activation-target.use-case';
import { prepareActivationTarget } from '../prepare-activation-target.use-case';
import { markActivationTargetReady } from '../mark-activation-target-ready.use-case';
import { markActivationTargetPublished } from '../mark-activation-target-published.use-case';
import { cancelActivationTarget } from '../cancel-activation-target.use-case';
import { cancelCampaignActivation } from '../cancel-campaign-activation.use-case';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as OrganizationId;
const CLIENT_ID = '66666666-6666-6666-6666-666666666666' as ClientId;
const ACTIVATION_ID = '44444444-4444-4444-4444-444444444444' as CampaignActivationId;
const TARGET_ID = '77777777-7777-7777-7777-777777777777' as CampaignActivationTargetId;
const ACTOR_ID = '55555555-5555-5555-5555-555555555555';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeMember(role: OrganizationRole): OrganizationMember {
  return {
    id: 'member-1',
    organizationId: ORG_ID,
    userId: ACTOR_ID,
    role,
    status: 'active',
    invitedBy: null,
    joinedAt: new Date('2026-01-01'),
  };
}

function makeOrgRepo(role: OrganizationRole, overrides: Partial<OrganizationRepository> = {}): OrganizationRepository {
  return {
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMembers: vi.fn(),
    findMember: vi.fn().mockResolvedValue(ok(makeMember(role))),
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

function makeActivation(overrides: Partial<CampaignActivation> = {}): CampaignActivation {
  return {
    id: ACTIVATION_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    campaignId: '22222222-2222-2222-2222-222222222222' as CampaignActivation['campaignId'],
    campaignApprovalId: '33333333-3333-3333-3333-333333333333' as CampaignActivation['campaignApprovalId'],
    status: 'pending',
    approvedSnapshot: {
      schemaVersion: 'activation-snapshot-v1',
      campaign: {
        id: '22222222-2222-2222-2222-222222222222' as CampaignActivation['campaignId'],
        name: 'x',
        objective: 'lead_generation',
        platform: 'meta_ads',
        budget: 1,
        currency: 'COP',
        startDate: null,
        endDate: null,
      },
      generatedContent: null,
      metadata: {},
      approval: {
        campaignApprovalId: '33333333-3333-3333-3333-333333333333' as CampaignActivation['campaignApprovalId'],
        approvedAt: '2026-08-03T00:00:00.000Z',
        approvedBy: 'admin-user-1',
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

function makeTarget(overrides: Partial<CampaignActivationTarget> = {}): CampaignActivationTarget {
  return {
    id: TARGET_ID,
    activationId: ACTIVATION_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    channel: 'manual',
    provider: 'manual',
    placement: null,
    clientIntegrationId: null,
    status: 'pending',
    readinessChecklist: {},
    scheduledAt: null,
    publishedAt: null,
    publishedBy: null,
    externalReference: null,
    failedAt: null,
    failureCode: null,
    failureMessage: null,
    cancelledAt: null,
    cancelledBy: null,
    metadata: {},
    createdAt: new Date('2026-08-24'),
    updatedAt: new Date('2026-08-24'),
    ...overrides,
  };
}

function makeActivationRepo(overrides: Partial<CampaignActivationRepository> = {}): CampaignActivationRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeActivation())),
    findByIdWithTargets: vi.fn(),
    findActiveByCampaign: vi.fn(),
    findByCampaign: vi.fn(),
    findByOrganization: vi.fn(),
    create: vi.fn(),
    cancel: vi.fn().mockResolvedValue(ok(makeActivation({ status: 'cancelled' }))),
    listTargets: vi.fn(),
    findTargetById: vi.fn(),
    addTarget: vi.fn().mockResolvedValue(ok(makeTarget())),
    removeTarget: vi.fn(),
    prepareTarget: vi.fn().mockResolvedValue(ok(makeTarget({ status: 'preparing' }))),
    markTargetReady: vi.fn().mockResolvedValue(ok(makeTarget({ status: 'ready' }))),
    markTargetPublished: vi.fn().mockResolvedValue(ok(makeTarget({ status: 'published' }))),
    markTargetPublishing: vi.fn(),
    markTargetFailed: vi.fn(),
    cancelTarget: vi.fn().mockResolvedValue(ok(makeTarget({ status: 'cancelled' }))),
    listEvents: vi.fn(),
    ...overrides,
  };
}

import type { ClientRepository, ClientIntegration } from '@bop-agency/domain';

function makeClientRepo(overrides: Partial<ClientRepository> = {}): ClientRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
    findByIdWithDocuments: vi.fn(),
    listContacts: vi.fn(),
    listDocuments: vi.fn(),
    getDocumentByKey: vi.fn(),
    upsertDocument: vi.fn(),
    listIntegrations: vi.fn().mockResolvedValue(
      ok([
        {
          id: '88888888-8888-8888-8888-888888888888',
          clientId: CLIENT_ID,
          provider: 'google',
          externalAccountId: '1234567890',
          status: 'active',
          configuration: {
            manager_customer_id: '1111111111',
            currency_code: 'USD',
            is_manager: false,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as ClientIntegration,
      ]),
    ),
    ...overrides,
  };
}

describe('addCampaignActivationTarget — role matrix + transitions', () => {
  const baseInput = {
    activationId: ACTIVATION_ID,
    channel: 'manual',
    provider: 'manual',
    organizationId: ORG_ID,
    actorUserId: ACTOR_ID,
  };

  it.each(['strategist', 'admin', 'owner'] as const)('permite a %s agregar un target', async (role) => {
    const activationRepository = makeActivationRepo();
    const result = await addCampaignActivationTarget(baseInput, {
      activationRepository,
      organizationRepository: makeOrgRepo(role),
      clientRepository: makeClientRepo(),
      logger: makeLogger(),
    });
    expect(result.success).toBe(true);
    expect(activationRepository.addTarget).toHaveBeenCalledOnce();
  });


  it.each(['viewer', 'operator'] as const)('rechaza a %s con FORBIDDEN (no puede crear/agregar targets)', async (role) => {
    const activationRepository = makeActivationRepo();
    const result = await addCampaignActivationTarget(baseInput, {
      activationRepository,
      organizationRepository: makeOrgRepo(role),
      clientRepository: makeClientRepo(),
      logger: makeLogger(),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(activationRepository.addTarget).not.toHaveBeenCalled();
  });

  it('rechaza si la activation ya está en estado terminal', async () => {
    const activationRepository = makeActivationRepo({
      findById: vi.fn().mockResolvedValue(ok(makeActivation({ status: 'completed' }))),
    });
    const result = await addCampaignActivationTarget(baseInput, {
      activationRepository,
      organizationRepository: makeOrgRepo('strategist'),
      clientRepository: makeClientRepo(),
      logger: makeLogger(),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(activationRepository.addTarget).not.toHaveBeenCalled();
  });

  it('rechaza un provider que no está en el enum cerrado (no strings arbitrarios)', async () => {
    const activationRepository = makeActivationRepo();
    const result = await addCampaignActivationTarget(
      { ...baseInput, channel: 'meta_ads', provider: 'not-a-real-provider' },
      {
        activationRepository,
        organizationRepository: makeOrgRepo('strategist'),
        clientRepository: makeClientRepo(),
        logger: makeLogger(),
      },
    );
    expect(result.success).toBe(false);
    expect(activationRepository.addTarget).not.toHaveBeenCalled();
  });

  it('rechaza un provider válido en el enum pero que no corresponde al channel (par channel/provider inválido)', async () => {
    const activationRepository = makeActivationRepo();
    const result = await addCampaignActivationTarget(
      { ...baseInput, channel: 'meta_ads', provider: 'google' },
      {
        activationRepository,
        organizationRepository: makeOrgRepo('strategist'),
        clientRepository: makeClientRepo(),
        logger: makeLogger(),
      },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(activationRepository.addTarget).not.toHaveBeenCalled();
  });

  describe('Google Ads Target Resource Snapshot (Phase 8F.2A)', () => {
    const googleInput = {
      activationId: ACTIVATION_ID,
      channel: 'google_ads',
      provider: 'google',
      clientIntegrationId: '88888888-8888-8888-8888-888888888888',
      organizationId: ORG_ID,
      actorUserId: ACTOR_ID,
    };

    it('derives and freezes googleAdsTargetResource server-side upon target addition', async () => {
      const activationRepository = makeActivationRepo();
      const result = await addCampaignActivationTarget(googleInput, {
        activationRepository,
        organizationRepository: makeOrgRepo('strategist'),
        clientRepository: makeClientRepo(),
        logger: makeLogger(),
      });

      expect(result.success).toBe(true);
      expect(activationRepository.addTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'google_ads',
          provider: 'google',
          clientIntegrationId: '88888888-8888-8888-8888-888888888888',
          metadata: expect.objectContaining({
            googleAdsTargetResource: {
              clientIntegrationId: '88888888-8888-8888-8888-888888888888',
              customerId: '1234567890',
              managerCustomerId: '1111111111',
              currencyCode: 'USD',
              isManager: false,
            },
          }),
        }),
      );
    });

    it('rejects Google Ads target creation if integration is not active', async () => {
      const clientRepository = makeClientRepo({
        listIntegrations: vi.fn().mockResolvedValue(
          ok([
            {
              id: '88888888-8888-8888-8888-888888888888',
              clientId: CLIENT_ID,
              provider: 'google',
              externalAccountId: '1234567890',
              status: 'revoked',
              configuration: { currency_code: 'USD' },
            } as unknown as ClientIntegration,
          ]),
        ),
      });

      const result = await addCampaignActivationTarget(googleInput, {
        activationRepository: makeActivationRepo(),
        organizationRepository: makeOrgRepo('strategist'),
        clientRepository,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects Google Ads target creation if account is an MCC manager (is_manager = true)', async () => {
      const clientRepository = makeClientRepo({
        listIntegrations: vi.fn().mockResolvedValue(
          ok([
            {
              id: '88888888-8888-8888-8888-888888888888',
              clientId: CLIENT_ID,
              provider: 'google',
              externalAccountId: '1234567890',
              status: 'active',
              configuration: { currency_code: 'USD', is_manager: true },
            } as unknown as ClientIntegration,
          ]),
        ),
      });

      const result = await addCampaignActivationTarget(googleInput, {
        activationRepository: makeActivationRepo(),
        organizationRepository: makeOrgRepo('strategist'),
        clientRepository,
        logger: makeLogger(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});

describe('prepareActivationTarget — role matrix', () => {
  it.each(['operator', 'strategist', 'admin', 'owner'] as const)('permite a %s preparar un target', async (role) => {
    const activationRepository = makeActivationRepo();
    const result = await prepareActivationTarget(
      { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo(role), logger: makeLogger() },
    );
    expect(result.success).toBe(true);
    expect(activationRepository.prepareTarget).toHaveBeenCalledOnce();
  });

  it('rechaza a viewer con FORBIDDEN', async () => {
    const activationRepository = makeActivationRepo();
    const result = await prepareActivationTarget(
      { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo('viewer'), logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(activationRepository.prepareTarget).not.toHaveBeenCalled();
  });

  it('propaga el error de transición inválida desde el repositorio (RPC es la autoridad final)', async () => {
    const activationRepository = makeActivationRepo({
      prepareTarget: vi.fn().mockResolvedValue(err(activationTargetInvalidStatus('published', 'preparing'))),
    });
    const result = await prepareActivationTarget(
      { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo('operator'), logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('markActivationTargetReady — role matrix', () => {
  it.each(['operator', 'strategist', 'admin', 'owner'] as const)('permite a %s marcar ready', async (role) => {
    const activationRepository = makeActivationRepo();
    const result = await markActivationTargetReady(
      { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo(role), logger: makeLogger() },
    );
    expect(result.success).toBe(true);
  });

  it('rechaza a viewer con FORBIDDEN', async () => {
    const activationRepository = makeActivationRepo();
    const result = await markActivationTargetReady(
      { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo('viewer'), logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(activationRepository.markTargetReady).not.toHaveBeenCalled();
  });
});

describe('markActivationTargetPublished — role matrix', () => {
  it.each(['operator', 'strategist', 'admin', 'owner'] as const)('permite a %s marcar published (camino manual)', async (role) => {
    const activationRepository = makeActivationRepo();
    const result = await markActivationTargetPublished(
      { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID, note: 'Publicado manualmente' },
      { activationRepository, organizationRepository: makeOrgRepo(role), logger: makeLogger() },
    );
    expect(result.success).toBe(true);
  });

  it('rechaza a viewer con FORBIDDEN', async () => {
    const activationRepository = makeActivationRepo();
    const result = await markActivationTargetPublished(
      { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID, note: 'Publicado manualmente' },
      { activationRepository, organizationRepository: makeOrgRepo('viewer'), logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(activationRepository.markTargetPublished).not.toHaveBeenCalled();
  });
});

describe('cancelActivationTarget — role matrix', () => {
  it.each(['strategist', 'admin', 'owner'] as const)('permite a %s cancelar un target', async (role) => {
    const activationRepository = makeActivationRepo();
    const result = await cancelActivationTarget(
      { targetId: TARGET_ID, reason: 'Presupuesto agotado', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo(role), logger: makeLogger() },
    );
    expect(result.success).toBe(true);
  });

  it.each(['viewer', 'operator'] as const)('rechaza a %s con FORBIDDEN (operator puede operar pero NO cancelar)', async (role) => {
    const activationRepository = makeActivationRepo();
    const result = await cancelActivationTarget(
      { targetId: TARGET_ID, reason: 'Presupuesto agotado', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo(role), logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(activationRepository.cancelTarget).not.toHaveBeenCalled();
  });
});

describe('cancelCampaignActivation — role matrix + terminal guard', () => {
  it.each(['strategist', 'admin', 'owner'] as const)('permite a %s cancelar la activation mientras el estado lo permita', async (role) => {
    const activationRepository = makeActivationRepo();
    const result = await cancelCampaignActivation(
      { activationId: ACTIVATION_ID, reason: 'Campaña pausada por el cliente', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo(role), logger: makeLogger() },
    );
    expect(result.success).toBe(true);
  });

  it.each(['viewer', 'operator'] as const)('rechaza a %s con FORBIDDEN (operator NO puede cancelar la activation)', async (role) => {
    const activationRepository = makeActivationRepo();
    const result = await cancelCampaignActivation(
      { activationId: ACTIVATION_ID, reason: 'Campaña pausada por el cliente', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo(role), logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(activationRepository.cancel).not.toHaveBeenCalled();
  });

  it('propaga el guard de estado terminal desde el repositorio/RPC (ej. ya cancelada/completada)', async () => {
    const activationRepository = makeActivationRepo({
      cancel: vi.fn().mockResolvedValue(err(activationInvalidStatus('completed', 'cancelled'))),
    });
    const result = await cancelCampaignActivation(
      { activationId: ACTIVATION_ID, reason: 'Campaña pausada por el cliente', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo('strategist'), logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza reason vacía (VALIDATION_ERROR) antes de llamar al repositorio', async () => {
    const activationRepository = makeActivationRepo();
    const result = await cancelCampaignActivation(
      { activationId: ACTIVATION_ID, reason: '   ', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo('strategist'), logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(activationRepository.cancel).not.toHaveBeenCalled();
  });

  describe('markActivationTargetReady — Google Ads Config (Phase 8F.0)', () => {
    const validGoogleAdsConfig = {
      dailyBudget: { amount: 50, currency: 'USD' },
      biddingStrategy: 'MAXIMIZE_CLICKS',
      finalUrl: 'https://client.com/promo',
      geoTargetIds: ['2170'],
      languageCriterionIds: ['1003'],
      keywordMatchPolicy: 'PHRASE',
      negativeKeywordMatchPolicy: 'BROAD',
    };

    it('rechaza marcar como ready un target de google_ads si el snapshot no tiene googleAdsConfig', async () => {
      const activationRepository = makeActivationRepo({
        findTargetById: vi.fn().mockResolvedValue(
          ok({
            id: TARGET_ID,
            activationId: ACTIVATION_ID,
            channel: 'google_ads',
            provider: 'google',
          } as CampaignActivationTarget),
        ),
        findById: vi.fn().mockResolvedValue(
          ok({
            id: ACTIVATION_ID,
            approvedSnapshot: { googleAdsConfig: null },
          } as CampaignActivation),
        ),
      });

      const result = await markActivationTargetReady(
        { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
        { activationRepository, organizationRepository: makeOrgRepo('operator'), logger: makeLogger() },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('permite marcar como ready un target de google_ads con googleAdsConfig válido', async () => {
      const activationRepository = makeActivationRepo({
        findTargetById: vi.fn().mockResolvedValue(
          ok({
            id: TARGET_ID,
            activationId: ACTIVATION_ID,
            channel: 'google_ads',
            provider: 'google',
          } as CampaignActivationTarget),
        ),
        findById: vi.fn().mockResolvedValue(
          ok({
            id: ACTIVATION_ID,
            approvedSnapshot: { googleAdsConfig: validGoogleAdsConfig },
          } as CampaignActivation),
        ),
        markTargetReady: vi.fn().mockResolvedValue(ok({ id: TARGET_ID, status: 'ready' } as CampaignActivationTarget)),
      });

      const result = await markActivationTargetReady(
        { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
        { activationRepository, organizationRepository: makeOrgRepo('operator'), logger: makeLogger() },
      );

      expect(result.success).toBe(true);
    });

    it('un target no-google (meta_ads) se marca como ready sin verificar googleAdsConfig', async () => {
      const activationRepository = makeActivationRepo({
        findTargetById: vi.fn().mockResolvedValue(
          ok({
            id: TARGET_ID,
            activationId: ACTIVATION_ID,
            channel: 'meta_ads',
            provider: 'meta',
          } as CampaignActivationTarget),
        ),
        markTargetReady: vi.fn().mockResolvedValue(ok({ id: TARGET_ID, status: 'ready' } as CampaignActivationTarget)),
      });

      const result = await markActivationTargetReady(
        { targetId: TARGET_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
        { activationRepository, organizationRepository: makeOrgRepo('operator'), logger: makeLogger() },
      );

      expect(result.success).toBe(true);
    });
  });
});
