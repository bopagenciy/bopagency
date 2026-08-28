/**
 * MetaPublisherAdapter — Phase 8E.
 *
 * Adapter de infraestructura de ChannelPublisherPort para publicar posts orgánicos
 * en Facebook Page e Instagram Professional account usando Meta Graph API.
 *
 * Cumple con los invariantes congelados:
 * - Direct execution in-process (modelo B).
 * - Registra checkpoints persistentes en Postgres para Instagram (container_created, publish_requested).
 * - Manejo seguro de credenciales cifradas (resueltas exclusivamente en servidor via SupabaseCredentialRepository).
 */

import { ok } from '@bop-agency/shared';
import type { Result, ActivationChannel, ActivationProvider } from '@bop-agency/shared';
import type { ChannelPublisherPort, PublishInput, PublishReceipt } from '@bop-agency/application';
import type { SupabaseCredentialRepository } from '../supabase/repositories/supabase-credential.repository';
import type { MetaGraphApiClient } from './meta-graph-api.client';
import { mapMetaErrorToFailureCategory } from './meta-error.mapper';

export type CheckpointRpcFunction = (
  attemptId: string,
  organizationId: string,
  stage: 'container_created' | 'publish_requested',
  containerCreationId: string,
) => Promise<boolean>;

export type FetchTargetMetadataFunction = (
  targetId: string,
  organizationId: string,
) => Promise<{
  pageId: string;
  instagramAccountId?: string | null;
  content: {
    message: string;
    imageUrl?: string | null;
  };
} | null>;

export class MetaPublisherAdapter implements ChannelPublisherPort {
  constructor(
    private readonly credentialRepository: SupabaseCredentialRepository,
    private readonly apiClient: MetaGraphApiClient,
    private readonly fetchTargetMetadataFn?: FetchTargetMetadataFunction,
    private readonly checkpointRpcFn?: CheckpointRpcFunction,
  ) {}

  supports(channel: ActivationChannel, provider: ActivationProvider): boolean {
    if (provider !== 'meta') {
      return false;
    }
    return channel === 'facebook_organic' || channel === 'instagram_organic';
  }

  async publish(input: PublishInput): Promise<Result<PublishReceipt>> {
    const startTime = Date.now();

    if (!this.supports(input.channel, input.provider)) {
      return ok({
        outcome: 'failed',
        failureCategory: 'DISPATCH_FAILED',
        metadata: {
          error: `Unsupported channel/provider combination: ${input.channel}/${input.provider}`,
        },
      });
    }

    if (!input.clientIntegrationId) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INTEGRATION_NOT_AVAILABLE',
        metadata: { error: 'Target has no associated clientIntegrationId' },
      });
    }

    // 1. Resolver credencial cifrada
    let resolvedCred;
    try {
      resolvedCred = await this.credentialRepository.resolvePageAccessToken(
        input.clientIntegrationId,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return ok({
        outcome: 'failed',
        failureCategory: 'INTEGRATION_NOT_AVAILABLE',
        metadata: { error: `Failed to resolve credential: ${msg}` },
      });
    }

    if (!resolvedCred || !resolvedCred.pageAccessToken) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INTEGRATION_NOT_AVAILABLE',
        metadata: { error: 'Page access token not found or invalid' },
      });
    }

    // 2. Extraer datos de publicación desde input.metadata o resolver via fetchTargetMetadataFn
    let targetMeta;
    if (this.fetchTargetMetadataFn) {
      try {
        targetMeta = await this.fetchTargetMetadataFn(input.targetId, input.organizationId);
      } catch {
        // Ignorar error y usar fallback metadata
      }
    }

    const message =
      (input.metadata?.['message'] as string) ||
      (input.metadata?.['caption'] as string) ||
      targetMeta?.content.message ||
      '';

    const imageUrl =
      (input.metadata?.['imageUrl'] as string) ||
      (input.metadata?.['image_url'] as string) ||
      targetMeta?.content.imageUrl ||
      null;

    const pageId =
      (input.metadata?.['pageId'] as string) ||
      (input.metadata?.['page_id'] as string) ||
      targetMeta?.pageId ||
      '';

    const instagramAccountId =
      (input.metadata?.['instagramAccountId'] as string) ||
      (input.metadata?.['instagram_account_id'] as string) ||
      targetMeta?.instagramAccountId ||
      null;

    // 3. Ejecutar según canal
    if (input.channel === 'facebook_organic') {
      return this.publishFacebookOrganic({
        input,
        pageId,
        pageAccessToken: resolvedCred.pageAccessToken,
        message,
        imageUrl,
        startTime,
      });
    } else {
      return this.publishInstagramOrganic({
        input,
        instagramAccountId,
        pageAccessToken: resolvedCred.pageAccessToken,
        message,
        imageUrl,
        startTime,
      });
    }
  }

  /**
   * Publicación orgáncia en Facebook Page.
   */
  private async publishFacebookOrganic(params: {
    input: PublishInput;
    pageId: string;
    pageAccessToken: string;
    message: string;
    imageUrl: string | null;
    startTime: number;
  }): Promise<Result<PublishReceipt>> {
    const { pageId, pageAccessToken, message, imageUrl, startTime } = params;

    if (!message && !imageUrl) {
      return ok({
        outcome: 'failed',
        failureCategory: 'DISPATCH_FAILED',
        metadata: { error: 'Facebook post requires non-empty message or imageUrl' },
      });
    }

    try {
      const targetPageId = pageId || 'me';
      const result = await this.apiClient.publishFacebookPost(targetPageId, pageAccessToken, {
        message,
        imageUrl,
      });

      const durationMs = Date.now() - startTime;

      return ok({
        outcome: 'succeeded',
        externalId: result.id,
        externalUrl: result.permalink_url || null,
        httpStatus: result.httpStatus,
        durationMs,
        metadata: {
          page_id: pageId,
          post_id: result.post_id || result.id,
          retry_after: result.headers?.['retry-after'] || null,
        },
      });
    } catch (err: unknown) {
      const errorObj = err as {
        message?: string;
        httpStatus?: number;
        metaError?: { code?: number; error_subcode?: number };
        headers?: Record<string, string>;
      };
      const durationMs = Date.now() - startTime;
      const httpStatus = errorObj.httpStatus || 500;
      const metaError = errorObj.metaError;
      const failureCategory = mapMetaErrorToFailureCategory(httpStatus, metaError);

      return ok({
        outcome: 'failed',
        httpStatus,
        providerErrorCode: metaError?.code ? String(metaError.code) : null,
        failureCategory,
        durationMs,
        metadata: {
          error_message: errorObj.message || 'Facebook publish failed',
          provider_error_subcode: metaError?.error_subcode || null,
          retry_after: errorObj.headers?.['retry-after'] || null,
        },
      });
    }
  }

  /**
   * Publicación orgánica en Instagram Professional Account (con checkpoints crash-safe).
   */
  private async publishInstagramOrganic(params: {
    input: PublishInput;
    instagramAccountId: string | null;
    pageAccessToken: string;
    message: string;
    imageUrl: string | null;
    startTime: number;
  }): Promise<Result<PublishReceipt>> {
    const { input, instagramAccountId, pageAccessToken, message, imageUrl, startTime } = params;

    if (!instagramAccountId) {
      return ok({
        outcome: 'failed',
        failureCategory: 'DISPATCH_FAILED',
        metadata: { error: 'Instagram account ID is missing' },
      });
    }

    if (!imageUrl) {
      return ok({
        outcome: 'failed',
        failureCategory: 'DISPATCH_FAILED',
        metadata: { error: 'Instagram post requires a valid HTTPS imageUrl' },
      });
    }

    let creationId: string;

    // STEP 1: POST /media (Container creation)
    try {
      const containerRes = await this.apiClient.createInstagramContainer(
        instagramAccountId,
        pageAccessToken,
        imageUrl,
        message,
      );
      creationId = containerRes.creationId;
    } catch (err: unknown) {
      const errorObj = err as {
        message?: string;
        httpStatus?: number;
        metaError?: { code?: number; error_subcode?: number };
      };
      const durationMs = Date.now() - startTime;
      const httpStatus = errorObj.httpStatus || 500;
      const metaError = errorObj.metaError;
      const failureCategory = mapMetaErrorToFailureCategory(httpStatus, metaError);

      return ok({
        outcome: 'failed',
        httpStatus,
        providerErrorCode: metaError?.code ? String(metaError.code) : null,
        failureCategory,
        durationMs,
        metadata: {
          error_message: errorObj.message || 'Instagram container creation failed',
          provider_error_subcode: metaError?.error_subcode || null,
        },
      });
    }

    // CHECKPOINT 1: container_created (PERSISTENT EN DB ANTES DE PUBLISH)
    if (this.checkpointRpcFn && input.metadata?.['attemptId']) {
      try {
        await this.checkpointRpcFn(
          String(input.metadata['attemptId']),
          input.organizationId,
          'container_created',
          creationId,
        );
      } catch {
        // Log checkpoint attempt failure but proceed
      }
    }

    // CHECKPOINT 2: publish_requested (IMMEDIATAMENTE ANTES DE MEDIA_PUBLISH)
    if (this.checkpointRpcFn && input.metadata?.['attemptId']) {
      try {
        await this.checkpointRpcFn(
          String(input.metadata['attemptId']),
          input.organizationId,
          'publish_requested',
          creationId,
        );
      } catch {
        // Log checkpoint attempt failure but proceed
      }
    }

    // STEP 2: POST /media_publish
    try {
      const publishRes = await this.apiClient.publishInstagramContainer(
        instagramAccountId,
        pageAccessToken,
        creationId,
      );

      const durationMs = Date.now() - startTime;

      return ok({
        outcome: 'succeeded',
        externalId: publishRes.id,
        externalUrl: publishRes.permalink_url || null,
        httpStatus: publishRes.httpStatus,
        durationMs,
        metadata: {
          instagram_account_id: instagramAccountId,
          container_creation_id: creationId,
          meta_stage: 'published',
        },
      });
    } catch (publishErr: unknown) {
      const errorObj = publishErr as {
        message?: string;
        httpStatus?: number;
        metaError?: { code?: number; error_subcode?: number };
      };
      const durationMs = Date.now() - startTime;
      const httpStatus = errorObj.httpStatus || 500;
      const metaError = errorObj.metaError;

      // Si Step 2 falla o da timeout, el resultado es AMBIGUO (unknown_outcome)
      return ok({
        outcome: 'unknown_outcome',
        httpStatus,
        providerErrorCode: metaError?.code ? String(metaError.code) : null,
        durationMs,
        metadata: {
          error_message: errorObj.message || 'Instagram publish failed',
          container_creation_id: creationId,
          meta_stage: 'publish_requested',
          provider_error_subcode: metaError?.error_subcode || null,
        },
      });
    }
  }
}
