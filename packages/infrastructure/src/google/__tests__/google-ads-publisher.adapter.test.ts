import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAdsPublisherAdapter, toGoogleBudgetMicros } from '../google-ads-publisher.adapter';
import type { GoogleAdsApiClient } from '../google-ads-api.client';
import { ok } from '@bop-agency/shared';
import type {
  CampaignActivation,
  CampaignActivationTarget,
  CampaignActivationRepository,
  ClientIntegration,
  CampaignActivationId,
  OrganizationId,
  ClientId,
  CampaignId,
  CampaignApprovalId,
  CampaignActivationTargetId,
  ClientIntegrationId,
  CampaignPublicationJobId,
  ClientRepository,
} from '@bop-agency/domain';
import type { SupabaseCredentialRepository } from '../../supabase/repositories/supabase-credential.repository';
import type { LoggerPort } from '@bop-agency/application';
import type { ActivationChannel, ActivationProvider } from '@bop-agency/shared';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('GoogleAdsPublisherAdapter Unit Tests & Safety Matrix (Phase 8F.2)', () => {
  const originalEnv = process.env;

  const validTargetResource = {
    clientIntegrationId: 'integ-1',
    customerId: '1234567890',
    managerCustomerId: '1111111111',
    currencyCode: 'USD',
    isManager: false,
  };

  const validGoogleAdsConfig = {
    dailyBudget: { amount: 50, currency: 'USD' },
    biddingStrategy: 'MAXIMIZE_CLICKS',
    finalUrl: 'https://example.com/promo',
    geoTargetIds: ['2170'],
    languageCriterionIds: ['1003'],
    keywordMatchPolicy: 'PHRASE',
    negativeKeywordMatchPolicy: 'BROAD',
    euPoliticalAdvertisingDeclaration: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
  };

  const validGeneratedContent = {
    platform: 'google_ads',
    adGroups: [
      {
        name: 'AG-1 Main',
        theme: 'Main Concept',
        headlines: ['Headline 1', 'Headline 2', 'Headline 3'],
        descriptions: ['Description 1', 'Description 2'],
      },
    ],
    keywordSuggestions: ['digital marketing agency'],
    negativeKeywordSuggestions: ['free'],
  };

  const mockActivation: CampaignActivation = {
    id: 'act-1' as unknown as CampaignActivationId,
    organizationId: 'org-1' as unknown as OrganizationId,
    clientId: 'client-1' as unknown as ClientId,
    campaignId: 'camp-1' as unknown as CampaignId,
    campaignApprovalId: 'app-1' as unknown as CampaignApprovalId,
    status: 'ready',
    approvedSnapshot: {
      schemaVersion: 'activation-snapshot-v1',
      campaign: {
        id: 'camp-1' as unknown as CampaignId,
        name: 'Summer Campaign',
        objective: 'lead_generation',
        platform: 'google_ads',
        budget: 100,
        currency: 'USD',
        startDate: null,
        endDate: null,
      },
      generatedContent: validGeneratedContent,
      metadata: {},
      approval: { campaignApprovalId: 'app-1' as unknown as CampaignApprovalId, approvedAt: '2026-08-01', approvedBy: 'user-1' },
      googleAdsConfig: validGoogleAdsConfig,
    },
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as CampaignActivation;

  const mockTarget: CampaignActivationTarget = {
    id: 'target-1' as unknown as CampaignActivationTargetId,
    activationId: 'act-1' as unknown as CampaignActivationId,
    organizationId: 'org-1' as unknown as OrganizationId,
    clientId: 'client-1' as unknown as ClientId,
    channel: 'google_ads',
    provider: 'google',
    placement: null,
    clientIntegrationId: 'integ-1' as unknown as ClientIntegrationId,
    status: 'ready',
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
    metadata: {
      googleAdsTargetResource: validTargetResource,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockIntegration: ClientIntegration = {
    id: 'integ-1' as unknown as ClientIntegrationId,
    organizationId: 'org-1' as unknown as OrganizationId,
    clientId: 'client-1' as unknown as ClientId,
    provider: 'google',
    externalAccountId: '1234567890',
    status: 'active',
    configuration: {
      manager_customer_id: '1111111111',
      currency_code: 'USD',
      is_manager: false,
    },
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function makeClientRepo(integrations: ClientIntegration[] = [mockIntegration]): ClientRepository {
    return {
      listIntegrations: vi.fn().mockResolvedValue(ok(integrations)),
    } as unknown as ClientRepository;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      GOOGLE_ADS_API_VERSION: 'v25',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token-test',
    };
  });

  it('supports channel google_ads and provider google exclusively', () => {
    const adapter = new GoogleAdsPublisherAdapter({
      activationRepository: {} as unknown as CampaignActivationRepository,
      clientRepository: makeClientRepo(),
      credentialRepository: {} as unknown as SupabaseCredentialRepository,
      logger: makeLogger(),
    });

    expect(adapter.supports('google_ads' as unknown as ActivationChannel, 'google' as unknown as ActivationProvider)).toBe(true);
    expect(adapter.supports('meta_ads' as unknown as ActivationChannel, 'facebook' as unknown as ActivationProvider)).toBe(false);
  });

  it('converts budget amount to micros integer safely without silent rounding errors', () => {
    expect(toGoogleBudgetMicros(50)).toBe(50000000);
    expect(toGoogleBudgetMicros(50.25)).toBe(50250000);
    expect(toGoogleBudgetMicros(0.000001)).toBe(1);
    expect(() => toGoogleBudgetMicros(0.0000001)).toThrow(/micros/);
    expect(() => toGoogleBudgetMicros(0)).toThrow(/positive/);
    expect(() => toGoogleBudgetMicros(-10)).toThrow(/positive/);
    expect(() => toGoogleBudgetMicros(NaN)).toThrow(/finite/);
    expect(() => toGoogleBudgetMicros(Infinity)).toThrow(/finite/);
  });

  it('executes single atomic mutate and verifies exact payload structure (PAUSED status, no ENABLED, targetSpend {})', async () => {
    const activationRepository = {
      findById: vi.fn().mockResolvedValue(ok(mockActivation)),
      findTargetById: vi.fn().mockResolvedValue(ok(mockTarget)),
    } as unknown as CampaignActivationRepository;

    const clientRepository = makeClientRepo();
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'refresh-token-123' }),
    } as unknown as SupabaseCredentialRepository;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-token-999', expiresIn: 3600 }),
      mutate: vi.fn().mockResolvedValue({
        requestId: 'req-abc-123',
        response: {
          mutateOperationResponses: [
            { adGroupResult: { resourceName: 'customers/1234567890/adGroups/1' } },
            { campaignResult: { resourceName: 'customers/1234567890/campaigns/9876543210' } }, // Out of order campaign result test
          ],
        },
      }),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsPublisherAdapter({
      activationRepository,
      clientRepository,
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.publish({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      targetId: 'target-1' as unknown as CampaignActivationTargetId,
      channel: 'google_ads' as unknown as ActivationChannel,
      provider: 'google' as unknown as ActivationProvider,
      clientIntegrationId: 'integ-1',
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('succeeded');
      expect(result.value.externalId).toBe('customers/1234567890/campaigns/9876543210'); // Out-of-order extraction proof
      expect(result.value.externalUrl).toBeNull();
      expect(result.value.metadata?.['requestId']).toBe('req-abc-123');
    }

    expect(mockApiClient.mutate).toHaveBeenCalledOnce();
    const mutatePayload = (mockApiClient.mutate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].payload;
    expect(mutatePayload.partialFailure).toBe(false);
    expect(mutatePayload.validateOnly).toBe(false);
    expect(mutatePayload.responseContentType).toBe('RESOURCE_NAME_ONLY');

    const ops = mutatePayload.mutateOperations;
    // CampaignBudget
    const budgetOp = ops[0]?.campaignBudgetOperation?.create;
    expect(budgetOp?.amountMicros).toBe('50000000');
    expect(budgetOp?.status).toBeUndefined(); // Zero status field on budget

    // Campaign
    const campOp = ops[1]?.campaignOperation?.create;
    expect(campOp?.status).toBe('PAUSED');
    expect(campOp?.advertisingChannelType).toBe('SEARCH');
    expect(campOp?.targetSpend).toEqual({});
    expect(campOp?.biddingStrategyType).toBeUndefined();
    expect(campOp?.containsEuPoliticalAdvertising).toBe('DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING');
    expect(campOp?.networkSettings).toEqual({
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    });

    // AdGroup
    const agOp = ops[2]?.adGroupOperation?.create;
    expect(agOp?.status).toBe('PAUSED');

    // AdGroupAd
    const adOp = ops[3]?.adGroupAdOperation?.create;
    expect(adOp?.status).toBe('PAUSED');

    // Positive Keyword
    const posKwOp = ops[4]?.adGroupCriterionOperation?.create;
    expect(posKwOp?.status).toBe('PAUSED');
    expect(posKwOp?.adGroup).toBe('customers/1234567890/adGroups/-10');
    expect(posKwOp?.keyword?.text).toBe('digital marketing agency');
    expect(posKwOp?.keyword?.matchType).toBe('PHRASE');

    // Negative Keyword
    const negKwOp = ops[5]?.campaignCriterionOperation?.create;
    expect(negKwOp?.campaign).toBe('customers/1234567890/campaigns/-2');
    expect(negKwOp?.negative).toBe(true);
    expect(negKwOp?.keyword?.text).toBe('free');
    expect(negKwOp?.keyword?.matchType).toBe('BROAD');

    // Geo & Language Constants
    const geoOp = ops[6]?.campaignCriterionOperation?.create;
    expect(geoOp?.location?.geoTargetConstant).toBe('geoTargetConstants/2170');

    const langOp = ops[7]?.campaignCriterionOperation?.create;
    expect(langOp?.language?.languageConstant).toBe('languageConstants/1003');

    // Zero ENABLED status occurrences
    const payloadStr = JSON.stringify(mutatePayload);
    expect(payloadStr).not.toContain('"status":"ENABLED"');
    expect(payloadStr).not.toContain('"status": "ENABLED"');
  });

  it('accepts maximum allowed payload (164 operations) and rejects 165 operations before mutate', async () => {
    const approvedSnap = mockActivation.approvedSnapshot;
    const maxActivation = {
      ...mockActivation,
      approvedSnapshot: {
        ...approvedSnap,
        generatedContent: {
          ...validGeneratedContent,
          keywordSuggestions: Array.from({ length: 50 }, (_, i) => `pos-kw-${i}`),
          negativeKeywordSuggestions: Array.from({ length: 50 }, (_, i) => `neg-kw-${i}`),
        },
        googleAdsConfig: {
          ...validGoogleAdsConfig,
          geoTargetIds: Array.from({ length: 50 }, (_, i) => `${2000 + i}`),
          languageCriterionIds: Array.from({ length: 10 }, (_, i) => `${1000 + i}`),
        },
      },
    };

    const activationRepository = {
      findById: vi.fn().mockResolvedValue(ok(maxActivation)),
      findTargetById: vi.fn().mockResolvedValue(ok(mockTarget)),
    } as unknown as CampaignActivationRepository;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-token-999', expiresIn: 3600 }),
      mutate: vi.fn().mockResolvedValue({
        requestId: 'req-max-164',
        response: { mutateOperationResponses: [{ campaignResult: { resourceName: 'customers/1234567890/campaigns/1' } }] },
      }),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsPublisherAdapter({
      activationRepository,
      clientRepository: makeClientRepo(),
      credentialRepository: { resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-1' }) } as unknown as SupabaseCredentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.publish({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      targetId: 'target-1' as unknown as CampaignActivationTargetId,
      channel: 'google_ads' as unknown as ActivationChannel,
      provider: 'google' as unknown as ActivationProvider,
      clientIntegrationId: 'integ-1',
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
    });

    expect(result.success).toBe(true);
    expect(mockApiClient.mutate).toHaveBeenCalledOnce();
    const ops = (mockApiClient.mutate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].payload.mutateOperations;
    expect(ops.length).toBe(164); // Exactly 164 total operations

    // Now test 165 operations (e.g. 51 positive keywords) -> fails fast with INVALID_ASSET before mutate
    const maxSnap = maxActivation.approvedSnapshot;
    const maxGen = maxSnap.generatedContent as typeof validGeneratedContent;
    const overflowActivation = {
      ...maxActivation,
      approvedSnapshot: {
        ...maxSnap,
        generatedContent: {
          ...maxGen,
          keywordSuggestions: Array.from({ length: 51 }, (_, i) => `pos-kw-${i}`),
        },
      },
    };

    const overflowAdapter = new GoogleAdsPublisherAdapter({
      activationRepository: {
        findById: vi.fn().mockResolvedValue(ok(overflowActivation)),
        findTargetById: vi.fn().mockResolvedValue(ok(mockTarget)),
      } as unknown as CampaignActivationRepository,
      clientRepository: makeClientRepo(),
      credentialRepository: { resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-1' }) } as unknown as SupabaseCredentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const overflowResult = await overflowAdapter.publish({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      targetId: 'target-1' as unknown as CampaignActivationTargetId,
      channel: 'google_ads' as unknown as ActivationChannel,
      provider: 'google' as unknown as ActivationProvider,
      clientIntegrationId: 'integ-1',
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
    });

    expect(overflowResult.success).toBe(true);
    if (overflowResult.success) {
      expect(overflowResult.value.outcome).toBe('failed');
      expect(overflowResult.value.failureCategory).toBe('INVALID_ASSET');
    }
  });

  it('rejects publication when headlines <3 or >15, or descriptions <2 or >4', async () => {
    const baseSnap = mockActivation.approvedSnapshot;
    const invalidHeadlinesActivation = {
      ...mockActivation,
      approvedSnapshot: {
        ...baseSnap,
        generatedContent: {
          ...validGeneratedContent,
          adGroups: [
            { name: 'AG-1', theme: 'T1', headlines: ['H1', 'H2'], descriptions: ['D1', 'D2'] }, // Only 2 headlines
          ],
        },
      },
    };

    const adapter = new GoogleAdsPublisherAdapter({
      activationRepository: {
        findById: vi.fn().mockResolvedValue(ok(invalidHeadlinesActivation)),
        findTargetById: vi.fn().mockResolvedValue(ok(mockTarget)),
      } as unknown as CampaignActivationRepository,
      clientRepository: makeClientRepo(),
      credentialRepository: {} as unknown as SupabaseCredentialRepository,
      logger: makeLogger(),
    });

    const result = await adapter.publish({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      targetId: 'target-1' as unknown as CampaignActivationTargetId,
      channel: 'google_ads' as unknown as ActivationChannel,
      provider: 'google' as unknown as ActivationProvider,
      clientIntegrationId: 'integ-1',
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('failed');
      expect(result.value.failureCategory).toBe('INVALID_ASSET');
    }
  });

  it('rejects publication with AUTH_EXPIRED on pre-mutate token refresh failure, NEVER unknown_outcome', async () => {
    const activationRepository = {
      findById: vi.fn().mockResolvedValue(ok(mockActivation)),
      findTargetById: vi.fn().mockResolvedValue(ok(mockTarget)),
    } as unknown as CampaignActivationRepository;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockRejectedValue(new Error('Invalid refresh token')),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsPublisherAdapter({
      activationRepository,
      clientRepository: makeClientRepo(),
      credentialRepository: { resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-1' }) } as unknown as SupabaseCredentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.publish({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      targetId: 'target-1' as unknown as CampaignActivationTargetId,
      channel: 'google_ads' as unknown as ActivationChannel,
      provider: 'google' as unknown as ActivationProvider,
      clientIntegrationId: 'integ-1',
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('failed');
      expect(result.value.failureCategory).toBe('AUTH_EXPIRED');
    }
  });

  it('preserves correlationName, customerId, managerCustomerId in metadata on unknown_outcome', async () => {
    const activationRepository = {
      findById: vi.fn().mockResolvedValue(ok(mockActivation)),
      findTargetById: vi.fn().mockResolvedValue(ok(mockTarget)),
    } as unknown as CampaignActivationRepository;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-token-999', expiresIn: 3600 }),
      mutate: vi.fn().mockRejectedValue(new (await import('../google-ads-api.client')).GoogleAdsApiError('Internal server error 500', 500)),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsPublisherAdapter({
      activationRepository,
      clientRepository: makeClientRepo(),
      credentialRepository: { resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-1' }) } as unknown as SupabaseCredentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.publish({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      targetId: 'target-1' as unknown as CampaignActivationTargetId,
      channel: 'google_ads' as unknown as ActivationChannel,
      provider: 'google' as unknown as ActivationProvider,
      clientIntegrationId: 'integ-1',
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('unknown_outcome');
      expect(result.value.metadata?.['correlationName']).toBe('BOP-11111111-1111-1111-1111-111111111111-target1');
      expect(result.value.metadata?.['customerId']).toBe('1234567890');
      expect(result.value.metadata?.['managerCustomerId']).toBe('1111111111');
    }
  });
});
