/**
 * MetaMonitorAdapter — Phase 8G.2 (Hardened Gate).
 *
 * Adaptador de infraestructura para monitoreo LECTURA PURA (`read-only`) de recursos
 * publicados en Facebook Organic e Instagram Organic via Meta Graph API.
 *
 * INVARIANTE PRIMARIO: CERO mutaciones al proveedor (CERO POST, DELETE, edit).
 * El resultado de la observación NUNCA altera el historial de publicación (`succeeded`).
 */

import { ok, type Result } from '@bop-agency/shared';
import type { ActivationChannel, ActivationProvider } from '@bop-agency/shared';
import type {
  PublicationProviderMonitorPort,
  ObserveInput,
  ProviderResourceObservation,
  LoggerPort,
} from '@bop-agency/application';
import type { ClientRepository, ClientId, OrganizationId } from '@bop-agency/domain';
import type { SupabaseCredentialRepository } from '../supabase/repositories/supabase-credential.repository';
import type { MetaGraphApiClient } from './meta-graph-api.client';

export type MetaMonitorAdapterDeps = {
  readonly clientRepository?: ClientRepository;
  readonly credentialRepository: SupabaseCredentialRepository;
  readonly logger: LoggerPort;
  readonly apiClient: MetaGraphApiClient;
};

// Resource ID Format Validators
const FB_POST_ID_REGEX = /^\d+(_\d+)?$/;
const IG_MEDIA_ID_REGEX = /^\d+$/;

export class MetaMonitorAdapter implements PublicationProviderMonitorPort {
  private readonly clientRepository?: ClientRepository;
  private readonly credentialRepository: SupabaseCredentialRepository;
  private readonly logger: LoggerPort;
  private readonly apiClient: MetaGraphApiClient;

  constructor(deps: MetaMonitorAdapterDeps) {
    if (deps.clientRepository) {
      this.clientRepository = deps.clientRepository;
    }
    this.credentialRepository = deps.credentialRepository;
    this.logger = deps.logger;
    this.apiClient = deps.apiClient;
  }

  supports(channel: ActivationChannel, provider: ActivationProvider): boolean {
    if (provider !== 'meta') {
      return false;
    }
    return channel === 'facebook_organic' || channel === 'instagram_organic';
  }

  async observe(input: ObserveInput): Promise<Result<ProviderResourceObservation>> {
    const timestamp = new Date().toISOString();

    if (!this.supports(input.channel, input.provider)) {
      return ok({
        provider: input.provider,
        channel: input.channel,
        externalId: input.externalId,
        observedAt: timestamp,
        availability: 'unavailable',
        unavailabilityReason: 'CHANNEL_NOT_CONFIGURED',
        metadata: { message: `Channel ${input.channel} / provider ${input.provider} not supported by MetaMonitorAdapter` },
      });
    }

    // 1. Validate Resource ID Format (Security Injection Guard)
    const isFb = input.channel === 'facebook_organic';
    const isValidId = isFb
      ? FB_POST_ID_REGEX.test(input.externalId)
      : IG_MEDIA_ID_REGEX.test(input.externalId);

    if (!isValidId) {
      this.logger.warn('MetaMonitorAdapter: invalid external ID format', { externalId: input.externalId, channel: input.channel });
      return ok({
        provider: input.provider,
        channel: input.channel,
        externalId: input.externalId,
        observedAt: timestamp,
        availability: 'unavailable',
        unavailabilityReason: 'PROVIDER_QUERY_FAILED',
        metadata: { message: `Malformed external ID format for ${input.channel}: ${input.externalId}` },
      });
    }

    // 2. Integration Status & Drift Validation (Facebook Page & Instagram Account)
    if (this.clientRepository && input.clientIntegrationId) {
      const integrationsRes = await this.clientRepository.listIntegrations(
        input.clientId as unknown as ClientId,
        input.organizationId as unknown as OrganizationId,
      );

      if (integrationsRes.success && integrationsRes.value) {
        const matchingIntegration = integrationsRes.value.find(
          (i) => String(i.id) === input.clientIntegrationId,
        );

        if (!matchingIntegration || matchingIntegration.status !== 'active' || matchingIntegration.provider !== 'meta') {
          this.logger.warn('MetaMonitorAdapter: active Meta integration not found or drifted', {
            clientIntegrationId: input.clientIntegrationId,
            status: matchingIntegration?.status,
          });
          return ok({
            provider: input.provider,
            channel: input.channel,
            externalId: input.externalId,
            observedAt: timestamp,
            availability: 'unavailable',
            unavailabilityReason: 'INTEGRATION_NOT_AVAILABLE',
            metadata: { message: 'Client integration inactive or drifted' },
          });
        }

        // Validate Facebook Page identity alignment
        if (isFb) {
          const expectedPageId =
            (input.targetMetadata?.['pageId'] as string) ||
            (input.targetMetadata?.['page_id'] as string);
          if (expectedPageId && matchingIntegration.externalAccountId && matchingIntegration.externalAccountId !== expectedPageId) {
            this.logger.warn('MetaMonitorAdapter: target Page ID drift detected', {
              expectedPageId,
              integrationExternalAccountId: matchingIntegration.externalAccountId,
            });
            return ok({
              provider: input.provider,
              channel: input.channel,
              externalId: input.externalId,
              observedAt: timestamp,
              availability: 'unavailable',
              unavailabilityReason: 'INTEGRATION_NOT_AVAILABLE',
              metadata: { message: 'Target Page ID drifted from connected integration' },
            });
          }
        } else {
          // Validate Instagram Account identity alignment
          const expectedIgAccountId =
            (input.targetMetadata?.['instagramAccountId'] as string) ||
            (input.targetMetadata?.['instagram_account_id'] as string) ||
            (input.attemptMetadata?.['instagram_account_id'] as string);

          const integrationIgAccountId =
            (matchingIntegration.configuration as Record<string, unknown>)?.[
              'instagram_account_id'
            ] ||
            (matchingIntegration.configuration as Record<string, unknown>)?.[
              'instagram_business_account'
            ];

          if (expectedIgAccountId && integrationIgAccountId && expectedIgAccountId !== String(integrationIgAccountId)) {
            this.logger.warn('MetaMonitorAdapter: Instagram account ID drift detected', {
              expectedIgAccountId,
              integrationIgAccountId,
            });
            return ok({
              provider: input.provider,
              channel: input.channel,
              externalId: input.externalId,
              observedAt: timestamp,
              availability: 'unavailable',
              unavailabilityReason: 'INTEGRATION_NOT_AVAILABLE',
              metadata: { message: 'Target Instagram account ID drifted from connected integration' },
            });
          }
        }
      }
    }

    // 3. Resolve Decrypted Credential (In-Memory Only)
    if (!input.clientIntegrationId) {
      return ok({
        provider: input.provider,
        channel: input.channel,
        externalId: input.externalId,
        observedAt: timestamp,
        availability: 'unavailable',
        unavailabilityReason: 'INTEGRATION_NOT_AVAILABLE',
        metadata: { message: 'Missing clientIntegrationId on job' },
      });
    }

    let resolvedCred;
    try {
      resolvedCred = await this.credentialRepository.resolvePageAccessToken(input.clientIntegrationId);
    } catch (err: unknown) {
      this.logger.error('MetaMonitorAdapter: failed resolving Page Access Token', { error: err });
      return ok({
        provider: input.provider,
        channel: input.channel,
        externalId: input.externalId,
        observedAt: timestamp,
        availability: 'unavailable',
        unavailabilityReason: 'AUTH_EXPIRED',
        metadata: { message: 'Failed resolving Page Access Token' },
      });
    }

    if (!resolvedCred || !resolvedCred.pageAccessToken) {
      return ok({
        provider: input.provider,
        channel: input.channel,
        externalId: input.externalId,
        observedAt: timestamp,
        availability: 'unavailable',
        unavailabilityReason: 'AUTH_EXPIRED',
        metadata: { message: 'Page access token unavailable or expired' },
      });
    }

    // 4. Execute Read-Only Status Observation via Graph API
    if (isFb) {
      return this.observeFacebookPost(input, resolvedCred.pageAccessToken, timestamp);
    } else {
      return this.observeInstagramMedia(input, resolvedCred.pageAccessToken, timestamp);
    }
  }

  private async observeFacebookPost(
    input: ObserveInput,
    pageAccessToken: string,
    timestamp: string,
  ): Promise<Result<ProviderResourceObservation>> {
    try {
      const response = await this.apiClient.observeFacebookPost(input.externalId, pageAccessToken);

      if (response.result) {
        const isPublished = response.result.is_published ?? true;
        return ok({
          provider: input.provider,
          channel: input.channel,
          externalId: input.externalId,
          observedAt: timestamp,
          availability: 'observed',
          resourceStatus: isPublished ? 'PUBLISHED' : 'UNPUBLISHED',
          metadata: {
            facebookPostId: response.result.id,
            permalinkUrl: response.result.permalink_url || null,
            createdTime: response.result.created_time || null,
            isPublished,
            requestId: response.requestId,
          },
        });
      }

      // Hardened Error Precedence Taxonomy
      const code = response.errorCode;
      const subcode = response.errorSubcode;
      const httpStatus = response.httpStatus;

      // 1. Auth Invalid / Token Expired (HTTP 401 or Code 190)
      if (httpStatus === 401 || code === 190) {
        return ok({
          provider: input.provider,
          channel: input.channel,
          externalId: input.externalId,
          observedAt: timestamp,
          availability: 'unavailable',
          unavailabilityReason: 'AUTH_EXPIRED',
          metadata: { errorCode: code, errorSubcode: subcode, requestId: response.requestId },
        });
      }

      // 2. Permission / Access Denied (HTTP 403 or Code 200 / subcode 200..299)
      if (httpStatus === 403 || code === 200 || (subcode && subcode >= 200 && subcode <= 299)) {
        return ok({
          provider: input.provider,
          channel: input.channel,
          externalId: input.externalId,
          observedAt: timestamp,
          availability: 'unavailable',
          unavailabilityReason: 'INTEGRATION_NOT_AVAILABLE',
          metadata: { errorCode: code, errorSubcode: subcode, requestId: response.requestId },
        });
      }

      // 3. Definitive Object Missing (ONLY Subcode 33 or 2108006)
      if (subcode === 33 || subcode === 2108006) {
        return ok({
          provider: input.provider,
          channel: input.channel,
          externalId: input.externalId,
          observedAt: timestamp,
          availability: 'not_found',
          resourceStatus: 'REMOVED',
          metadata: { errorCode: code, errorSubcode: subcode, requestId: response.requestId },
        });
      }

      // 4. Rate Limit / Transient 5xx / Generic 404 without missing subcode / Generic Code 100
      return ok({
        provider: input.provider,
        channel: input.channel,
        externalId: input.externalId,
        observedAt: timestamp,
        availability: 'unavailable',
        unavailabilityReason: 'PROVIDER_QUERY_FAILED',
        metadata: { httpStatus, errorCode: code, errorSubcode: subcode, requestId: response.requestId },
      });
    } catch (err: unknown) {
      this.logger.error('MetaMonitorAdapter: error querying Facebook post status', { error: err });
      return ok({
        provider: input.provider,
        channel: input.channel,
        externalId: input.externalId,
        observedAt: timestamp,
        availability: 'unavailable',
        unavailabilityReason: 'PROVIDER_QUERY_FAILED',
        metadata: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  private async observeInstagramMedia(
    input: ObserveInput,
    pageAccessToken: string,
    timestamp: string,
  ): Promise<Result<ProviderResourceObservation>> {
    try {
      const response = await this.apiClient.observeInstagramMedia(input.externalId, pageAccessToken);

      if (response.result) {
        return ok({
          provider: input.provider,
          channel: input.channel,
          externalId: input.externalId,
          observedAt: timestamp,
          availability: 'observed',
          resourceStatus: 'PUBLISHED', // Bop normalized status meaning exact media exists and is queryable
          metadata: {
            instagramMediaId: response.result.id,
            mediaType: response.result.media_type || null,
            mediaProductType: response.result.media_product_type || null,
            permalink: response.result.permalink || null,
            timestamp: response.result.timestamp || null,
            requestId: response.requestId,
          },
        });
      }

      // Hardened Error Precedence Taxonomy
      const code = response.errorCode;
      const subcode = response.errorSubcode;
      const httpStatus = response.httpStatus;

      // 1. Auth Invalid / Token Expired (HTTP 401 or Code 190)
      if (httpStatus === 401 || code === 190) {
        return ok({
          provider: input.provider,
          channel: input.channel,
          externalId: input.externalId,
          observedAt: timestamp,
          availability: 'unavailable',
          unavailabilityReason: 'AUTH_EXPIRED',
          metadata: { errorCode: code, errorSubcode: subcode, requestId: response.requestId },
        });
      }

      // 2. Permission / Access Denied (HTTP 403 or Code 200 / subcode 200..299)
      if (httpStatus === 403 || code === 200 || (subcode && subcode >= 200 && subcode <= 299)) {
        return ok({
          provider: input.provider,
          channel: input.channel,
          externalId: input.externalId,
          observedAt: timestamp,
          availability: 'unavailable',
          unavailabilityReason: 'INTEGRATION_NOT_AVAILABLE',
          metadata: { errorCode: code, errorSubcode: subcode, requestId: response.requestId },
        });
      }

      // 3. Definitive Object Missing (ONLY Subcode 33 or 2108006)
      if (subcode === 33 || subcode === 2108006) {
        return ok({
          provider: input.provider,
          channel: input.channel,
          externalId: input.externalId,
          observedAt: timestamp,
          availability: 'not_found',
          resourceStatus: 'REMOVED',
          metadata: { errorCode: code, errorSubcode: subcode, requestId: response.requestId },
        });
      }

      // 4. Rate Limit / Transient 5xx / Generic 404 without missing subcode / Generic Code 100
      return ok({
        provider: input.provider,
        channel: input.channel,
        externalId: input.externalId,
        observedAt: timestamp,
        availability: 'unavailable',
        unavailabilityReason: 'PROVIDER_QUERY_FAILED',
        metadata: { httpStatus, errorCode: code, errorSubcode: subcode, requestId: response.requestId },
      });
    } catch (err: unknown) {
      this.logger.error('MetaMonitorAdapter: error querying Instagram media status', { error: err });
      return ok({
        provider: input.provider,
        channel: input.channel,
        externalId: input.externalId,
        observedAt: timestamp,
        availability: 'unavailable',
        unavailabilityReason: 'PROVIDER_QUERY_FAILED',
        metadata: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}
