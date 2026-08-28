import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaPublisherAdapter } from '../meta-publisher.adapter';
import type { MetaGraphApiClient } from '../meta-graph-api.client';
import type { SupabaseCredentialRepository } from '../../supabase/repositories/supabase-credential.repository';
import type { PublishInput } from '@bop-agency/application';
import type { ActivationChannel, ActivationProvider } from '@bop-agency/shared';

describe('MetaPublisherAdapter', () => {
  let mockCredentialRepo: SupabaseCredentialRepository;
  let mockApiClient: MetaGraphApiClient;
  let adapter: MetaPublisherAdapter;

  beforeEach(() => {
    mockCredentialRepo = {
      resolvePageAccessToken: vi.fn().mockResolvedValue({
        clientIntegrationId: 'int-123',
        organizationId: 'org-123',
        pageAccessToken: 'valid_token_abc',
        tokenExpiresAt: null,
      }),
    } as unknown as SupabaseCredentialRepository;

    mockApiClient = {
      publishFacebookPost: vi.fn().mockResolvedValue({
        id: 'post_1001',
        post_id: 'page123_post1001',
        permalink_url: 'https://facebook.com/post_1001',
        httpStatus: 200,
      }),
      createInstagramContainer: vi.fn().mockResolvedValue({
        creationId: 'container_999',
        httpStatus: 200,
      }),
      publishInstagramContainer: vi.fn().mockResolvedValue({
        id: 'ig_media_777',
        httpStatus: 200,
      }),
    } as unknown as MetaGraphApiClient;

    adapter = new MetaPublisherAdapter(mockCredentialRepo, mockApiClient);
  });

  it('supports facebook_organic y instagram_organic con provider meta', () => {
    expect(adapter.supports('facebook_organic', 'meta')).toBe(true);
    expect(adapter.supports('instagram_organic', 'meta')).toBe(true);
    expect(adapter.supports('google_organic' as ActivationChannel, 'meta')).toBe(false);
    expect(adapter.supports('facebook_organic', 'google' as ActivationProvider)).toBe(false);
  });

  it('publica post orgánico en Facebook exitosamente', async () => {
    const input: PublishInput = {
      jobId: 'job-1' as unknown as PublishInput['jobId'],
      organizationId: 'org-123' as unknown as PublishInput['organizationId'],
      clientId: 'client-1' as unknown as PublishInput['clientId'],
      targetId: 'target-1' as unknown as PublishInput['targetId'],
      channel: 'facebook_organic',
      provider: 'meta',
      clientIntegrationId: 'int-123',
      attemptNumber: 1,
      idempotencyKey: 'idemp-1',
      metadata: {
        message: 'Hola Facebook!',
        pageId: '100555',
      },
    };

    const res = await adapter.publish(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value.outcome).toBe('succeeded');
      expect(res.value.externalId).toBe('post_1001');
      expect(res.value.externalUrl).toBe('https://facebook.com/post_1001');
    }
  });

  it('publica post orgánico en Instagram ejecutando ambos checkpoints', async () => {
    const mockCheckpointRpc = vi.fn().mockResolvedValue(true);
    const igAdapter = new MetaPublisherAdapter(
      mockCredentialRepo,
      mockApiClient,
      undefined,
      mockCheckpointRpc,
    );

    const input: PublishInput = {
      jobId: 'job-2' as unknown as PublishInput['jobId'],
      organizationId: 'org-123' as unknown as PublishInput['organizationId'],
      clientId: 'client-1' as unknown as PublishInput['clientId'],
      targetId: 'target-2' as unknown as PublishInput['targetId'],
      channel: 'instagram_organic',
      provider: 'meta',
      clientIntegrationId: 'int-123',
      attemptNumber: 1,
      idempotencyKey: 'idemp-2',
      metadata: {
        attemptId: 'att-555',
        caption: 'Hola Instagram!',
        imageUrl: 'https://example.com/photo.jpg',
        instagramAccountId: 'ig-777',
      },
    };

    const res = await igAdapter.publish(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value.outcome).toBe('succeeded');
      expect(res.value.externalId).toBe('ig_media_777');
    }

    expect(mockCheckpointRpc).toHaveBeenCalledTimes(2);
    expect(mockCheckpointRpc).toHaveBeenNthCalledWith(
      1,
      'att-555',
      'org-123',
      'container_created',
      'container_999',
    );
    expect(mockCheckpointRpc).toHaveBeenNthCalledWith(
      2,
      'att-555',
      'org-123',
      'publish_requested',
      'container_999',
    );
  });

  it('retorna unknown_outcome si Step 2 de Instagram falla', async () => {
    mockApiClient.publishInstagramContainer = vi.fn().mockRejectedValue({
      message: 'Network timeout during publish',
      httpStatus: 504,
    });

    const input: PublishInput = {
      jobId: 'job-3' as unknown as PublishInput['jobId'],
      organizationId: 'org-123' as unknown as PublishInput['organizationId'],
      clientId: 'client-1' as unknown as PublishInput['clientId'],
      targetId: 'target-3' as unknown as PublishInput['targetId'],
      channel: 'instagram_organic',
      provider: 'meta',
      clientIntegrationId: 'int-123',
      attemptNumber: 1,
      idempotencyKey: 'idemp-3',
      metadata: {
        caption: 'Hola Instagram!',
        imageUrl: 'https://example.com/photo.jpg',
        instagramAccountId: 'ig-777',
      },
    };

    const res = await adapter.publish(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value.outcome).toBe('unknown_outcome');
      expect(res.value.metadata?.['container_creation_id']).toBe('container_999');
    }
  });
});
