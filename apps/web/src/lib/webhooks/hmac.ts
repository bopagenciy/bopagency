/**
 * HMAC Webhook Utilities — server-only
 *
 * Utilidades para firmar y verificar requests HMAC SHA-256 entre
 * BopIAgency y n8n. Usadas por:
 *   - La webhook route entrante (/api/webhooks/n8n/route.ts) para
 *     verificar callbacks de n8n.
 *   - El N8nWebhookDispatcher para firmar requests salientes hacia n8n.
 *
 * PROTOCOLO:
 *   Canonical string: `${timestamp}.${rawBody}`
 *   Firma:            hex(HMAC_SHA256(AUTOMATION_WEBHOOK_SECRET, canonical))
 *
 * HEADERS:
 *   X-Bop-Timestamp  — Unix seconds (string)
 *   X-Bop-Signature  — hex HMAC SHA-256
 *   X-Bop-Event-Id   — UUID único del evento (idempotencia)
 *
 * SEGURIDAD:
 *   - server-only: nunca importar desde Client Components.
 *   - AUTOMATION_WEBHOOK_SECRET nunca se loguea ni expone.
 *   - Comparación constant-time (timingSafeEqual) previene timing attacks.
 *   - Ventana de tolerancia configurable via AUTOMATION_WEBHOOK_TOLERANCE_SECONDS.
 *   - Replay protection: timestamp + external_event_id únicos.
 */
import 'server-only';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

// ─── Header names ─────────────────────────────────────────────────────────────

export const BOP_TIMESTAMP_HEADER = 'x-bop-timestamp' as const;
export const BOP_SIGNATURE_HEADER = 'x-bop-signature' as const;
export const BOP_EVENT_ID_HEADER = 'x-bop-event-id' as const;

// ─── Error types ──────────────────────────────────────────────────────────────

export type HmacErrorCode =
  | 'MISSING_SIGNATURE'
  | 'INVALID_SIGNATURE'
  | 'STALE_TIMESTAMP'
  | 'MISSING_EVENT_ID'
  | 'DUPLICATE_EVENT'
  | 'INVALID_PAYLOAD';

export class HmacError extends Error {
  constructor(
    public readonly code: HmacErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HmacError';
  }
}

// ─── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_TOLERANCE_SECONDS = 300;
const MIN_TOLERANCE_SECONDS = 30;
const MAX_TOLERANCE_SECONDS = 3_600;

/**
 * Lee la tolerancia de timestamp desde env var.
 * Si no está configurada o es inválida, usa el default seguro (300s = 5min).
 */
export function getToleranceSeconds(): number {
  const raw = process.env['AUTOMATION_WEBHOOK_TOLERANCE_SECONDS'];
  if (!raw) return DEFAULT_TOLERANCE_SECONDS;
  const parsed = parseInt(raw, 10);
  if (
    isNaN(parsed) ||
    parsed < MIN_TOLERANCE_SECONDS ||
    parsed > MAX_TOLERANCE_SECONDS
  ) {
    return DEFAULT_TOLERANCE_SECONDS;
  }
  return parsed;
}

/**
 * Obtiene y valida el secreto HMAC desde env var.
 * Lanza error si no está configurado o es demasiado corto (< 32 chars).
 *
 * SEGURIDAD: NUNCA loguear el valor retornado.
 */
export function requireWebhookSecret(): Buffer {
  const secret = process.env['AUTOMATION_WEBHOOK_SECRET'];
  if (!secret || secret.trim().length < 32) {
    throw new Error('[webhook] AUTOMATION_WEBHOOK_SECRET no está configurado correctamente');
  }
  return Buffer.from(secret, 'utf-8');
}

// ─── Core crypto primitives ───────────────────────────────────────────────────

/**
 * Computa HMAC SHA-256 sobre `timestamp.rawBody` (canonical string).
 * Retorna hex string de 64 caracteres.
 *
 * @param secretBuf  - Buffer del secreto
 * @param timestamp  - Unix seconds como string
 * @param rawBody    - Body exacto transmitido (sin reserializar)
 */
export function computeHmacSignature(
  secretBuf: Buffer,
  timestamp: string,
  rawBody: string,
): string {
  const canonical = `${timestamp}.${rawBody}`;
  return createHmac('sha256', secretBuf).update(canonical, 'utf-8').digest('hex');
}

/**
 * Computa SHA-256 del body para almacenar como `payload_hash`.
 * Permite verificar integridad sin almacenar el raw body completo.
 */
export function computePayloadHash(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf-8').digest('hex');
}

/**
 * Comparación constant-time entre dos firmas hex.
 * Previene timing attacks que revelarían información sobre la firma correcta.
 * Retorna false si las longitudes difieren.
 */
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

/**
 * Verifica si el timestamp está dentro de la ventana de tolerancia.
 * Acepta timestamps en el pasado y futuro (dentro del rango).
 *
 * @param timestamp        - Unix seconds como string
 * @param toleranceSeconds - Override opcional (usa env var si omitido)
 */
export function isTimestampWithinTolerance(
  timestamp: string,
  toleranceSeconds?: number,
): boolean {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || ts <= 0) return false;
  const now = Math.floor(Date.now() / 1000);
  const tolerance = toleranceSeconds ?? getToleranceSeconds();
  return Math.abs(now - ts) <= tolerance;
}

// ─── High-level verification ──────────────────────────────────────────────────

export type VerifyResult =
  | { ok: true; eventId: string; timestamp: string; payloadHash: string }
  | { ok: false; error: HmacError };

/**
 * Verifica la firma HMAC de un request entrante de n8n.
 *
 * Flujo estricto:
 * 1. Verificar presencia de event-id (idempotencia)
 * 2. Verificar presencia de timestamp y signature
 * 3. Verificar timestamp dentro de tolerancia
 * 4. Verificar firma HMAC (constant-time)
 *
 * SEGURIDAD: NO crear cliente Supabase antes de llamar esta función.
 * Si retorna ok: false → rechazar inmediatamente con 401/403.
 */
export function verifyIncomingWebhook(
  rawHeaders: {
    timestamp: string | null;
    signature: string | null;
    eventId: string | null;
  },
  rawBody: string,
): VerifyResult {
  const { timestamp, signature, eventId } = rawHeaders;

  // 1. Event ID obligatorio
  if (!eventId || eventId.trim().length === 0) {
    return {
      ok: false,
      error: new HmacError('MISSING_EVENT_ID', 'Missing required header: X-Bop-Event-Id'),
    };
  }

  // 2. Timestamp y signature obligatorios
  if (!timestamp || !signature) {
    return {
      ok: false,
      error: new HmacError(
        'MISSING_SIGNATURE',
        'Missing required headers: X-Bop-Timestamp and/or X-Bop-Signature',
      ),
    };
  }

  // 3. Timestamp dentro de tolerancia
  if (!isTimestampWithinTolerance(timestamp)) {
    return {
      ok: false,
      error: new HmacError(
        'STALE_TIMESTAMP',
        'Request timestamp is outside the allowed tolerance window',
      ),
    };
  }

  // 4. Verificar firma HMAC
  let secret: Buffer;
  try {
    secret = requireWebhookSecret();
  } catch (err) {
    throw err; // Error de configuración — relanzar para que el caller retorne 500
  }

  const expected = computeHmacSignature(secret, timestamp, rawBody);

  if (!constantTimeCompare(signature, expected)) {
    return {
      ok: false,
      error: new HmacError('INVALID_SIGNATURE', 'Signature verification failed'),
    };
  }

  return {
    ok: true,
    eventId: eventId.trim(),
    timestamp,
    payloadHash: computePayloadHash(rawBody),
  };
}

// ─── Outgoing signature builder ───────────────────────────────────────────────

/**
 * Construye los headers de firma para requests SALIENTES hacia n8n.
 * El dispatcher los añade a cada POST hacia n8n.
 *
 * @param rawBody  - Body serializado que se enviará
 * @param eventId  - ID único del evento (idempotencyKey o UUID)
 */
export function buildOutgoingSignatureHeaders(
  rawBody: string,
  eventId: string,
): Record<string, string> {
  const secret = requireWebhookSecret();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = computeHmacSignature(secret, timestamp, rawBody);

  return {
    [BOP_TIMESTAMP_HEADER]: timestamp,
    [BOP_SIGNATURE_HEADER]: signature,
    [BOP_EVENT_ID_HEADER]: eventId,
  };
}
