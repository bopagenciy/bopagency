/**
 * campaign-activation — snapshot + event helpers (dominio, Phase 8A.1).
 * Cubre: campaignActivationSnapshotSchema (shared) validando la forma del
 * CampaignActivationSnapshot construido por domain, isValidActivationEventType,
 * sanitizeActivationEventMetadata.
 */
import { describe, it, expect } from 'vitest';
import { campaignActivationSnapshotSchema, ACTIVATION_SNAPSHOT_SCHEMA_VERSION } from '@bop-agency/shared';
import { isValidActivationEventType, sanitizeActivationEventMetadata } from '../entities/campaign-activation-event';
import { ACTIVATION_SNAPSHOT_SCHEMA_VERSION as DOMAIN_SNAPSHOT_SCHEMA_VERSION } from '../entities/campaign-activation';

// ─── Consistencia de versión de schema entre domain y shared ──────────────────

describe('ACTIVATION_SNAPSHOT_SCHEMA_VERSION', () => {
  it('domain y shared usan el mismo valor de versión (guarda contra drift)', () => {
    expect(DOMAIN_SNAPSHOT_SCHEMA_VERSION).toBe(ACTIVATION_SNAPSHOT_SCHEMA_VERSION);
  });
});

// ─── campaignActivationSnapshotSchema ──────────────────────────────────────────

function buildValidSnapshot() {
  return {
    schemaVersion: ACTIVATION_SNAPSHOT_SCHEMA_VERSION,
    campaign: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Campaña de verano',
      objective: 'conversions',
      platform: 'meta_ads',
      budget: 1500.5,
      currency: 'COP',
      startDate: null,
      endDate: null,
    },
    generatedContent: null,
    metadata: { source: 'manual' },
    approval: {
      campaignApprovalId: '22222222-2222-2222-2222-222222222222',
      approvedAt: '2026-08-01T12:00:00.000Z',
      approvedBy: '33333333-3333-3333-3333-333333333333',
    },
  };
}

describe('campaignActivationSnapshotSchema', () => {
  it('acepta un snapshot bien formado sin generatedContent', () => {
    const result = campaignActivationSnapshotSchema.safeParse(buildValidSnapshot());
    expect(result.success).toBe(true);
  });

  it('rechaza schemaVersion incorrecta', () => {
    const snapshot = { ...buildValidSnapshot(), schemaVersion: 'wrong-version' };
    const result = campaignActivationSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(false);
  });

  it('acepta un snapshot que incluye googleAdsConfig válido', () => {
    const snapshot = {
      ...buildValidSnapshot(),
      campaign: {
        ...buildValidSnapshot().campaign,
        platform: 'google_ads',
      },
      googleAdsConfig: {
        dailyBudget: { amount: 50, currency: 'USD' },
        biddingStrategy: 'MAXIMIZE_CLICKS',
        finalUrl: 'https://example.com/promo',
        geoTargetIds: ['2170'],
        languageCriterionIds: ['1003'],
        keywordMatchPolicy: 'PHRASE',
        negativeKeywordMatchPolicy: 'BROAD',
      },
    };
    const result = campaignActivationSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.googleAdsConfig?.biddingStrategy).toBe('MAXIMIZE_CLICKS');
    }
  });

  it('un snapshot legacy sin googleAdsConfig sigue siendo válido', () => {
    const snapshot = buildValidSnapshot();
    const result = campaignActivationSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.googleAdsConfig).toBeUndefined();
    }
  });

  it('rechaza budget negativo', () => {
    const snapshot = buildValidSnapshot();
    snapshot.campaign.budget = -10;
    const result = campaignActivationSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(false);
  });

  it('rechaza platform fuera de AD_PLATFORMS', () => {
    const snapshot = { ...buildValidSnapshot(), campaign: { ...buildValidSnapshot().campaign, platform: 'myspace_ads' } };
    const result = campaignActivationSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(false);
  });

  it('rechaza approval.campaignApprovalId que no es un UUID', () => {
    const snapshot = buildValidSnapshot();
    (snapshot.approval as { campaignApprovalId: string }).campaignApprovalId = 'not-a-uuid';
    const result = campaignActivationSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(false);
  });

  it('rechaza campaign.name vacío', () => {
    const snapshot = { ...buildValidSnapshot(), campaign: { ...buildValidSnapshot().campaign, name: '' } };
    const result = campaignActivationSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(false);
  });

  it('nunca acepta claves de nivel superior no declaradas como parte del "approval" (no permite credenciales coladas ahí)', () => {
    const snapshot = buildValidSnapshot();
    const withExtra = {
      ...snapshot,
      approval: { ...snapshot.approval, accessToken: 'should-not-be-here' },
    };
    // Zod object() por defecto STRIPS claves desconocidas (no las rechaza,
    // pero tampoco las conserva) — se verifica aquí que el resultado
    // parseado NO contiene el campo espurio.
    const result = campaignActivationSnapshotSchema.safeParse(withExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('accessToken' in result.data.approval).toBe(false);
    }
  });
});

// ─── isValidActivationEventType ────────────────────────────────────────────────

describe('isValidActivationEventType', () => {
  it('acepta los 6 tipos definidos', () => {
    const validTypes = [
      'activation_created',
      'target_added',
      'target_removed',
      'activation_status_changed',
      'target_status_changed',
      'activation_cancelled',
    ];
    for (const t of validTypes) {
      expect(isValidActivationEventType(t)).toBe(true);
    }
  });

  it('rechaza tipos inventados', () => {
    expect(isValidActivationEventType('activation_published')).toBe(false);
    expect(isValidActivationEventType('')).toBe(false);
  });
});

// ─── sanitizeActivationEventMetadata ───────────────────────────────────────────

describe('sanitizeActivationEventMetadata', () => {
  it('filtra claves con fragmentos prohibidos (secret/token/key/password/auth/credential/...)', () => {
    const input = {
      accessToken: 'abc',
      apiKey: 'xyz',
      password: '1234',
      authHeader: 'Bearer abc',
      userEmail: 'a@b.com',
      safeField: 'ok',
      channel: 'manual',
    };
    const result = sanitizeActivationEventMetadata(input);
    expect(result).toEqual({ safeField: 'ok', channel: 'manual' });
  });

  it('conserva metadata sin claves prohibidas intacta', () => {
    const input = { channel: 'meta_ads', provider: 'meta' };
    expect(sanitizeActivationEventMetadata(input)).toEqual(input);
  });

  it('metadata vacía retorna objeto vacío', () => {
    expect(sanitizeActivationEventMetadata({})).toEqual({});
  });
});
