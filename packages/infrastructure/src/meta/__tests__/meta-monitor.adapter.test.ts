import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaMonitorAdapter } from '../meta-monitor.adapter';
import type { MetaGraphApiClient } from '../meta-graph-api.client';
import { ok } from '@bop-agency/shared';
import type { ClientIntegration, OrganizationId, ClientId, ClientIntegrationId, ClientRepository } from '@bop-agency/domain';
import type { SupabaseCredentialRepository } from '../../supabase/repositories/supabase-credential.repository';
import type { LoggerPort } from '@bop-agency/application';
import type { ActivationChannel, ActivationProvider } from '@bop-agency/shared';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('MetaMonitorAdapter Unit Tests (Phase 8G.2 Hardened Gate)', () => {
  const mockIntegration: ClientIntegration = {
    id: 'integ-meta-1' as unknown as ClientIntegrationId,
    organizationId: 'org-1' as unknown as OrganizationId,
    clientId: 'client-1' as unknown as ClientId,
    provider: 'meta',
    externalAccountId: 'page-12345',
    status: 'active',
    configuration: {
      instagram_account_id: 'ig-account-99999',
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
  });

  it('supports channel facebook_organic and instagram_organic with provider meta', () => {
    const adapter = new MetaMonitorAdapter({
      credentialRepository: {} as unknown as SupabaseCredentialRepository,
      logger: makeLogger(),
      apiClient: {} as unknown as MetaGraphApiClient,
    });

    expect(adapter.supports('facebook_organic', 'meta')).toBe(true);
    expect(adapter.supports('instagram_organic', 'meta')).toBe(true);
    expect(adapter.supports('google_ads', 'google')).toBe(false);
  });

  it('rejects malformed external ID format before making provider API calls', async () => {
    const adapter = new MetaMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository: {} as unknown as SupabaseCredentialRepository,
      logger: makeLogger(),
      apiClient: {} as unknown as MetaGraphApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-1',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'facebook_organic' as unknown as ActivationChannel,
      provider: 'meta' as unknown as ActivationProvider,
      externalId: 'invalid/id/injection',
      clientIntegrationId: 'integ-meta-1',
      attemptMetadata: null,
      targetMetadata: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('unavailable');
      expect(result.value.unavailabilityReason).toBe('PROVIDER_QUERY_FAILED');
    }
  });

  it('observes Facebook post state (PUBLISHED) when query succeeds', async () => {
    const credentialRepository = {
      resolvePageAccessToken: vi.fn().mockResolvedValue({ pageAccessToken: 'secret-page-token-123' }),
    } as unknown as SupabaseCredentialRepository;

    const mockApiClient = {
      observeFacebookPost: vi.fn().mockResolvedValue({
        result: {
          id: '12345_67890',
          created_time: '2026-08-28T12:00:00+0000',
          permalink_url: 'https://facebook.com/12345/posts/67890',
          is_published: true,
        },
        requestId: 'req-fb-obs-1',
        httpStatus: 200,
      }),
    } as unknown as MetaGraphApiClient;

    const adapter = new MetaMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-fb-1',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'facebook_organic' as unknown as ActivationChannel,
      provider: 'meta' as unknown as ActivationProvider,
      externalId: '12345_67890',
      clientIntegrationId: 'integ-meta-1',
      attemptMetadata: null,
      targetMetadata: { pageId: 'page-12345' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('observed');
      expect(result.value.resourceStatus).toBe('PUBLISHED');
      expect(result.value.metadata?.['facebookPostId']).toBe('12345_67890');
      // Security check: token must not be in observation metadata
      expect(JSON.stringify(result.value)).not.toContain('secret-page-token-123');
    }

    expect(mockApiClient.observeFacebookPost).toHaveBeenCalledWith('12345_67890', 'secret-page-token-123');
  });

  it('maps Facebook is_published = false to resourceStatus UNPUBLISHED (NOT not_found)', async () => {
    const credentialRepository = {
      resolvePageAccessToken: vi.fn().mockResolvedValue({ pageAccessToken: 'token-abc' }),
    } as unknown as SupabaseCredentialRepository;

    const mockApiClient = {
      observeFacebookPost: vi.fn().mockResolvedValue({
        result: {
          id: '12345_67890',
          is_published: false,
        },
        requestId: 'req-fb-unpub',
        httpStatus: 200,
      }),
    } as unknown as MetaGraphApiClient;

    const adapter = new MetaMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-fb-unpub',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'facebook_organic' as unknown as ActivationChannel,
      provider: 'meta' as unknown as ActivationProvider,
      externalId: '12345_67890',
      clientIntegrationId: 'integ-meta-1',
      attemptMetadata: null,
      targetMetadata: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('observed');
      expect(result.value.resourceStatus).toBe('UNPUBLISHED');
    }
  });

  it('maps definitive missing subcode 33 to not_found / REMOVED', async () => {
    const credentialRepository = {
      resolvePageAccessToken: vi.fn().mockResolvedValue({ pageAccessToken: 'token-abc' }),
    } as unknown as SupabaseCredentialRepository;

    const mockApiClient = {
      observeFacebookPost: vi.fn().mockResolvedValue({
        result: null,
        requestId: 'req-fb-404',
        httpStatus: 400,
        errorCode: 100,
        errorSubcode: 33,
      }),
    } as unknown as MetaGraphApiClient;

    const adapter = new MetaMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-fb-del',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'facebook_organic' as unknown as ActivationChannel,
      provider: 'meta' as unknown as ActivationProvider,
      externalId: '12345_67890',
      clientIntegrationId: 'integ-meta-1',
      attemptMetadata: null,
      targetMetadata: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('not_found');
      expect(result.value.resourceStatus).toBe('REMOVED');
    }
  });

  it('maps generic HTTP 404 WITHOUT missing subcode to PROVIDER_QUERY_FAILED (NOT not_found)', async () => {
    const credentialRepository = {
      resolvePageAccessToken: vi.fn().mockResolvedValue({ pageAccessToken: 'token-abc' }),
    } as unknown as SupabaseCredentialRepository;

    const mockApiClient = {
      observeFacebookPost: vi.fn().mockResolvedValue({
        result: null,
        requestId: 'req-generic-404',
        httpStatus: 404,
        errorCode: null,
        errorSubcode: null,
      }),
    } as unknown as MetaGraphApiClient;

    const adapter = new MetaMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-fb-gen-404',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'facebook_organic' as unknown as ActivationChannel,
      provider: 'meta' as unknown as ActivationProvider,
      externalId: '12345_67890',
      clientIntegrationId: 'integ-meta-1',
      attemptMetadata: null,
      targetMetadata: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('unavailable');
      expect(result.value.unavailabilityReason).toBe('PROVIDER_QUERY_FAILED');
    }
  });

  it('maps permission / scope access error (HTTP 403 / code 200) to INTEGRATION_NOT_AVAILABLE', async () => {
    const credentialRepository = {
      resolvePageAccessToken: vi.fn().mockResolvedValue({ pageAccessToken: 'token-abc' }),
    } as unknown as SupabaseCredentialRepository;

    const mockApiClient = {
      observeFacebookPost: vi.fn().mockResolvedValue({
        result: null,
        requestId: 'req-fb-perm',
        httpStatus: 403,
        errorCode: 200,
        errorSubcode: 200,
      }),
    } as unknown as MetaGraphApiClient;

    const adapter = new MetaMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: mockApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-fb-perm',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'facebook_organic' as unknown as ActivationChannel,
      provider: 'meta' as unknown as ActivationProvider,
      externalId: '12345_67890',
      clientIntegrationId: 'integ-meta-1',
      attemptMetadata: null,
      targetMetadata: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('unavailable');
      expect(result.value.unavailabilityReason).toBe('INTEGRATION_NOT_AVAILABLE');
    }
  });

  it('detects Instagram account ID drift and returns INTEGRATION_NOT_AVAILABLE', async () => {
    const credentialRepository = {
      resolvePageAccessToken: vi.fn().mockResolvedValue({ pageAccessToken: 'token-abc' }),
    } as unknown as SupabaseCredentialRepository;

    const adapter = new MetaMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository,
      logger: makeLogger(),
      apiClient: {} as unknown as MetaGraphApiClient,
    });

    const result = await adapter.observe({
      jobId: 'job-ig-drift',
      targetId: 'target-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      channel: 'instagram_organic' as unknown as ActivationChannel,
      provider: 'meta' as unknown as ActivationProvider,
      externalId: '17841400000000000',
      clientIntegrationId: 'integ-meta-1',
      attemptMetadata: { instagram_account_id: 'different-ig-account-11111' },
      targetMetadata: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.availability).toBe('unavailable');
      expect(result.value.unavailabilityReason).toBe('INTEGRATION_NOT_AVAILABLE');
    }
  });
});
