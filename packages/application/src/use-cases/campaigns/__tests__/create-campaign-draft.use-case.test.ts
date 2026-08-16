import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCampaignDraft } from '../create-campaign-draft.use-case';
import { ok, err, isOk, isErr } from '@bop-agency/shared';
import type { LoggerPort } from '../../../ports/logger.port';
import type { Campaign, CampaignRepository, Client, ClientRepository } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';

const mockLogger: LoggerPort = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'campaign_1' as Campaign['id'],
    organizationId: 'org_1' as Campaign['organizationId'],
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

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client_1' as Client['id'],
    organizationId: 'org_1' as Client['organizationId'],
    name: 'Cliente Demo',
    legalName: null,
    slug: 'cliente-demo',
    status: 'active',
    industry: 'retail',
    timezone: 'America/Bogota',
    currency: 'COP',
    website: null,
    email: null,
    phone: null,
    notes: null,
    metadata: {},
    createdBy: 'user_1',
    updatedBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

function makeCampaignRepo(overrides: Partial<CampaignRepository> = {}): CampaignRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn().mockResolvedValue(ok(makeCampaign())),
    update: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    ...overrides,
  };
}

function makeClientRepo(overrides: Partial<ClientRepository> = {}): ClientRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeClient())),
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
    listIntegrations: vi.fn(),
    ...overrides,
  };
}

const baseInput = {
  organizationId: 'org_1' as OrganizationId,
  clientId: 'client_1',
  name: 'Campaña de Verano',
  platform: 'meta_ads',
  objective: 'lead_generation',
  budget: 5000000,
  createdBy: 'user_1',
};

describe('createCampaignDraft use case', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea una campaña draft correctamente', async () => {
    const campaignRepository = makeCampaignRepo();
    const clientRepository = makeClientRepo();

    const result = await createCampaignDraft(baseInput, {
      campaignRepository,
      clientRepository,
      logger: mockLogger,
    });

    expect(isOk(result)).toBe(true);
    expect(campaignRepository.create).toHaveBeenCalledOnce();
    expect(campaignRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        clientId: 'client_1',
        name: 'Campaña de Verano',
        createdBy: 'user_1',
      }),
    );
  });

  it('nunca llama a un AI provider ni pasa generatedContent al crear', async () => {
    const campaignRepository = makeCampaignRepo();
    const clientRepository = makeClientRepo();

    await createCampaignDraft(baseInput, { campaignRepository, clientRepository, logger: mockLogger });

    const createArg = (campaignRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(createArg).not.toHaveProperty('generatedContent');
  });

  it('rechaza si el nombre está vacío', async () => {
    const campaignRepository = makeCampaignRepo();
    const clientRepository = makeClientRepo();

    const result = await createCampaignDraft(
      { ...baseInput, name: '' },
      { campaignRepository, clientRepository, logger: mockLogger },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(campaignRepository.create).not.toHaveBeenCalled();
  });

  it('rechaza si el presupuesto es negativo', async () => {
    const campaignRepository = makeCampaignRepo();
    const clientRepository = makeClientRepo();

    const result = await createCampaignDraft(
      { ...baseInput, budget: -100 },
      { campaignRepository, clientRepository, logger: mockLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(campaignRepository.create).not.toHaveBeenCalled();
  });

  it('rechaza si platform no es válido', async () => {
    const campaignRepository = makeCampaignRepo();
    const clientRepository = makeClientRepo();

    const result = await createCampaignDraft(
      { ...baseInput, platform: 'myspace_ads' },
      { campaignRepository, clientRepository, logger: mockLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(campaignRepository.create).not.toHaveBeenCalled();
  });

  it('rechaza si el cliente no existe en la organización', async () => {
    const campaignRepository = makeCampaignRepo();
    const clientRepository = makeClientRepo({
      findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
    });

    const result = await createCampaignDraft(baseInput, {
      campaignRepository,
      clientRepository,
      logger: mockLogger,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(campaignRepository.create).not.toHaveBeenCalled();
  });

  it('propaga el error del repositorio si create falla', async () => {
    const campaignRepository = makeCampaignRepo({
      create: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'db error' })),
    });
    const clientRepository = makeClientRepo();

    const result = await createCampaignDraft(baseInput, {
      campaignRepository,
      clientRepository,
      logger: mockLogger,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('llama logger.debug y logger.info en flujo exitoso', async () => {
    const campaignRepository = makeCampaignRepo();
    const clientRepository = makeClientRepo();

    await createCampaignDraft(baseInput, { campaignRepository, clientRepository, logger: mockLogger });

    expect(mockLogger.debug).toHaveBeenCalledWith('createCampaignDraft', expect.any(Object));
    expect(mockLogger.info).toHaveBeenCalledWith('createCampaignDraft: created', expect.any(Object));
  });
});
