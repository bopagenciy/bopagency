import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCampaign } from '../get-campaign.use-case';
import { ok, err, isOk, isErr } from '@bop-agency/shared';
import type { LoggerPort } from '../../../ports/logger.port';
import type { Campaign, CampaignRepository } from '@bop-agency/domain';
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

describe('getCampaign use case', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna la campaña cuando existe en la organización', async () => {
    const campaignRepository = makeCampaignRepo();

    const result = await getCampaign(
      { campaignId: 'campaign_1' as Campaign['id'], organizationId: 'org_1' as OrganizationId },
      { campaignRepository, logger: mockLogger },
    );

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.id).toBe('campaign_1');
    }
    expect(campaignRepository.findById).toHaveBeenCalledWith('campaign_1', 'org_1');
  });

  it('propaga NOT_FOUND cuando la campaña no existe o es de otra organización', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
    });

    const result = await getCampaign(
      { campaignId: 'campaign_x' as Campaign['id'], organizationId: 'org_1' as OrganizationId },
      { campaignRepository, logger: mockLogger },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('llama logger.debug', async () => {
    const campaignRepository = makeCampaignRepo();

    await getCampaign(
      { campaignId: 'campaign_1' as Campaign['id'], organizationId: 'org_1' as OrganizationId },
      { campaignRepository, logger: mockLogger },
    );

    expect(mockLogger.debug).toHaveBeenCalledWith('getCampaign', expect.any(Object));
  });
});
