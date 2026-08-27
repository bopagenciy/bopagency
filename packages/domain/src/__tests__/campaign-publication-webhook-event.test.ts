/**
 * campaign-publication-webhook-event (dominio) - tests unitarios (Phase 8B.1).
 */
import { describe, it, expect } from 'vitest';
import {
  isValidPayloadHash,
  campaignPublicationWebhookEventId,
} from '../entities/campaign-publication-webhook-event';

describe('isValidPayloadHash', () => {
  it('acepta un SHA-256 hex de 64 caracteres', () => {
    expect(isValidPayloadHash('a'.repeat(64))).toBe(true);
    expect(isValidPayloadHash('0123456789abcdef'.repeat(4))).toBe(true);
  });

  it('rechaza longitudes/caracteres invalidos', () => {
    expect(isValidPayloadHash('a'.repeat(63))).toBe(false);
    expect(isValidPayloadHash('a'.repeat(65))).toBe(false);
    expect(isValidPayloadHash('A'.repeat(64))).toBe(false); // mayusculas no permitidas
    expect(isValidPayloadHash('z'.repeat(64))).toBe(false); // fuera de [0-9a-f]
    expect(isValidPayloadHash('')).toBe(false);
  });
});

describe('campaignPublicationWebhookEventId', () => {
  it('rechaza id vacio', () => {
    expect(() => campaignPublicationWebhookEventId('')).toThrow();
  });
});
