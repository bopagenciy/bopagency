import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  requirePublicationWebhookSecret,
  computePublicationHmac,
  computePayloadHash,
  verifyIncomingPublicationWebhook,
} from '../publication-hmac';

describe('Publication HMAC Webhook Utilities (Phase 8B.3)', () => {
  const originalEnv = process.env;
  const validSecret = 'publication-secret-key-at-least-32-chars-long!!';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['PUBLICATION_WEBHOOK_SECRET'] = validSecret;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails closed if PUBLICATION_WEBHOOK_SECRET is missing or < 32 chars', () => {
    delete process.env['PUBLICATION_WEBHOOK_SECRET'];
    expect(() => requirePublicationWebhookSecret()).toThrow('PUBLICATION_WEBHOOK_SECRET');

    process.env['PUBLICATION_WEBHOOK_SECRET'] = 'short-secret';
    expect(() => requirePublicationWebhookSecret()).toThrow('PUBLICATION_WEBHOOK_SECRET');
  });

  it('verifies valid incoming publication webhook signature', () => {
    const rawBody = JSON.stringify({ jobId: 'job-1', outcome: 'succeeded' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secretBuf = Buffer.from(validSecret, 'utf-8');
    const signature = computePublicationHmac(secretBuf, timestamp, rawBody);
    const eventId = 'evt-123';

    const result = verifyIncomingPublicationWebhook(
      { timestamp, signature, eventId },
      rawBody,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.eventId).toBe('evt-123');
    expect(result.payloadHash).toBe(computePayloadHash(rawBody));
  });

  it('rejects missing eventId', () => {
    const result = verifyIncomingPublicationWebhook(
      { timestamp: '10000', signature: 'sig', eventId: null },
      '{}',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MISSING_EVENT_ID');
  });

  it('rejects stale timestamp', () => {
    const staleTimestamp = (Math.floor(Date.now() / 1000) - 1000).toString();
    const result = verifyIncomingPublicationWebhook(
      { timestamp: staleTimestamp, signature: 'sig', eventId: 'evt-1' },
      '{}',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('STALE_TIMESTAMP');
  });

  it('rejects invalid signature', () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const result = verifyIncomingPublicationWebhook(
      { timestamp, signature: 'bad-signature', eventId: 'evt-1' },
      '{}',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_SIGNATURE');
  });
});
