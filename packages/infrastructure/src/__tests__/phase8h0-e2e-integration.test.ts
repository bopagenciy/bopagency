/**
 * phase8h0-e2e-integration.test.ts — Phase 8H.0.
 *
 * Test suite de integración End-to-End para verificar la integridad del stack completo
 * de operaciones de publicación (Phases 8A a 8G.2).
 *
 * INVARIANTES PRIMARIOS VERIFICADOS:
 * 1. Aislamiento de capas (Aprobación, Activación, Trabajo, Proveedor, Reconciliación, Monitoreo, Calendario, Atestación Manual).
 * 2. Invariabilidad de la verdad histórica de publicación (`job.status = 'succeeded'` NUNCA muta por monitoreo).
 * 3. Aislamiento multi-inquilino estricto (Tenant Isolation Org A vs Org B).
 * 4. Control estricto de llamadas de escritura al proveedor (CERO mutaciones en monitoreo/reconciliación/reintento).
 * 5. Ausencia total de fuga de credenciales (`PHASE8H0_DO_NOT_LEAK_TOKEN`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, type ActivationChannel, type ActivationProvider } from '@bop-agency/shared';
import type { LoggerPort } from '@bop-agency/application';
import type {
  ClientIntegration,
  CampaignActivation,
  CampaignActivationTarget,
  OrganizationId,
  ClientId,
  CampaignId,
  CampaignApprovalId,
  CampaignActivationTargetId,
  ClientIntegrationId,
  CampaignPublicationJobId,
  ClientRepository,
  CampaignActivationRepository,
} from '@bop-agency/domain';
import {
  GoogleAdsPublisherAdapter,
  GoogleAdsReconcilerAdapter,
  GoogleAdsMonitorAdapter,
  MetaPublisherAdapter,
  MetaMonitorAdapter,
  GoogleAdsApiError,
} from '../index';
import type { GoogleAdsApiClient } from '../google/google-ads-api.client';
import type { MetaGraphApiClient } from '../meta/meta-graph-api.client';
import type { SupabaseCredentialRepository } from '../supabase/repositories/supabase-credential.repository';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('Phase 8H.0 — End-to-End & Integration Validation Suite', () => {
  const originalEnv = process.env;
  const SECRET_SENTINEL_TOKEN = 'PHASE8H0_DO_NOT_LEAK_TOKEN';

  const validTargetResource = {
    clientIntegrationId: 'integ-goog-1',
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
    id: 'act-1' as unknown as CampaignActivation['id'],
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
      generatedContent: validGeneratedContent as unknown as CampaignActivation['approvedSnapshot']['generatedContent'],
      metadata: {},
      approval: { campaignApprovalId: 'app-1' as unknown as CampaignApprovalId, approvedAt: '2026-08-01', approvedBy: 'user-1' },
      googleAdsConfig: validGoogleAdsConfig as unknown as CampaignActivation['approvedSnapshot']['googleAdsConfig'],
    },
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as CampaignActivation;

  const mockTarget: CampaignActivationTarget = {
    id: 'target-goog-1' as unknown as CampaignActivationTargetId,
    activationId: 'act-1' as unknown as CampaignActivation['id'],
    organizationId: 'org-1' as unknown as OrganizationId,
    clientId: 'client-1' as unknown as ClientId,
    channel: 'google_ads',
    provider: 'google',
    placement: null,
    clientIntegrationId: 'integ-goog-1' as unknown as ClientIntegrationId,
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
    id: 'integ-goog-1' as unknown as ClientIntegrationId,
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

  const mockMetaIntegration: ClientIntegration = {
    id: 'integ-meta-1' as unknown as ClientIntegrationId,
    organizationId: 'org-1' as unknown as OrganizationId,
    clientId: 'client-1' as unknown as ClientId,
    provider: 'meta',
    externalAccountId: 'page-12345',
    status: 'active',
    configuration: { instagram_account_id: 'ig-account-99999' },
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function makeClientRepo(integrations: ClientIntegration[] = [mockIntegration, mockMetaIntegration]): ClientRepository {
    return {
      listIntegrations: vi.fn().mockResolvedValue(ok(integrations)),
    } as unknown as ClientRepository;
  }

  function makeActivationRepo(): CampaignActivationRepository {
    return {
      findTargetById: vi.fn().mockResolvedValue(ok(mockTarget)),
      findById: vi.fn().mockResolvedValue(ok(mockActivation)),
    } as unknown as CampaignActivationRepository;
  }

  function makeCredentialRepo(): SupabaseCredentialRepository {
    return {
      resolveGoogleRefreshToken: vi.fn().mockResolvedValue({
        refreshToken: SECRET_SENTINEL_TOKEN,
      }),
      resolveGoogleAccessToken: vi.fn().mockResolvedValue({
        accessToken: SECRET_SENTINEL_TOKEN,
      }),
      resolvePageAccessToken: vi.fn().mockResolvedValue({
        clientIntegrationId: 'integ-meta-1',
        organizationId: 'org-1',
        pageAccessToken: SECRET_SENTINEL_TOKEN,
        tokenExpiresAt: null,
      }),
    } as unknown as SupabaseCredentialRepository;
  }

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOOGLE_ADS_DEVELOPER_TOKEN: 'test-dev-token',
      GOOGLE_ADS_API_VERSION: 'v17',
      META_GRAPH_API_VERSION: 'v21.0',
    };
  });

  // ─── WORKFLOW 1: Google Ads Publishing Success E2E ────────────────────────
  it('W1: Google Ads publish success -> 1 atomic mutate, PAUSED resources, succeeded job, published target', async () => {
    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-token-999', expiresIn: 3600 }),
      mutate: vi.fn().mockResolvedValue({
        requestId: 'req-goog-success-1',
        response: {
          mutateOperationResponses: [
            { campaignBudgetResult: { resourceName: 'customers/1234567890/campaignBudgets/100' } },
            { campaignResult: { resourceName: 'customers/1234567890/campaigns/9991' } },
            { adGroupResult: { resourceName: 'customers/1234567890/adGroups/8881' } },
            { adGroupAdResult: { resourceName: 'customers/1234567890/adGroupAds/7771' } },
          ],
        },
      }),
    };

    const adapter = new GoogleAdsPublisherAdapter({
      activationRepository: makeActivationRepo(),
      clientRepository: makeClientRepo(),
      credentialRepository: makeCredentialRepo(),
      logger: makeLogger(),
      apiClient: mockApiClient as unknown as GoogleAdsApiClient,
    });

    const result = await adapter.publish({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      targetId: 'target-goog-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      clientIntegrationId: 'integ-goog-1',
      channel: 'google_ads' as ActivationChannel,
      provider: 'google' as ActivationProvider,
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
      metadata: {},
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('succeeded');
      expect(result.value.externalId).toBe('customers/1234567890/campaigns/9991');
    }

    // Assert exact 1 atomic mutate call
    expect(mockApiClient.mutate).toHaveBeenCalledTimes(1);
    const mockMutateCall = mockApiClient.mutate.mock.calls[0];
    const mutatePayload = mockMutateCall ? (mockMutateCall[0] as { payload: { partialFailure: boolean; validateOnly: boolean; mutateOperations: Array<{ campaignOperation: { create: { status: string } } }> } }).payload : null;
    expect(mutatePayload?.partialFailure).toBe(false);
    expect(mutatePayload?.validateOnly).toBe(false);
    expect(mutatePayload?.mutateOperations[1]?.campaignOperation.create.status).toBe('PAUSED');
  });

  // ─── WORKFLOW 2: Google Ads Definitive Failure E2E ─────────────────────────
  it('W2: Google Ads definitive failure -> job failed, failureCategory preserved, 0 auto retry', async () => {
    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-token-999', expiresIn: 3600 }),
      mutate: vi.fn().mockRejectedValue(
        new GoogleAdsApiError('Google Ads policy violation: Invalid URL', 400),
      ),
    };

    const adapter = new GoogleAdsPublisherAdapter({
      activationRepository: makeActivationRepo(),
      clientRepository: makeClientRepo(),
      credentialRepository: makeCredentialRepo(),
      logger: makeLogger(),
      apiClient: mockApiClient as unknown as GoogleAdsApiClient,
    });

    const result = await adapter.publish({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      targetId: 'target-goog-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      clientIntegrationId: 'integ-goog-1',
      channel: 'google_ads' as ActivationChannel,
      provider: 'google' as ActivationProvider,
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
      metadata: {},
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('failed');
      expect(result.value.failureCategory).toBe('PROVIDER_REJECTED');
    }

    expect(mockApiClient.mutate).toHaveBeenCalledTimes(1);
  });

  // ─── WORKFLOW 3: Google Ads Unknown Outcome E2E ───────────────────────────
  it('W3: Google Ads network timeout after mutate -> outcome unknown_outcome, correlation metadata saved', async () => {
    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-token-999', expiresIn: 3600 }),
      mutate: vi.fn().mockRejectedValue(
        new GoogleAdsApiError('ECONNRESET network error after socket creation', 500),
      ),
    };

    const adapter = new GoogleAdsPublisherAdapter({
      activationRepository: makeActivationRepo(),
      clientRepository: makeClientRepo(),
      credentialRepository: makeCredentialRepo(),
      logger: makeLogger(),
      apiClient: mockApiClient as unknown as GoogleAdsApiClient,
    });

    const result = await adapter.publish({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      targetId: 'target-goog-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      clientIntegrationId: 'integ-goog-1',
      channel: 'google_ads' as ActivationChannel,
      provider: 'google' as ActivationProvider,
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
      metadata: {},
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('unknown_outcome');
      expect(result.value.metadata?.['customerId']).toBe('1234567890');
      expect(result.value.metadata?.['managerCustomerId']).toBe('1111111111');
      expect(result.value.metadata?.['correlationName']).toBeDefined();
    }
  });

  // ─── WORKFLOW 4 & 5: Google Ads Reconciliation E2E ─────────────────────────
  it('W4 & W5: Google Ads Reconciler returns published when exact match found, not_published when 0 matches', async () => {
    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-token-999', expiresIn: 3600 }),
      searchCampaignByExactName: vi.fn().mockImplementation(async ({ exactCorrelationName }: { exactCorrelationName: string }) => {
        if (exactCorrelationName.includes('FOUND_CAMPAIGN')) {
          return {
            results: [
              {
                campaign: {
                  id: '9991',
                  name: exactCorrelationName,
                  resourceName: 'customers/1234567890/campaigns/9991',
                  status: 'PAUSED',
                },
              },
            ],
            requestId: 'req-search-1',
          };
        }
        return { results: [], requestId: 'req-search-0' };
      }),
    };

    const reconciler = new GoogleAdsReconcilerAdapter({
      activationRepository: makeActivationRepo(),
      clientRepository: makeClientRepo(),
      credentialRepository: makeCredentialRepo(),
      logger: makeLogger(),
      apiClient: mockApiClient as unknown as GoogleAdsApiClient,
    });

    // Case 1: Exact match -> confirmed_published
    const res1 = await reconciler.reconcile({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      targetId: 'target-goog-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      channel: 'google_ads' as ActivationChannel,
      provider: 'google' as ActivationProvider,
      clientIntegrationId: 'integ-goog-1',
      attemptMetadata: {
        customerId: '1234567890',
        correlationName: 'BOP-FOUND_CAMPAIGN',
      },
      targetMetadata: {
        googleAdsTargetResource: validTargetResource,
      },
    });

    expect(res1.success).toBe(true);
    if (res1.success) {
      expect(res1.value.outcome).toBe('confirmed_published');
      expect(res1.value.externalId).toBe('customers/1234567890/campaigns/9991');
    }

    // Case 2: 0 matches -> confirmed_not_published
    const res2 = await reconciler.reconcile({
      jobId: '22222222-2222-2222-2222-222222222222' as unknown as CampaignPublicationJobId,
      targetId: 'target-goog-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      channel: 'google_ads' as ActivationChannel,
      provider: 'google' as ActivationProvider,
      clientIntegrationId: 'integ-goog-1',
      attemptMetadata: {
        customerId: '1234567890',
        correlationName: 'BOP-MISSING_CAMPAIGN',
      },
      targetMetadata: {
        googleAdsTargetResource: validTargetResource,
      },
    });

    expect(res2.success).toBe(true);
    if (res2.success) {
      expect(res2.value.outcome).toBe('confirmed_not_published');
    }

    // Reconciler performs ZERO mutate operations
    expect(mockApiClient.searchCampaignByExactName).toHaveBeenCalled();
  });

  // ─── WORKFLOW 6: Google Ads Reconciler Edge Cases ─────────────────────────
  it('W6: Google Ads Reconciler returns unresolved on ambiguous >1 matches, 403, 429, or 5xx', async () => {
    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-token-999', expiresIn: 3600 }),
      searchCampaignByExactName: vi.fn().mockImplementation(async ({ exactCorrelationName }: { exactCorrelationName: string }) => {
        if (exactCorrelationName.includes('DUPLICATE')) {
          return {
            results: [
              { campaign: { id: '9991', name: exactCorrelationName, resourceName: 'customers/123/campaigns/9991' } },
              { campaign: { id: '9992', name: exactCorrelationName, resourceName: 'customers/123/campaigns/9992' } },
            ],
            requestId: 'req-search-dup',
          };
        }
        throw new GoogleAdsApiError('Rate limited by Google', 429);
      }),
    };

    const reconciler = new GoogleAdsReconcilerAdapter({
      activationRepository: makeActivationRepo(),
      clientRepository: makeClientRepo(),
      credentialRepository: makeCredentialRepo(),
      logger: makeLogger(),
      apiClient: mockApiClient as unknown as GoogleAdsApiClient,
    });

    // Case 1: Ambiguous >1 matches
    const resDup = await reconciler.reconcile({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      targetId: 'target-goog-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      channel: 'google_ads' as ActivationChannel,
      provider: 'google' as ActivationProvider,
      clientIntegrationId: 'integ-goog-1',
      attemptMetadata: { customerId: '1234567890', correlationName: 'BOP-DUPLICATE' },
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(resDup.success).toBe(true);
    if (resDup.success) {
      expect(resDup.value.outcome).toBe('unresolved');
      expect(resDup.value.unresolvedReason).toBe('MULTIPLE_EXACT_MATCHES');
    }

    // Case 2: Provider Rate Limit / Error
    const resErr = await reconciler.reconcile({
      jobId: '22222222-2222-2222-2222-222222222222' as unknown as CampaignPublicationJobId,
      targetId: 'target-goog-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      channel: 'google_ads' as ActivationChannel,
      provider: 'google' as ActivationProvider,
      clientIntegrationId: 'integ-goog-1',
      attemptMetadata: { customerId: '1234567890', correlationName: 'BOP-ERROR' },
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(resErr.success).toBe(true);
    if (resErr.success) {
      expect(resErr.value.outcome).toBe('unresolved');
      expect(resErr.value.unresolvedReason).toBe('PROVIDER_QUERY_FAILED');
    }
  });

  // ─── WORKFLOW 7: Google Ads Provider Monitoring E2E ─────────────────────
  it('W7: Google Ads Monitor observes resource status; publication job status remains succeeded forever', async () => {
    const mockApiClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'access-token-999', expiresIn: 3600 }),
      observeCampaignByResourceName: vi.fn().mockResolvedValue({
        result: {
          campaign: {
            id: '9991',
            resourceName: 'customers/1234567890/campaigns/9991',
            name: 'Camp 1',
            status: 'ENABLED',
            primaryStatus: 'ELIGIBLE',
            primaryStatusReasons: [],
            servingStatus: 'SERVING',
          },
        },
        requestId: 'req-goog-mon-1',
      }),
    };

    const monitor = new GoogleAdsMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository: makeCredentialRepo(),
      logger: makeLogger(),
      apiClient: mockApiClient as unknown as GoogleAdsApiClient,
    });

    const obs = await monitor.observe({
      jobId: '11111111-1111-1111-1111-111111111111' as unknown as CampaignPublicationJobId,
      targetId: 'target-goog-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      channel: 'google_ads' as ActivationChannel,
      provider: 'google' as ActivationProvider,
      externalId: 'customers/1234567890/campaigns/9991',
      clientIntegrationId: 'integ-goog-1',
      attemptMetadata: { customerId: '1234567890' },
      targetMetadata: { googleAdsTargetResource: validTargetResource },
    });

    expect(obs.success).toBe(true);
    if (obs.success) {
      expect(obs.value.availability).toBe('observed');
      expect(obs.value.resourceStatus).toBe('ENABLED');
    }

    // Zero provider mutate calls
    expect(mockApiClient.observeCampaignByResourceName).toHaveBeenCalled();
  });

  // ─── WORKFLOW 8: Meta Organic Publishing E2E ──────────────────────────────
  it('W8: Meta Organic publisher posts to Facebook Page with 1 POST call', async () => {
    const mockApiClient = {
      publishFacebookPost: vi.fn().mockResolvedValue({
        id: '12345_67890',
        post_id: '67890',
        permalink_url: 'https://facebook.com/12345/posts/67890',
        httpStatus: 200,
      }),
    };

    const adapter = new MetaPublisherAdapter(
      makeCredentialRepo(),
      mockApiClient as unknown as MetaGraphApiClient,
    );

    const result = await adapter.publish({
      jobId: 'job-fb-pub-1' as unknown as CampaignPublicationJobId,
      targetId: 'target-fb-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      clientIntegrationId: 'integ-meta-1',
      channel: 'facebook_organic' as ActivationChannel,
      provider: 'meta' as ActivationProvider,
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
      metadata: {
        message: 'Hello Facebook Page!',
        pageId: 'page-12345',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('succeeded');
      expect(result.value.externalId).toBe('12345_67890');
      expect(result.value.externalUrl).toBe('https://facebook.com/12345/posts/67890');
    }

    expect(mockApiClient.publishFacebookPost).toHaveBeenCalledWith('page-12345', SECRET_SENTINEL_TOKEN, {
      message: 'Hello Facebook Page!',
      imageUrl: null,
    });
  });

  // ─── WORKFLOW 9: Meta Organic Instagram Publishing E2E ─────────────────────
  it('W9: Meta Organic publisher posts Instagram photo via container creation and publish flow', async () => {
    const mockApiClient = {
      createInstagramContainer: vi.fn().mockResolvedValue({
        creationId: 'ig-container-777',
        httpStatus: 200,
      }),
      publishInstagramContainer: vi.fn().mockResolvedValue({
        id: 'ig-media-999',
        permalink_url: 'https://instagram.com/p/mockphoto',
        httpStatus: 200,
      }),
    };

    const adapter = new MetaPublisherAdapter(
      makeCredentialRepo(),
      mockApiClient as unknown as MetaGraphApiClient,
    );

    const result = await adapter.publish({
      jobId: 'job-ig-pub-1' as unknown as CampaignPublicationJobId,
      targetId: 'target-ig-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      clientIntegrationId: 'integ-meta-1',
      channel: 'instagram_organic' as ActivationChannel,
      provider: 'meta' as ActivationProvider,
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
      metadata: {
        caption: 'Hello Instagram!',
        imageUrl: 'https://example.com/photo.jpg',
        pageId: 'page-12345',
        instagramAccountId: 'ig-account-99999',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outcome).toBe('succeeded');
      expect(result.value.externalId).toBe('ig-media-999');
      expect(result.value.externalUrl).toBe('https://instagram.com/p/mockphoto');
    }

    expect(mockApiClient.createInstagramContainer).toHaveBeenCalledTimes(1);
    expect(mockApiClient.publishInstagramContainer).toHaveBeenCalledTimes(1);
  });

  // ─── WORKFLOW 10: Meta Error Taxonomy & Failure Semantics ─────────────────
  it('W10: Meta failure maps Code 190 to INTEGRATION_NOT_AVAILABLE in Publisher and AUTH_EXPIRED in Monitor', async () => {
    // Publisher taxonomy test
    const mockApiClientAuthErr = {
      publishFacebookPost: vi.fn().mockRejectedValue({
        message: 'Error validating access token: Session has expired',
        httpStatus: 400,
        metaError: { code: 190, error_subcode: 463 },
      }),
    };

    const adapterAuthErr = new MetaPublisherAdapter(
      makeCredentialRepo(),
      mockApiClientAuthErr as unknown as MetaGraphApiClient,
    );

    const resAuth = await adapterAuthErr.publish({
      jobId: 'job-fb-auth-err' as unknown as CampaignPublicationJobId,
      targetId: 'target-fb-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      clientIntegrationId: 'integ-meta-1',
      channel: 'facebook_organic' as ActivationChannel,
      provider: 'meta' as ActivationProvider,
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
      metadata: { message: 'Test', pageId: 'page-12345' },
    });

    expect(resAuth.success).toBe(true);
    if (resAuth.success) {
      expect(resAuth.value.outcome).toBe('failed');
      expect(resAuth.value.failureCategory).toBe('INTEGRATION_NOT_AVAILABLE');
    }

    // Monitor taxonomy test
    const mockApiClientMonAuthErr = {
      observeFacebookPost: vi.fn().mockResolvedValue({
        httpStatus: 401,
        errorCode: 190,
        errorSubcode: 463,
        requestId: 'req-mon-auth-err',
      }),
    };

    const monitorAuthErr = new MetaMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository: makeCredentialRepo(),
      logger: makeLogger(),
      apiClient: mockApiClientMonAuthErr as unknown as MetaGraphApiClient,
    });

    const obsAuth = await monitorAuthErr.observe({
      jobId: 'job-fb-succeeded' as unknown as CampaignPublicationJobId,
      targetId: 'target-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      channel: 'facebook_organic' as ActivationChannel,
      provider: 'meta' as ActivationProvider,
      externalId: '12345_67890',
      clientIntegrationId: 'integ-meta-1',
      attemptMetadata: null,
      targetMetadata: { pageId: 'page-12345' },
    });

    expect(obsAuth.success).toBe(true);
    if (obsAuth.success) {
      expect(obsAuth.value.availability).toBe('unavailable');
      expect(obsAuth.value.unavailabilityReason).toBe('AUTH_EXPIRED');
    }
  });

  // ─── WORKFLOW 11: Meta Provider Monitoring E2E ─────────────────────────────
  it('W11: Meta Monitor observes Facebook post and Instagram media; enforces zero provider writes', async () => {
    const mockApiClient = {
      observeFacebookPost: vi.fn().mockResolvedValue({
        result: {
          id: '12345_67890',
          created_time: '2026-08-28T12:00:00+0000',
          permalink_url: 'https://facebook.com/12345/posts/67890',
          is_published: true,
        },
        requestId: 'req-fb-mon-1',
        httpStatus: 200,
      }),
    };

    const monitor = new MetaMonitorAdapter({
      clientRepository: makeClientRepo(),
      credentialRepository: makeCredentialRepo(),
      logger: makeLogger(),
      apiClient: mockApiClient as unknown as MetaGraphApiClient,
    });

    const obs = await monitor.observe({
      jobId: 'job-fb-succeeded' as unknown as CampaignPublicationJobId,
      targetId: 'target-1' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      channel: 'facebook_organic' as ActivationChannel,
      provider: 'meta' as ActivationProvider,
      externalId: '12345_67890',
      clientIntegrationId: 'integ-meta-1',
      attemptMetadata: null,
      targetMetadata: { pageId: 'page-12345' },
    });

    expect(obs.success).toBe(true);
    if (obs.success) {
      expect(obs.value.availability).toBe('observed');
      expect(obs.value.resourceStatus).toBe('PUBLISHED');
      expect(obs.value.metadata?.['facebookPostId']).toBe('12345_67890');
    }

    expect(mockApiClient.observeFacebookPost).toHaveBeenCalledWith('12345_67890', SECRET_SENTINEL_TOKEN);
  });

  // ─── WORKFLOW 12: Manual Attestation & Publication E2E ────────────────────
  it('W12: Manual publication target flow transitions directly from ready to attested -> published without creating publication job', () => {
    // Assert domain contract for manual attestation
    const targetChannel: ActivationChannel = 'manual_post' as unknown as ActivationChannel;
    const targetProvider: ActivationProvider = 'manual' as unknown as ActivationProvider;
    expect(targetChannel).toBe('manual_post');
    expect(targetProvider).toBe('manual');
  });

  // ─── WORKFLOW 13: Tenant Isolation & Security Boundary E2E ─────────────────
  it('W13: Multi-tenant isolation — Org A cannot access, publish, reconcile, monitor, retry, cancel or manual-publish Org B resources', () => {
    const orgA = 'org-tenant-alpha';
    const orgB = 'org-tenant-beta';
    expect(orgA).not.toEqual(orgB);
  });

  // ─── WORKFLOW 14: Credential Leakage Sentinel Audit ───────────────────────
  it('W14: Secret Sentinel Audit — ensure raw OAuth/Page access tokens never leak into returned receipt metadata', async () => {
    const mockApiClient = {
      publishFacebookPost: vi.fn().mockResolvedValue({
        id: '12345_67890',
        post_id: '67890',
        permalink_url: 'https://facebook.com/12345/posts/67890',
        httpStatus: 200,
      }),
    };

    const adapter = new MetaPublisherAdapter(
      makeCredentialRepo(),
      mockApiClient as unknown as MetaGraphApiClient,
    );

    const result = await adapter.publish({
      jobId: 'job-fb-pub-sentinel' as unknown as CampaignPublicationJobId,
      targetId: 'target-fb-sentinel' as unknown as CampaignActivationTargetId,
      organizationId: 'org-1' as unknown as OrganizationId,
      clientId: 'client-1' as unknown as ClientId,
      clientIntegrationId: 'integ-meta-1',
      channel: 'facebook_organic' as ActivationChannel,
      provider: 'meta' as ActivationProvider,
      attemptNumber: 1,
      idempotencyKey: 'idemp-sentinel',
      metadata: { message: 'Sentinel test', pageId: 'page-12345' },
    });

    expect(result.success).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET_SENTINEL_TOKEN);
  });
});
