import { ok, type Result, type ActivationChannel, type ActivationProvider } from '@bop-agency/shared';
import type {
  PublicationProviderMonitorPort,
  ObserveInput,
  ProviderResourceObservation,
  LoggerPort,
} from '@bop-agency/application';
import type {
  CampaignActivationRepository,
  ClientRepository,
  GoogleAdsTargetResourceSnapshot,
  ClientId,
  OrganizationId,
} from '@bop-agency/domain';
import type { SupabaseCredentialRepository } from '../supabase/repositories/supabase-credential.repository';
import {
  GoogleAdsApiClient,
  requireGoogleAdsApiVersion,
  requireGoogleAdsDeveloperToken,
} from './google-ads-api.client';

export type GoogleAdsMonitorAdapterDeps = {
  readonly activationRepository?: CampaignActivationRepository;
  readonly clientRepository?: ClientRepository;
  readonly credentialRepository: SupabaseCredentialRepository;
  readonly logger: LoggerPort;
  readonly apiClient?: GoogleAdsApiClient;
};

export class GoogleAdsMonitorAdapter implements PublicationProviderMonitorPort {
  private readonly clientRepository?: ClientRepository;
  private readonly credentialRepository: SupabaseCredentialRepository;
  private readonly logger: LoggerPort;
  private readonly apiClientSupplier: () => GoogleAdsApiClient;

  constructor(deps: GoogleAdsMonitorAdapterDeps) {
    if (deps.clientRepository) {
      this.clientRepository = deps.clientRepository;
    }
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

  async observe(input: ObserveInput): Promise<Result<ProviderResourceObservation>> {
    const observedAt = new Date().toISOString();

    this.logger.info('GoogleAdsMonitorAdapter: initiating read-only status observation', {
      jobId: input.jobId,
      externalId: input.externalId,
    });

    // 1. Env Check
    try {
      requireGoogleAdsApiVersion();
      requireGoogleAdsDeveloperToken();
    } catch (envErr) {
      this.logger.warn('GoogleAdsMonitorAdapter: missing environment configuration', { error: envErr });
      return ok({
        provider: 'google',
        channel: 'google_ads',
        externalId: input.externalId,
        observedAt,
        availability: 'unavailable',
        unavailabilityReason: 'CHANNEL_NOT_CONFIGURED',
        metadata: { message: envErr instanceof Error ? envErr.message : 'Missing Google Ads API environment configuration' },
      });
    }

    // 2. Extract resource identity from attempt metadata or target resource snapshot
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

    if (!customerId || !/^\d{10}$/.test(customerId) || !clientIntegrationId || !input.externalId) {
      this.logger.warn('GoogleAdsMonitorAdapter: invalid customerId or externalId format', {
        jobId: input.jobId,
        customerId,
        externalId: input.externalId,
      });
      return ok({
        provider: 'google',
        channel: 'google_ads',
        externalId: input.externalId || 'unknown',
        observedAt,
        availability: 'unavailable',
        unavailabilityReason: 'MISSING_RESOURCE_IDENTITY',
        metadata: { message: 'Target or attempt metadata lacks valid customerId, clientIntegrationId, or externalId' },
      });
    }

    // 3. Integration status & drift validation
    if (this.clientRepository && input.clientId && input.organizationId) {
      const integrationsRes = await this.clientRepository.listIntegrations(
        input.clientId as unknown as ClientId,
        input.organizationId as unknown as OrganizationId,
      );

      if (!integrationsRes.success) {
        return ok({
          provider: 'google',
          channel: 'google_ads',
          externalId: input.externalId,
          observedAt,
          availability: 'unavailable',
          unavailabilityReason: 'INTEGRATION_NOT_AVAILABLE',
          metadata: { message: 'Client integration list lookup failed' },
        });
      }

      const integration = integrationsRes.value.find(
        (i) => String(i.id) === String(clientIntegrationId),
      );

      if (!integration || integration.status !== 'active' || integration.provider !== 'google') {
        return ok({
          provider: 'google',
          channel: 'google_ads',
          externalId: input.externalId,
          observedAt,
          availability: 'unavailable',
          unavailabilityReason: 'INTEGRATION_NOT_AVAILABLE',
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
          provider: 'google',
          channel: 'google_ads',
          externalId: input.externalId,
          observedAt,
          availability: 'unavailable',
          unavailabilityReason: 'INTEGRATION_NOT_AVAILABLE',
          metadata: { message: 'Integration account binding drifted since publication attempt' },
        });
      }
    }

    // 4. Resolve OAuth refresh token
    const refreshTokenResult = await this.credentialRepository.resolveGoogleRefreshToken(clientIntegrationId);
    if (!refreshTokenResult || !refreshTokenResult.refreshToken) {
      this.logger.warn('GoogleAdsMonitorAdapter: refresh token not available', { clientIntegrationId });
      return ok({
        provider: 'google',
        channel: 'google_ads',
        externalId: input.externalId,
        observedAt,
        availability: 'unavailable',
        unavailabilityReason: 'AUTH_EXPIRED',
        metadata: { message: 'Google OAuth refresh token not available' },
      });
    }

    const apiClient = this.apiClientSupplier();
    let accessToken: string;
    try {
      const tokenResult = await apiClient.refreshAccessToken(refreshTokenResult.refreshToken);
      accessToken = tokenResult.accessToken;
    } catch (tokenErr) {
      this.logger.warn('GoogleAdsMonitorAdapter: access token refresh failed', { error: tokenErr });
      return ok({
        provider: 'google',
        channel: 'google_ads',
        externalId: input.externalId,
        observedAt,
        availability: 'unavailable',
        unavailabilityReason: 'AUTH_EXPIRED',
        metadata: { message: tokenErr instanceof Error ? tokenErr.message : 'Access token refresh failed' },
      });
    }

    // 5. Read-only GAQL status query
    try {
      const queryRes = await apiClient.observeCampaignByResourceName({
        customerId,
        managerCustomerId,
        accessToken,
        resourceName: input.externalId,
      });

      if (!queryRes.result) {
        this.logger.info('GoogleAdsMonitorAdapter: campaign resource not found on provider', {
          externalId: input.externalId,
        });
        return ok({
          provider: 'google',
          channel: 'google_ads',
          externalId: input.externalId,
          observedAt,
          availability: 'not_found',
          metadata: {
            customerId,
            managerCustomerId,
            requestId: queryRes.requestId,
          },
        });
      }

      const camp = queryRes.result.campaign;

      // Deduplicate/sort primary status reasons if present
      const sortedReasons = camp.primaryStatusReasons
        ? [...camp.primaryStatusReasons].sort()
        : [];

      return ok({
        provider: 'google',
        channel: 'google_ads',
        externalId: input.externalId,
        observedAt,
        availability: 'observed',
        resourceStatus: camp.status,
        servingStatus: camp.servingStatus || null,
        primaryStatus: camp.primaryStatus || null,
        primaryStatusReasons: sortedReasons,
        metadata: {
          campaignId: camp.id,
          campaignResourceName: camp.resourceName,
          campaignName: camp.name,
          requestId: queryRes.requestId,
        },
      });
    } catch (queryErr) {
      this.logger.warn('GoogleAdsMonitorAdapter: GAQL status query failed', { error: queryErr });
      return ok({
        provider: 'google',
        channel: 'google_ads',
        externalId: input.externalId,
        observedAt,
        availability: 'unavailable',
        unavailabilityReason: 'PROVIDER_QUERY_FAILED',
        metadata: { message: queryErr instanceof Error ? queryErr.message : 'Google Ads GAQL status observation failed' },
      });
    }
  }
}
