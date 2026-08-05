/**
 * Tests de seguridad para HMAC webhook utilities
 *
 * Cobertura:
 *   A. computeHmacSignature — firma correcta, body alterado
 *   B. constantTimeCompare — timing-safe compare
 *   C. isTimestampWithinTolerance — pasado válido, viejo, futuro excedido
 *   D. verifyIncomingWebhook — flujo completo de verificación
 *   E. buildOutgoingSignatureHeaders — headers correctos para dispatch
 *   F. computePayloadHash — hash correcto y estable
 */
import { describe, it, expect, vi } from 'vitest';

// Mock server-only (jsdom environment no soporta server-only guard)
vi.mock('server-only', () => ({}));

// Mock process.env ANTES de importar el módulo
const MOCK_SECRET = 'a'.repeat(32); // 32 chars mínimo

vi.stubEnv('AUTOMATION_WEBHOOK_SECRET', MOCK_SECRET);
vi.stubEnv('AUTOMATION_WEBHOOK_TOLERANCE_SECONDS', '300');

import {
  computeHmacSignature,
  computePayloadHash,
  constantTimeCompare,
  isTimestampWithinTolerance,
  verifyIncomingWebhook,
  buildOutgoingSignatureHeaders,
  requireWebhookSecret,
  getToleranceSeconds,
  BOP_TIMESTAMP_HEADER,
  BOP_SIGNATURE_HEADER,
  BOP_EVENT_ID_HEADER,
  HmacError,
} from '../hmac';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SECRET_BUF = Buffer.from(MOCK_SECRET, 'utf-8');
const SAMPLE_BODY = JSON.stringify({ executionId: 'exec-1', organizationId: 'org-1' });
const SAMPLE_EVENT_ID = 'evt-uuid-1234';
const nowSeconds = () => Math.floor(Date.now() / 1000).toString();

// ─── A. computeHmacSignature ──────────────────────────────────────────────────

describe('computeHmacSignature', () => {
  it('retorna hex de 64 chars (SHA-256)', () => {
    const sig = computeHmacSignature(SECRET_BUF, '1234567890', SAMPLE_BODY);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('es determinista — mismo input produce mismo output', () => {
    const a = computeHmacSignature(SECRET_BUF, '1234567890', SAMPLE_BODY);
    const b = computeHmacSignature(SECRET_BUF, '1234567890', SAMPLE_BODY);
    expect(a).toBe(b);
  });

  it('body alterado produce firma diferente', () => {
    const ts = '1234567890';
    const original = computeHmacSignature(SECRET_BUF, ts, SAMPLE_BODY);
    const tampered = computeHmacSignature(SECRET_BUF, ts, SAMPLE_BODY + 'X');
    expect(original).not.toBe(tampered);
  });

  it('timestamp alterado produce firma diferente', () => {
    const sig1 = computeHmacSignature(SECRET_BUF, '1000000000', SAMPLE_BODY);
    const sig2 = computeHmacSignature(SECRET_BUF, '9999999999', SAMPLE_BODY);
    expect(sig1).not.toBe(sig2);
  });

  it('secreto diferente produce firma diferente', () => {
    const otherSecret = Buffer.from('b'.repeat(32), 'utf-8');
    const sig1 = computeHmacSignature(SECRET_BUF, '1234567890', SAMPLE_BODY);
    const sig2 = computeHmacSignature(otherSecret, '1234567890', SAMPLE_BODY);
    expect(sig1).not.toBe(sig2);
  });
});

// ─── B. constantTimeCompare ───────────────────────────────────────────────────

describe('constantTimeCompare', () => {
  it('retorna true para strings hex idénticos', () => {
    const sig = computeHmacSignature(SECRET_BUF, '1234567890', SAMPLE_BODY);
    expect(constantTimeCompare(sig, sig)).toBe(true);
  });

  it('retorna false si las firmas difieren', () => {
    const a = computeHmacSignature(SECRET_BUF, '1000000000', SAMPLE_BODY);
    const b = computeHmacSignature(SECRET_BUF, '2000000000', SAMPLE_BODY);
    expect(constantTimeCompare(a, b)).toBe(false);
  });

  it('retorna false si las longitudes difieren (no revela info por timing)', () => {
    const valid = computeHmacSignature(SECRET_BUF, '1234567890', SAMPLE_BODY);
    expect(constantTimeCompare(valid, 'short')).toBe(false);
    expect(constantTimeCompare('short', valid)).toBe(false);
  });

  it('retorna false para strings vacíos vs firma válida', () => {
    const sig = computeHmacSignature(SECRET_BUF, '1234567890', SAMPLE_BODY);
    expect(constantTimeCompare('', sig)).toBe(false);
    expect(constantTimeCompare(sig, '')).toBe(false);
  });
});

// ─── C. isTimestampWithinTolerance ────────────────────────────────────────────

describe('isTimestampWithinTolerance', () => {
  it('timestamp actual es válido', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    expect(isTimestampWithinTolerance(ts)).toBe(true);
  });

  it('timestamp hace 299s es válido (dentro de 300s default)', () => {
    const ts = (Math.floor(Date.now() / 1000) - 299).toString();
    expect(isTimestampWithinTolerance(ts)).toBe(true);
  });

  it('timestamp hace 301s es inválido (excede 300s default)', () => {
    const ts = (Math.floor(Date.now() / 1000) - 301).toString();
    expect(isTimestampWithinTolerance(ts)).toBe(false);
  });

  it('timestamp futuro dentro de tolerancia es válido', () => {
    const ts = (Math.floor(Date.now() / 1000) + 60).toString();
    expect(isTimestampWithinTolerance(ts)).toBe(true);
  });

  it('timestamp futuro muy lejano (+400s) es inválido', () => {
    const ts = (Math.floor(Date.now() / 1000) + 400).toString();
    expect(isTimestampWithinTolerance(ts)).toBe(false);
  });

  it('tolerancia custom sobreescribe default', () => {
    const ts = (Math.floor(Date.now() / 1000) - 50).toString();
    expect(isTimestampWithinTolerance(ts, 30)).toBe(false);
    expect(isTimestampWithinTolerance(ts, 60)).toBe(true);
  });

  it('timestamp no numérico es inválido', () => {
    expect(isTimestampWithinTolerance('not-a-number')).toBe(false);
    expect(isTimestampWithinTolerance('')).toBe(false);
  });

  it('timestamp cero es inválido', () => {
    expect(isTimestampWithinTolerance('0')).toBe(false);
  });
});

// ─── D. verifyIncomingWebhook — flujo completo ────────────────────────────────

describe('verifyIncomingWebhook', () => {
  function makeValidHeaders(
    body: string = SAMPLE_BODY,
    overrides: Partial<{ timestamp: string; signature: string; eventId: string }> = {},
  ) {
    const timestamp = nowSeconds();
    const signature = computeHmacSignature(SECRET_BUF, timestamp, body);
    return {
      timestamp,
      signature,
      eventId: SAMPLE_EVENT_ID,
      ...overrides,
    };
  }

  it('retorna ok: true con firma válida', () => {
    const headers = makeValidHeaders();
    const result = verifyIncomingWebhook(headers, SAMPLE_BODY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.eventId).toBe(SAMPLE_EVENT_ID);
      expect(result.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('retorna MISSING_EVENT_ID si falta event-id', () => {
    const headers = makeValidHeaders(SAMPLE_BODY, { eventId: '' });
    const result = verifyIncomingWebhook({ ...headers, eventId: null }, SAMPLE_BODY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('MISSING_EVENT_ID');
  });

  it('retorna MISSING_SIGNATURE si falta timestamp', () => {
    const headers = makeValidHeaders();
    const result = verifyIncomingWebhook({ ...headers, timestamp: null }, SAMPLE_BODY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('MISSING_SIGNATURE');
  });

  it('retorna MISSING_SIGNATURE si falta signature', () => {
    const headers = makeValidHeaders();
    const result = verifyIncomingWebhook({ ...headers, signature: null }, SAMPLE_BODY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('MISSING_SIGNATURE');
  });

  it('retorna STALE_TIMESTAMP si el timestamp es muy viejo', () => {
    const oldTs = (Math.floor(Date.now() / 1000) - 400).toString();
    const signature = computeHmacSignature(SECRET_BUF, oldTs, SAMPLE_BODY);
    const result = verifyIncomingWebhook(
      { timestamp: oldTs, signature, eventId: SAMPLE_EVENT_ID },
      SAMPLE_BODY,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STALE_TIMESTAMP');
  });

  it('retorna STALE_TIMESTAMP si el timestamp es del futuro lejano', () => {
    const futureTs = (Math.floor(Date.now() / 1000) + 400).toString();
    const signature = computeHmacSignature(SECRET_BUF, futureTs, SAMPLE_BODY);
    const result = verifyIncomingWebhook(
      { timestamp: futureTs, signature, eventId: SAMPLE_EVENT_ID },
      SAMPLE_BODY,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STALE_TIMESTAMP');
  });

  it('retorna INVALID_SIGNATURE si el body fue alterado', () => {
    const headers = makeValidHeaders(SAMPLE_BODY);
    const tamperedBody = SAMPLE_BODY + '{"injected":true}';
    const result = verifyIncomingWebhook(headers, tamperedBody);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_SIGNATURE');
  });

  it('retorna INVALID_SIGNATURE si el timestamp fue alterado', () => {
    const headers = makeValidHeaders();
    const alteredTimestamp = (parseInt(headers.timestamp) - 1).toString();
    const result = verifyIncomingWebhook(
      { ...headers, timestamp: alteredTimestamp },
      SAMPLE_BODY,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_SIGNATURE');
  });

  it('retorna INVALID_SIGNATURE con firma incorrecta', () => {
    const headers = makeValidHeaders();
    const result = verifyIncomingWebhook(
      { ...headers, signature: 'a'.repeat(64) },
      SAMPLE_BODY,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_SIGNATURE');
  });

  it('HmacError tiene el código correcto como propiedad', () => {
    const result = verifyIncomingWebhook({ timestamp: null, signature: null, eventId: null }, '');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(HmacError);
      expect(result.error.code).toBeDefined();
    }
  });

  it('el mensaje de error no contiene la firma esperada ni el secreto', () => {
    const headers = makeValidHeaders();
    const result = verifyIncomingWebhook({ ...headers, signature: 'x'.repeat(64) }, SAMPLE_BODY);
    if (!result.ok) {
      expect(result.error.message).not.toContain(MOCK_SECRET);
      expect(result.error.message).not.toContain(headers.signature);
    }
  });
});

// ─── E. buildOutgoingSignatureHeaders ─────────────────────────────────────────

describe('buildOutgoingSignatureHeaders', () => {
  it('incluye los 3 headers correctos', () => {
    const headers = buildOutgoingSignatureHeaders(SAMPLE_BODY, SAMPLE_EVENT_ID);
    expect(headers[BOP_TIMESTAMP_HEADER]).toBeDefined();
    expect(headers[BOP_SIGNATURE_HEADER]).toBeDefined();
    expect(headers[BOP_EVENT_ID_HEADER]).toBe(SAMPLE_EVENT_ID);
  });

  it('la firma generada es verificable con verifyIncomingWebhook', () => {
    const outHeaders = buildOutgoingSignatureHeaders(SAMPLE_BODY, SAMPLE_EVENT_ID);
    const result = verifyIncomingWebhook(
      {
        timestamp: outHeaders[BOP_TIMESTAMP_HEADER] ?? null,
        signature: outHeaders[BOP_SIGNATURE_HEADER] ?? null,
        eventId:   outHeaders[BOP_EVENT_ID_HEADER] ?? null,
      },
      SAMPLE_BODY,
    );
    expect(result.ok).toBe(true);
  });

  it('timestamp es unix seconds válido', () => {
    const headers = buildOutgoingSignatureHeaders(SAMPLE_BODY, SAMPLE_EVENT_ID);
    const ts = parseInt(headers[BOP_TIMESTAMP_HEADER] ?? '0');
    const now = Math.floor(Date.now() / 1000);
    expect(ts).toBeGreaterThan(now - 5);
    expect(ts).toBeLessThanOrEqual(now + 1);
  });
});

// ─── F. computePayloadHash ────────────────────────────────────────────────────

describe('computePayloadHash', () => {
  it('retorna hex SHA-256 de 64 chars', () => {
    const hash = computePayloadHash(SAMPLE_BODY);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('es determinista', () => {
    expect(computePayloadHash(SAMPLE_BODY)).toBe(computePayloadHash(SAMPLE_BODY));
  });

  it('body diferente produce hash diferente', () => {
    expect(computePayloadHash(SAMPLE_BODY)).not.toBe(computePayloadHash(SAMPLE_BODY + 'X'));
  });
});

// ─── G. requireWebhookSecret y getToleranceSeconds ───────────────────────────

describe('requireWebhookSecret', () => {
  it('no lanza si el secreto tiene >= 32 chars', () => {
    expect(() => requireWebhookSecret()).not.toThrow();
  });

  it('lanza si el secreto es demasiado corto', () => {
    vi.stubEnv('AUTOMATION_WEBHOOK_SECRET', 'short');
    expect(() => requireWebhookSecret()).toThrow();
    vi.stubEnv('AUTOMATION_WEBHOOK_SECRET', MOCK_SECRET);
  });

  it('retorna Buffer sin exponer el secreto en string', () => {
    const buf = requireWebhookSecret();
    expect(buf).toBeInstanceOf(Buffer);
  });
});

describe('getToleranceSeconds', () => {
  it('usa default 300 si la env var no está configurada', () => {
    vi.stubEnv('AUTOMATION_WEBHOOK_TOLERANCE_SECONDS', '');
    expect(getToleranceSeconds()).toBe(300);
    vi.stubEnv('AUTOMATION_WEBHOOK_TOLERANCE_SECONDS', '300');
  });

  it('respeta valor configurado dentro del rango válido', () => {
    vi.stubEnv('AUTOMATION_WEBHOOK_TOLERANCE_SECONDS', '120');
    expect(getToleranceSeconds()).toBe(120);
    vi.stubEnv('AUTOMATION_WEBHOOK_TOLERANCE_SECONDS', '300');
  });

  it('usa default si el valor es demasiado bajo (< 30)', () => {
    vi.stubEnv('AUTOMATION_WEBHOOK_TOLERANCE_SECONDS', '10');
    expect(getToleranceSeconds()).toBe(300);
    vi.stubEnv('AUTOMATION_WEBHOOK_TOLERANCE_SECONDS', '300');
  });

  it('usa default si el valor es demasiado alto (> 3600)', () => {
    vi.stubEnv('AUTOMATION_WEBHOOK_TOLERANCE_SECONDS', '9999');
    expect(getToleranceSeconds()).toBe(300);
    vi.stubEnv('AUTOMATION_WEBHOOK_TOLERANCE_SECONDS', '300');
  });
});
