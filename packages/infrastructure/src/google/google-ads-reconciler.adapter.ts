import { ok, type Result, type ActivationChannel, type ActivationProvider } from '@bop-agency/shared';
import type {
  PublicationReconcilerPort,
  ReconcileInput,
  ReconcileResult,
  LoggerPort,
} from '@bop-agency/application';
import type {
  CampaignActivationRepository,
  ClientRepository,
  GoogleAdsTargetResourceSnapshot,
} from '@bop-agency/domain';
import type { SupabaseCredentialRepository } from '../supabase/repositories/supabase-credential.repository';
import {
  GoogleAdsApiClient,
  requireGoogleAdsApiVersion,
  requireGoogleAdsDeveloperToken,
} from './google-ads-api.client';

export type GoogleAdsReconcilerAdapterDeps = {
  readonly activationRepository: CampaignActivationRepository;
  readonly clientRepository: ClientRepository;
  readonly credentialRepository: SupabaseCredentialRepository;
  readonly logger: LoggerPort;
  readonly apiClient?: GoogleAdsApiClient;
};

export class GoogleAdsReconcilerAdapter implements PublicationReconcilerPort {
  private readonly activationRepository: CampaignActivationRepository;
  private readonly clientRepository: ClientRepository;
  private readonly credentialRepository: SupabaseCredentialRepository;
  private readonly logger: LoggerPort;
  private readonly apiClientSupplier: () => GoogleAdsApiClient;

  constructor(deps: GoogleAdsReconcilerAdapterDeps) {
    this.activationRepository = deps.activationRepository;
    this.clientRepository = deps.clientRepository;
    this.credentialRepository = deps.credentialRepository;
    this.logger = deps.logger;

    if (deps.apiClient) {
      const fixedClient = deps.apiClient;
      this.apiClientSupplier = () => fixedClient;
    } else {
      this.apiClientSupplier = () =>
        new GoogleAdsApiClient(
          {
            developerToken: requireGoogleAdsDeveloperToken(),
            apiVersion: requireGoogleAdsApiVersion(),
          },
          this.logger,
        );
    }
  }

  supports(channel: ActivationChannel, provider: ActivationProvider): boolean {
    return channel === 'google_ads' && provider === 'google';
  }

  async reconcile(input: ReconcileInput): Promise<Result<ReconcileResult>> {
    this.logger.info('GoogleAdsReconcilerAdapter: initiating read-only reconciliation', {
      jobId: input.jobId,
      targetId: input.targetId,
    });

    // 1. Env Check
    try {
      requireGoogleAdsApiVersion();
      requireGoogleAdsDeveloperToken();
    } catch (envErr) {
      this.logger.warn('GoogleAdsReconcilerAdapter: missing environment configuration', { error: envErr });
      return ok({
        outcome: 'unresolved',
        unresolvedReason: 'CHANNEL_NOT_CONFIGURED',
        metadata: { message: envErr instanceof Error ? envErr.message : 'Missing Google Ads API environment configuration' },
      });
    }

    // 2. Extract correlation metadata from attempt metadata or target resource snapshot
    const attemptMeta = input.attemptMetadata as Record<string, unknown> | null;
    const targetMeta = input.targetMetadata as Record<string, unknown> | null;
    const targetResource = targetMeta?.['googleAdsTargetResource'] as GoogleAdsTargetResourceSnapshot | null;

    const customerId =
      (typeof attemptMeta?.['customerId'] === 'string' && attemptMeta['customerId']) ||
      targetResource?.customerId ||
      null;

    const managerCustomerId =
      (typeof attemptMeta?.['managerCustomerId'] === 'string' && attemptMeta['managerCustomerId']) ||
      targetResource?.managerCustomerId ||
      null;

    const clientIntegrationId =
      input.clientIntegrationId ||
      targetResource?.clientIntegrationId ||
      null;

    const targetShortId = input.targetId.replace(/-/g, '').substring(0, 8);
    const correlationName =
      (typeof attemptMeta?.['correlationName'] === 'string' && attemptMeta['correlationName']) ||
      `BOP-${input.jobId}-${targetShortId}`.substring(0, 128);

    if (!customerId || !/^\d{10}$/.test(customerId) || !clientIntegrationId) {
      this.logger.warn('GoogleAdsReconcilerAdapter: missing customerId or clientIntegrationId', { jobId: input.jobId });
      return ok({
        outcome: 'unresolved',
        unresolvedReason: 'MISSING_CORRELATION_METADATA',
        metadata: { message: 'Target or attempt metadata lacks valid customerId or clientIntegrationId' },
      });
    }

    // 3. Integration status & drift validation against active client integration record
    if (this.clientRepository && input.clientId && input.organizationId) {
      const integrationsRes = await this.clientRepository.listIntegrations(
        input.clientId as any,
        input.organizationId as any,
      );
      if (!integrationsRes.success) {
        return ok({
          outcome: 'unresolved',
          unresolvedReason: 'INTEGRATION_NOT_AVAILABLE',
          metadata: { message: 'Client integration list lookup failed' },
        });
      }

      const integration = integrationsRes.value.find(
        (i) => String(i.id) === String(clientIntegrationId),
      );

      if (!integration || integration.status !== 'active' || integration.provider !== 'google') {
        return ok({
          outcome: 'unresolved',
          unresolvedReason: 'INTEGRATION_NOT_AVAILABLE',
          metadata: { message: 'Client integration is not active or available' },
        });
      }

      const currentConfig = integration.configuration as Record<string, unknown> | null;
      const currentManagerId =
        typeof currentConfig?.['manager_customer_id'] === 'string' &&
        /^\d{10}$/.test(currentConfig['manager_customer_id'].trim())
          ? currentConfig['manager_customer_id'].trim()
          : null;

      if (
        integration.externalAccountId !== customerId ||
        currentManagerId !== managerCustomerId
      ) {
        return ok({
          outcome: 'unresolved',
          unresolvedReason: 'INTEGRATION_NOT_AVAILABLE',
          metadata: { message: 'Integration account binding drifted since publication attempt' },
        });
      }
    }

    // 4. Resolve OAuth refresh token
    const refreshTokenResult = await this.credentialRepository.resolveGoogleRefreshToken(clientIntegrationId);
    if (!refreshTokenResult || !refreshTokenResult.refreshToken) {
      this.logger.warn('GoogleAdsReconcilerAdapter: refresh token not available', { clientIntegrationId });
      return ok({
        outcome: 'unresolved',
        unresolvedReason: 'AUTH_EXPIRED',
        metadata: { message: 'Google OAuth refresh token not available' },
      });
    }

    const apiClient = this.apiClientSupplier();
    let accessToken: string;
    try {
      const tokenResult = await apiClient.refreshAccessToken(refreshTokenResult.refreshToken);
      accessToken = tokenResult.accessToken;
    } catch (tokenErr) {
      this.logger.warn('GoogleAdsReconcilerAdapter: access token refresh failed', { error: tokenErr });
      return ok({
        outcome: 'unresolved',
        unresolvedReason: 'AUTH_EXPIRED',
        metadata: { message: tokenErr instanceof Error ? tokenErr.message : 'Access token refresh failed' },
      });
    }

    // 5. Read-only GAQL Search
    try {
      const searchResult = await apiClient.searchCampaignByExactName({
        customerId,
        managerCustomerId,
        accessToken,
        exactCorrelationName: correlationName,
      });

      const rawResults = searchResult.results || [];
      const exactMatches = rawResults.filter((r) => r.campaign?.name === correlationName);

      if (exactMatches.length === 0) {
        this.logger.info('GoogleAdsReconcilerAdapter: confirmed 0 matches on provider (not published)', {
          jobId: input.jobId,
          correlationName,
        });
        return ok({
          outcome: 'confirmed_not_published',
          metadata: {
            customerId,
            managerCustomerId,
            correlationName,
            matchCount: 0,
            requestId: searchResult.requestId,
          },
        });
      }

      if (exactMatches.length === 1) {
        const campaign = exactMatches[0]!.campaign;
        const campaignId = campaign.id || campaign.resourceName.split('/').pop() || 'unknown';
        const externalId = campaign.resourceName || `customers/${customerId}/campaigns/${campaignId}`;

        this.logger.info('GoogleAdsReconcilerAdapter: confirmed 1 exact match on provider (published)', {
          jobId: input.jobId,
          externalId,
          correlationName,
        });

        return ok({
          outcome: 'confirmed_published',
          externalId,
          externalUrl: null,
          metadata: {
            customerId,
            managerCustomerId,
            campaignId,
            campaignResourceName: campaign.resourceName,
            campaignStatus: campaign.status,
            correlationName,
            matchCount: 1,
            requestId: searchResult.requestId,
          },
        });
      }

      // >1 matches -> unresolved
      this.logger.warn('GoogleAdsReconcilerAdapter: multiple exact matches found (ambiguous)', {
        jobId: input.jobId,
        matchCount: exactMatches.length,
        correlationName,
      });

      return ok({
        outcome: 'unresolved',
        unresolvedReason: 'MULTIPLE_EXACT_MATCHES',
        metadata: {
          customerId,
          managerCustomerId,
          correlationName,
          matchCount: exactMatches.length,
          requestId: searchResult.requestId,
        },
      });
    } catch (queryErr) {
      this.logger.warn('GoogleAdsReconcilerAdapter: GAQL search query failed', { error: queryErr });
      return ok({
        outcome: 'unresolved',
        unresolvedReason: 'PROVIDER_QUERY_FAILED',
        metadata: { message: queryErr instanceof Error ? queryErr.message : 'Google Ads GAQL search query failed' },
      });
    }
  }
}
