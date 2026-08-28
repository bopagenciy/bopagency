/**
 * campaign-publication-event (dominio) - tests unitarios (Phase 8B.1).
 * Cubre: sanitizacion de metadata (nunca secretos/tokens), validacion de
 * event_type cerrado.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidPublicationEventType,
  sanitizePublicationEventMetadata,
  campaignPublicationEventId,
} from '../entities/campaign-publication-event';

describe('isValidPublicationEventType', () => {
  it('acepta los tipos cerrados', () => {
    expect(isValidPublicationEventType('job_queued')).toBe(true);
    expect(isValidPublicationEventType('job_reconciled')).toBe(true);
    expect(isValidPublicationEventType('webhook_received')).toBe(true);
  });

  it('rechaza tipos arbitrarios', () => {
    expect(isValidPublicationEventType('job_deleted')).toBe(false);
    expect(isValidPublicationEventType('')).toBe(false);
  });
});

describe('sanitizePublicationEventMetadata — NUNCA secretos/tokens (S18)', () => {
  it('filtra claves con fragmentos prohibidos', () => {
    const input = {
      accessToken: 'abc',
      apiKey: 'xyz',
      clientSecret: 's3cr3t',
      password: 'hunter2',
      authHeader: 'Bearer abc',
      credentialRef: 'ref',
      privateKey: 'pk',
      bearerToken: 'bt',
      oauthCode: 'code',
      contactEmail: 'a@b.com',
      phoneNumber: '555',
      ssnDigits: '123',
      safeField: 'ok',
      attemptCount: 3,
    };

    const result = sanitizePublicationEventMetadata(input);

    expect(result).toEqual({ safeField: 'ok', attemptCount: 3 });
  });

  it('es case-insensitive sobre el nombre de la clave', () => {
    const result = sanitizePublicationEventMetadata({ ApiKEY: 'x', ok: 1 });
    expect(result).toEqual({ ok: 1 });
  });

  it('objeto vacio produce objeto vacio', () => {
    expect(sanitizePublicationEventMetadata({})).toEqual({});
  });
});

describe('campaignPublicationEventId', () => {
  it('rechaza id vacio', () => {
    expect(() => campaignPublicationEventId('')).toThrow();
  });
});
