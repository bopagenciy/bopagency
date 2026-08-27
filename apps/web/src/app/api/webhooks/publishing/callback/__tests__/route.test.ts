import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';
import { computePublicationHmac } from '@/lib/webhooks/publication-hmac';

// Mocks
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
}));

const mockRepository = {
  recordWebhookReceipt: vi.fn(),
  findWebhookEventByProviderAndExternalId: vi.fn(),
  markWebhookEventProcessed: vi.fn(),
  findJobById: vi.fn(),
};

vi.mock('@bop-agency/infrastructure', () => {
  return {
    SupabaseCampaignPublicationRepository: vi.fn().mockImplementation(() => mockRepository),
  };
});

describe('POST /api/webhooks/publishing/callback Route (Phase 8B.3)', () => {
  const originalEnv = process.env;
  const validSecret = 'publication-secret-key-at-least-32-chars-long!!';
  const jobId = '11111111-1111-4000-8000-111111111111';
  const orgId = '22222222-2222-4000-8000-222222222222';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['PUBLICATION_WEBHOOK_SECRET'] = validSecret;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function makeSignedRequest(bodyObj: Record<string, unknown>, eventId = 'evt-123', secret = validSecret): NextRequest {
    const rawBody = JSON.stringify(bodyObj);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = computePublicationHmac(Buffer.from(secret, 'utf-8'), timestamp, rawBody);

    return new NextRequest('http://localhost:3200/api/webhooks/publishing/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bop-timestamp': timestamp,
        'x-bop-signature': signature,
        'x-bop-event-id': eventId,
      },
      body: rawBody,
    });
  }

  it('fails closed (500) if PUBLICATION_WEBHOOK_SECRET is missing', async () => {
    delete process.env['PUBLICATION_WEBHOOK_SECRET'];
    const currentTimestamp = Math.floor(Date.now() / 1000).toString();
    const req = new NextRequest('http://localhost:3200/api/webhooks/publishing/callback', {
      method: 'POST',
      headers: {
        'x-bop-timestamp': currentTimestamp,
        'x-bop-signature': 'sig',
        'x-bop-event-id': 'evt-1',
      },
      body: '{}',
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('returns 401 when signature headers are missing', async () => {
    const req = new NextRequest('http://localhost:3200/api/webhooks/publishing/callback', {
      method: 'POST',
      body: '{}',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when signature is invalid', async () => {
    const req = new NextRequest('http://localhost:3200/api/webhooks/publishing/callback', {
      method: 'POST',
      headers: {
        'x-bop-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-bop-signature': 'invalid-sig',
        'x-bop-event-id': 'evt-1',
      },
      body: '{}',
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 200 { duplicate: true } on same event ID + same payload hash', async () => {
    mockRepository.recordWebhookReceipt.mockResolvedValueOnce({
      success: true,
      value: { id: 'wh-1', isNew: false, status: 'received' },
    });
    const body = { jobId, organizationId: orgId, provider: 'meta', externalEventId: 'evt-1' };
    const req = makeSignedRequest(body, 'evt-1');
    const rawBody = JSON.stringify(body);
    const { computePayloadHash } = await import('@/lib/webhooks/publication-hmac');
    const hash = computePayloadHash(rawBody);

    mockRepository.findWebhookEventByProviderAndExternalId.mockResolvedValueOnce({
      success: true,
      value: { payloadHash: hash },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
  });

  it('returns 409 Conflict on same event ID + DIFFERENT payload hash', async () => {
    mockRepository.recordWebhookReceipt.mockResolvedValueOnce({
      success: true,
      value: { id: 'wh-1', isNew: false, status: 'received' },
    });
    const body = { jobId, organizationId: orgId, provider: 'meta', externalEventId: 'evt-1' };
    const req = makeSignedRequest(body, 'evt-1');

    mockRepository.findWebhookEventByProviderAndExternalId.mockResolvedValueOnce({
      success: true,
      value: { payloadHash: 'different-hash-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Conflict');
  });

  it('processes evidence for valid signed payload and marks event processed', async () => {
    mockRepository.recordWebhookReceipt.mockResolvedValueOnce({
      success: true,
      value: { id: 'wh-1', isNew: true, status: 'received' },
    });
    mockRepository.findJobById.mockResolvedValueOnce({
      success: true,
      value: { id: jobId, organizationId: orgId, status: 'in_progress' },
    });
    mockRepository.markWebhookEventProcessed.mockResolvedValueOnce({ success: true, value: undefined });

    const body = { jobId, organizationId: orgId, provider: 'meta', externalEventId: 'evt-1' };
    const req = makeSignedRequest(body, 'evt-1');

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('EVIDENCE_RECORDED');
    expect(mockRepository.markWebhookEventProcessed).toHaveBeenCalledWith('wh-1', 'processed', expect.any(Object));
  });
});
