import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8nPublicationTransportAdapter } from '../n8n-publication-transport.adapter';
import type { PublishInput } from '@bop-agency/application';
import {
  campaignPublicationJobId,
  organizationId,
  campaignActivationTargetId,
} from '@bop-agency/domain';
import type { ClientId } from '@bop-agency/domain';

describe('N8nPublicationTransportAdapter (Phase 8B.3)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['N8N_BASE_URL'] = 'http://localhost:5678';
    process.env['PUBLICATION_WEBHOOK_SECRET'] = 'super-secret-publication-key-32-chars-long!!';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const sampleInput: PublishInput = {
    jobId: campaignPublicationJobId('00000000-0000-4000-8000-000000000001'),
    organizationId: organizationId('00000000-0000-4000-8000-000000000002'),
    clientId: '00000000-0000-4000-8000-000000000003' as ClientId,
    targetId: campaignActivationTargetId('00000000-0000-4000-8000-000000000004'),
    channel: 'meta_ads',
    provider: 'meta',
    clientIntegrationId: null,
    attemptNumber: 1,
    idempotencyKey: 'idemp-key-123',
    metadata: { test: true },
  };

  it('supports configured channels and providers', () => {
    const adapter = new N8nPublicationTransportAdapter();
    expect(adapter.supports('meta_ads', 'meta')).toBe(true);
    expect(adapter.supports('google_ads', 'google')).toBe(true);
  });

  it('sends signed HTTP POST request and handles succeeded outcome', async () => {
    const adapter = new N8nPublicationTransportAdapter();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          outcome: 'succeeded',
          externalId: 'ext-meta-123',
          externalUrl: 'https://meta.com/ads/123',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await adapter.publish(sampleInput);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.outcome).toBe('succeeded');
    expect(result.value.externalId).toBe('ext-meta-123');

    const call = fetchSpy.mock.calls[0];
    expect(call?.[0]).toBe('http://localhost:5678/webhook/publishing/meta_ads/meta');
    expect(call?.[1]?.method).toBe('POST');
    const headers = (call?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-bop-signature']).toBeDefined();
    expect(headers['x-bop-timestamp']).toBeDefined();
    expect(headers['x-bop-event-id']).toBe('idemp-key-123');
  });

  it('maps succeeded WITHOUT externalId to unknown_outcome', async () => {
    const adapter = new N8nPublicationTransportAdapter();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ outcome: 'succeeded' }), // Missing externalId
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await adapter.publish(sampleInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.outcome).toBe('unknown_outcome');
  });

  it('maps HTTP 202 (Accepted) to unknown_outcome', async () => {
    const adapter = new N8nPublicationTransportAdapter();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Accepted' }), { status: 202 }),
    );

    const result = await adapter.publish(sampleInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.outcome).toBe('unknown_outcome');
    expect(result.value.httpStatus).toBe(202);
  });

  it('maps HTTP 5xx errors to unknown_outcome', async () => {
    const adapter = new N8nPublicationTransportAdapter();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const result = await adapter.publish(sampleInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.outcome).toBe('unknown_outcome');
    expect(result.value.httpStatus).toBe(500);
  });

  it('maps timeout / AbortError to unknown_outcome', async () => {
    const adapter = new N8nPublicationTransportAdapter();
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortErr);

    const result = await adapter.publish(sampleInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.outcome).toBe('unknown_outcome');
    expect(result.value.providerStatus).toContain('timed out');
  });

  it('maps malformed non-JSON response to unknown_outcome', async () => {
    const adapter = new N8nPublicationTransportAdapter();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('NOT_JSON_BODY', { status: 200 }),
    );

    const result = await adapter.publish(sampleInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.outcome).toBe('unknown_outcome');
    expect(result.value.providerStatus).toContain('non-JSON');
  });

  it('fails closed to unknown_outcome if PUBLICATION_WEBHOOK_SECRET is missing', async () => {
    delete process.env['PUBLICATION_WEBHOOK_SECRET'];
    const adapter = new N8nPublicationTransportAdapter();

    const result = await adapter.publish(sampleInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.outcome).toBe('unknown_outcome');
    expect(result.value.providerStatus).toContain('Configuration error');
  });
});
