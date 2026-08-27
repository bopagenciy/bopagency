/**
 * Publication HMAC Webhook Utilities — Phase 8B.3 (server-only)
 *
 * Utilidades de crypto y verificación HMAC SHA-256 para webhooks de publicación.
 *
 * REGLAS DE SEGURIDAD:
 *   - Usa EXCLUSIVAMENTE `PUBLICATION_WEBHOOK_SECRET` (mínimo 32 caracteres).
 *   - NUNCA realiza fallback silencioso a `AUTOMATION_WEBHOOK_SECRET`.
 *   - Comparación constant-time previene timing attacks.
 *   - Tolerancia de timestamp por defecto: 300 segundos (5 minutos).
 */

import 'server-only';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

export const BOP_TIMESTAMP_HEADER = 'x-bop-timestamp' as const;
export const BOP_SIGNATURE_HEADER = 'x-bop-signature' as const;
export const BOP_EVENT_ID_HEADER = 'x-bop-event-id' as const;

export type HmacErrorCode =
  | 'MISSING_SIGNATURE'
  | 'INVALID_SIGNATURE'
  | 'STALE_TIMESTAMP'
  | 'MISSING_EVENT_ID';

export class PublicationHmacError extends Error {
  constructor(
    public readonly code: HmacErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PublicationHmacError';
  }
}

const DEFAULT_TOLERANCE_SECONDS = 300;

export function requirePublicationWebhookSecret(): Buffer {
  const secret = process.env['PUBLICATION_WEBHOOK_SECRET'];
  if (!secret || secret.trim().length < 32) {
    throw new Error('[publication-webhook] PUBLICATION_WEBHOOK_SECRET no está configurado correctamente (se requiere string >= 32 caracteres)');
  }
  return Buffer.from(secret.trim(), 'utf-8');
}

export function computePublicationHmac(
  secretBuf: Buffer,
  timestamp: string,
  rawBody: string,
): string {
  const canonical = `${timestamp}.${rawBody}`;
  return createHmac('sha256', secretBuf).update(canonical, 'utf-8').digest('hex');
}

export function computePayloadHash(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf-8').digest('hex');
}

export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function isTimestampWithinTolerance(
  timestamp: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || ts <= 0) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= toleranceSeconds;
}

export type VerifyPublicationWebhookResult =
  | { ok: true; eventId: string; timestamp: string; payloadHash: string }
  | { ok: false; error: PublicationHmacError };

export function verifyIncomingPublicationWebhook(
  rawHeaders: {
    timestamp: string | null;
    signature: string | null;
    eventId: string | null;
  },
  rawBody: string,
): VerifyPublicationWebhookResult {
  const { timestamp, signature, eventId } = rawHeaders;

  if (!eventId || eventId.trim().length === 0) {
    return {
      ok: false,
      error: new PublicationHmacError('MISSING_EVENT_ID', 'Missing header: x-bop-event-id'),
    };
  }

  if (!timestamp || !signature) {
    return {
      ok: false,
      error: new PublicationHmacError(
        'MISSING_SIGNATURE',
        'Missing headers: x-bop-timestamp and/or x-bop-signature',
      ),
    };
  }

  if (!isTimestampWithinTolerance(timestamp)) {
    return {
      ok: false,
      error: new PublicationHmacError(
        'STALE_TIMESTAMP',
        'Request timestamp is outside allowed tolerance window',
      ),
    };
  }

  let secretBuf: Buffer;
  try {
    secretBuf = requirePublicationWebhookSecret();
  } catch (err) {
    throw err;
  }

  const expectedSignature = computePublicationHmac(secretBuf, timestamp, rawBody);

  if (!constantTimeCompare(signature, expectedSignature)) {
    return {
      ok: false,
      error: new PublicationHmacError('INVALID_SIGNATURE', 'Signature verification failed'),
    };
  }

  return {
    ok: true,
    eventId: eventId.trim(),
    timestamp,
    payloadHash: computePayloadHash(rawBody),
  };
}
