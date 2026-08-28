import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAdsMonitorAdapter } from '../google-ads-monitor.adapter';
import type { GoogleAdsApiClient } from '../google-ads-api.client';
import { ok } from '@bop-agency/shared';
import type { ClientIntegration } from '@bop-agency/domain';
import type { LoggerPort } from '@bop-agency/application';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('GoogleAdsMonitorAdapter Unit Tests (Phase 8G.1)', () => {
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
    const adapter = new GoogleAdsMonitorAdapter({
      credentialRepository: {} as any,
      logger: makeLogger(),
    });

    expect(adapter.supports('google_ads' as any, 'google' as any)).toBe(true);
    expect(adapter.supports('facebook_organic' as any, 'meta' as any)).toBe(false);
  });

  it('observes PAUSED campaign status with primary and serving status indicators', async () => {
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-token-1' }),
    } as any;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-123' }),
      observeCampaignByResourceName: vi.fn().mockResolvedValue({
        result: {
          campaign: {
            id: '9876543210',
            resourceName: 'customers/1234567890/campaigns/9876543210',
            name: 'BOP-job-target',
            status: 'PAUSED',
            servingStatus: 'SERVING',
            primaryStatus: 'PAUSED',
            primaryStatusReasons: ['CAMPAIGN_PAUSED'],
          },
        },
        requestId: 'req-obs-1',
      }),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-1',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      externalId: 'customers/1234567890/campaigns/9876543210',
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('observed');
      expect(result.value.resourceStatus).toBe('PAUSED');
      expect(result.value.servingStatus).toBe('SERVING');
      expect(result.value.primaryStatus).toBe('PAUSED');
      expect(result.value.primaryStatusReasons).toEqual(['CAMPAIGN_PAUSED']);
    }

    expect(mockApiClient.observeCampaignByResourceName).toHaveBeenCalledWith({
      customerId: '1234567890',
      managerCustomerId: '1111111111',
      accessToken: 'access-123',
      resourceName: 'customers/1234567890/campaigns/9876543210',
    });
  });

  it('observes ENABLED status without performing any provider write mutation', async () => {
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-token-1' }),
    } as any;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-123' }),
      observeCampaignByResourceName: vi.fn().mockResolvedValue({
        result: {
          campaign: {
            id: '9876543210',
            resourceName: 'customers/1234567890/campaigns/9876543210',
            name: 'BOP-job-target',
            status: 'ENABLED',
            servingStatus: 'SERVING',
            primaryStatus: 'ELIGIBLE',
            primaryStatusReasons: [],
          },
        },
        requestId: 'req-obs-enabled',
      }),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-1',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      externalId: 'customers/1234567890/campaigns/9876543210',
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('observed');
      expect(result.value.resourceStatus).toBe('ENABLED');
    }
  });

  it('returns availability not_found when campaign is deleted or missing on provider', async () => {
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-token-1' }),
    } as any;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-123' }),
      observeCampaignByResourceName: vi.fn().mockResolvedValue({
        result: null,
        requestId: 'req-obs-null',
      }),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-1',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      externalId: 'customers/1234567890/campaigns/9876543210',
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('not_found');
    }
  });

  it('returns unavailable INTEGRATION_NOT_AVAILABLE if integration is drifted or inactive', async () => {
    const driftedIntegration = {
      ...mockIntegration,
      externalAccountId: '9999999999', // Account ID mismatch
    };

    const adapter = new GoogleAdsMonitorAdapter({
      clientRepository: makeClientRepo([driftedIntegration]),
      credentialRepository: {} as any,
      logger: makeLogger(),
    });

    const result = await adapter.observe({
      jobId: 'job-1',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      externalId: 'customers/1234567890/campaigns/9876543210',
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('unavailable');
      expect(result.value.unavailabilityReason).toBe('INTEGRATION_NOT_AVAILABLE');
    }
  });

  it('returns unavailable PROVIDER_QUERY_FAILED on HTTP 500 / 503 / 429 query errors', async () => {
    const credentialRepository = {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({ refreshToken: 'ref-token-1' }),
    } as any;

    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-123' }),
      observeCampaignByResourceName: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')),
    } as unknown as GoogleAdsApiClient;

    const adapter = new GoogleAdsMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-1',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'google_ads' as any,
      provider: 'google' as any,
      externalId: 'customers/1234567890/campaigns/9876543210',
      clientIntegrationId: 'integ-1',
      attemptMetadata: validAttemptMetadata,
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('unavailable');
      expect(result.value.unavailabilityReason).toBe('PROVIDER_QUERY_FAILED');
    }
  });
});
