/**
 * Read use cases — tests unitarios (Phase 8A.2): getCampaignActivation,
 * listCampaignActivationsByCampaign, listCampaignActivationsByClient,
 * getActivationWithTargetsAndEvents.
 *
 * Cubre: lectura pura (ninguna de estas Deps siquiera expone
 * alertRepository/taskRepository — no hay forma de que muten nada);
 * aislamiento por organización vía findMember; propagación de errores del
 * repositorio.
 */

import { describe, it, expect, vi } from 'vitest';
import { ok, err } from '@bop-agency/shared';
import type {
  CampaignActivation,
  CampaignActivationId,
  CampaignActivationRepository,
  CampaignActivationWithTargets,
  CampaignId,
  ClientId,
  OrganizationId,
  OrganizationMember,
  OrganizationRepository,
  OrganizationRole,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

import { getCampaignActivation } from '../get-campaign-activation.use-case';
import { listCampaignActivationsByCampaign } from '../list-campaign-activations-by-campaign.use-case';
import { listCampaignActivationsByClient } from '../list-campaign-activations-by-client.use-case';
import { getActivationWithTargetsAndEvents } from '../get-activation-with-targets-and-events.use-case';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as OrganizationId;
const CAMPAIGN_ID = '22222222-2222-2222-2222-222222222222' as CampaignId;
const CLIENT_ID = '66666666-6666-6666-6666-666666666666' as ClientId;
const ACTIVATION_ID = '44444444-4444-4444-4444-444444444444' as CampaignActivationId;
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

function makeOrgRepo(overrides: Partial<OrganizationRepository> = {}): OrganizationRepository {
  return {
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMembers: vi.fn(),
    findMember: vi.fn().mockResolvedValue(ok(makeMember('viewer'))),
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
    campaignId: CAMPAIGN_ID,
    campaignApprovalId: '33333333-3333-3333-3333-333333333333' as CampaignActivation['campaignApprovalId'],
    status: 'pending',
    approvedSnapshot: {
      schemaVersion: 'activation-snapshot-v1',
      campaign: {
        id: CAMPAIGN_ID,
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

function makeActivationRepo(overrides: Partial<CampaignActivationRepository> = {}): CampaignActivationRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeActivation())),
    findByIdWithTargets: vi
      .fn()
      .mockResolvedValue(ok({ ...makeActivation(), targets: [] } as CampaignActivationWithTargets)),
    findActiveByCampaign: vi.fn(),
    findByCampaign: vi.fn().mockResolvedValue({
      data: [makeActivation()],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    }),
    findByOrganization: vi.fn().mockResolvedValue({
      data: [makeActivation()],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    }),
    create: vi.fn(),
    cancel: vi.fn(),
    listTargets: vi.fn(),
    findTargetById: vi.fn(),
    addTarget: vi.fn(),
    removeTarget: vi.fn(),
    prepareTarget: vi.fn(),
    markTargetReady: vi.fn(),
    markTargetPublished: vi.fn(),
    cancelTarget: vi.fn(),
    listEvents: vi.fn().mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    }),
    ...overrides,
  };
}

describe('read use cases — purity (no alert/task mutation possible)', () => {
  it('getCampaignActivationDeps no expone alertRepository ni taskRepository', () => {
    const deps = {
      activationRepository: makeActivationRepo(),
      organizationRepository: makeOrgRepo(),
      logger: makeLogger(),
    };
    expect(Object.keys(deps)).not.toContain('alertRepository');
    expect(Object.keys(deps)).not.toContain('taskRepository');
  });
});

describe('getCampaignActivation', () => {
  it('permite a viewer leer (read only)', async () => {
    const activationRepository = makeActivationRepo();
    const result = await getCampaignActivation(
      { activationId: ACTIVATION_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository: makeOrgRepo(), logger: makeLogger() },
    );
    expect(result.success).toBe(true);
  });

  it('rechaza si el actor no es miembro', async () => {
    const activationRepository = makeActivationRepo();
    const organizationRepository = makeOrgRepo({
      findMember: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
    });
    const result = await getCampaignActivation(
      { activationId: ACTIVATION_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { activationRepository, organizationRepository, logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(activationRepository.findById).not.toHaveBeenCalled();
  });
});

describe('listCampaignActivationsByCampaign', () => {
  it('retorna la página de activations de la campaña para cualquier miembro', async () => {
    const activationRepository = makeActivationRepo();
    const result = await listCampaignActivationsByCampaign(
      { campaignId: CAMPAIGN_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID, pagination: { page: 1, pageSize: 20 } },
      { activationRepository, organizationRepository: makeOrgRepo(), logger: makeLogger() },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.data).toHaveLength(1);
    }
  });
});

describe('listCampaignActivationsByClient', () => {
  it('retorna la página de activations del cliente, filtrando por status opcional', async () => {
    const activationRepository = makeActivationRepo();
    const result = await listCampaignActivationsByClient(
      { clientId: CLIENT_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID, status: 'pending', pagination: { page: 1, pageSize: 20 } },
      { activationRepository, organizationRepository: makeOrgRepo(), logger: makeLogger() },
    );
    expect(result.success).toBe(true);
    expect(activationRepository.findByOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, clientId: CLIENT_ID, status: 'pending' }),
      { page: 1, pageSize: 20 },
    );
  });
});

describe('getActivationWithTargetsAndEvents', () => {
  it('combina activation+targets y la página de eventos', async () => {
    const activationRepository = makeActivationRepo();
    const result = await getActivationWithTargetsAndEvents(
      { activationId: ACTIVATION_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID, eventsPagination: { page: 1, pageSize: 20 } },
      { activationRepository, organizationRepository: makeOrgRepo(), logger: makeLogger() },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.activation.targets).toEqual([]);
      expect(result.value.events.data).toEqual([]);
    }
  });

  it('propaga NOT_FOUND si la activation no existe / es de otra organización, sin llamar listEvents', async () => {
    const activationRepository = makeActivationRepo({
      findByIdWithTargets: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
    });
    const result = await getActivationWithTargetsAndEvents(
      { activationId: ACTIVATION_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID, eventsPagination: { page: 1, pageSize: 20 } },
      { activationRepository, organizationRepository: makeOrgRepo(), logger: makeLogger() },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    expect(activationRepository.listEvents).not.toHaveBeenCalled();
  });
});
