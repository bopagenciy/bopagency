import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAdsReconcilerAdapter } from '../google-ads-reconciler.adapter';
import type { GoogleAdsApiClient } from '../google-ads-api.client';
import { ok } from '@bop-agency/shared';
import type { ClientIntegration } from '@bop-agency/domain';
import type { LoggerPort } from '@bop-agency/application';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('GoogleAdsReconcilerAdapter Unit Tests (Phase 8G.0)', () => {
  const originalEnv = process.env;

  const validTargetResource = {
    clientIntegrationId: 'integ-1',
    customerId: '1234567890',
    managerCustomerId: '1111111111',
    currencyCode: 'USD',
    isManager: false,
  };

  const validAttemptMetadata = {
    customerId: '1234567890',
    managerCustomerId: '1111111111',
    correlationName: 'BOP-11111111-1111-1111-1111-111111111111-target1',
  };

  const mockIntegration: ClientIntegration = {
    id: 'integ-1' as any,
    organizationId: 'org-1' as any,
    clientId: 'client-1' as any,
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

  function makeClientRepo(integrations: ClientIntegration[] = [mockIntegration]) {
    return {
      listIntegrations: vi.fn().mockResolvedValue(ok(integrations)),
    } as any;
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
    const adapter = new GoogleAdsReconcilerAdapter({
      activationRepository: {} as any,
      clientRepository: makeClientRepo(),
      credentialRepository: {} as any,
      logger: makeLogger(),
    });

    expect(adapter.supports('google_ads' as any, 'google' as any)).toBe(true);
    expect(adapter.supports('facebook_organic' as any, 'meta' as any)).toBe(false);
  });

  it('returns confirmed_not_published when GAQL search returns 0 matches for exact correlation name', async () => {
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-token-1' }),
    } as any;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-123' }),
      searchCampaignByExactName: vi.fn().mockResolvedValue({
        results: [],
        requestId: 'req-search-0',
      }),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsReconcilerAdapter({
      activationRepository: {} as any,
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.reconcile({
      jobId: '11111111-1111-1111-1111-111111111111',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('confirmed_not_published');
      expect(result.value.metadata?.['matchCount']).toBe(0);
    }

    expect(mockApiClient.searchCampaignByExactName).toHaveBeenCalledWith({
      customerId: '1234567890',
      managerCustomerId: '1111111111',
      accessToken: 'access-123',
      exactCorrelationName: 'BOP-11111111-1111-1111-1111-111111111111-target1',
    });
  });

  it('returns confirmed_published when GAQL search returns exactly 1 match', async () => {
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-token-1' }),
    } as any;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-123' }),
      searchCampaignByExactName: vi.fn().mockResolvedValue({
        results: [
          {
            campaign: {
              id: '9876543210',
              resourceName: 'customers/1234567890/campaigns/9876543210',
              name: 'BOP-11111111-1111-1111-1111-111111111111-target1',
              status: 'PAUSED',
            },
          },
        ],
        requestId: 'req-search-1',
      }),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsReconcilerAdapter({
      activationRepository: {} as any,
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.reconcile({
      jobId: '11111111-1111-1111-1111-111111111111',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('confirmed_published');
      expect(result.value.externalId).toBe('customers/1234567890/campaigns/9876543210');
      expect(result.value.metadata?.['campaignId']).toBe('9876543210');
      expect(result.value.metadata?.['campaignStatus']).toBe('PAUSED');
      expect(result.value.metadata?.['matchCount']).toBe(1);
    }
  });

  it('returns unresolved when GAQL search returns >1 exact matches (ambiguous)', async () => {
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-token-1' }),
    } as any;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-123' }),
      searchCampaignByExactName: vi.fn().mockResolvedValue({
        results: [
          { campaign: { id: '1', resourceName: 'res/1', name: 'BOP-11111111-1111-1111-1111-111111111111-target1', status: 'PAUSED' } },
          { campaign: { id: '2', resourceName: 'res/2', name: 'BOP-11111111-1111-1111-1111-111111111111-target1', status: 'PAUSED' } },
        ],
        requestId: 'req-search-2',
      }),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsReconcilerAdapter({
      activationRepository: {} as any,
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.reconcile({
      jobId: '11111111-1111-1111-1111-111111111111',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('unresolved');
      expect(result.value.unresolvedReason).toBe('MULTIPLE_EXACT_MATCHES');
    }
  });

  it('returns unresolved with AUTH_EXPIRED when refresh token is missing or token refresh fails', async () => {
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue(null),
    } as any;

    const adapter = new GoogleAdsReconcilerAdapter({
      activationRepository: {} as any,
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
    });

    const result = await adapter.reconcile({
      jobId: '11111111-1111-1111-1111-111111111111',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('unresolved');
      expect(result.value.unresolvedReason).toBe('AUTH_EXPIRED');
    }
  });

  it('returns unresolved with INTEGRATION_NOT_AVAILABLE if integration drifted or is inactive', async () => {
    const driftedIntegration = {
      ...mockIntegration,
      configuration: { manager_customer_id: '9999999999' }, // Drifted manager ID
    };

    const adapter = new GoogleAdsReconcilerAdapter({
      activationRepository: {} as any,
      clientRepository: makeClientRepo([driftedIntegration]),
      credentialRepository: {} as any,
      logger: makeLogger(),
    });

    const result = await adapter.reconcile({
      jobId: '11111111-1111-1111-1111-111111111111',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('unresolved');
      expect(result.value.unresolvedReason).toBe('INTEGRATION_NOT_AVAILABLE');
    }
  });

  it('returns unresolved with PROVIDER_QUERY_FAILED when GAQL search throws network/API error', async () => {
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-token-1' }),
    } as any;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-123' }),
      searchCampaignByExactName: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsReconcilerAdapter({
      activationRepository: {} as any,
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.reconcile({
      jobId: '11111111-1111-1111-1111-111111111111',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('unresolved');
      expect(result.value.unresolvedReason).toBe('PROVIDER_QUERY_FAILED');
    }
  });
});
