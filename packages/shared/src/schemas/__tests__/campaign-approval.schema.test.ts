import { describe, it, expect } from 'vitest';
import {
  submitCampaignForReviewSchema,
  approveCampaignSchema,
  rejectCampaignSchema,
  complianceRuleFilterSchema,
} from '../campaign.schema';

// ─── submitCampaignForReviewSchema ─────────────────────────────────────────────

describe('submitCampaignForReviewSchema', () => {
  it('acepta un campaignId válido', () => {
    const result = submitCampaignForReviewSchema.safeParse({ campaignId: 'campaign-uuid-1' });
    expect(result.success).toBe(true);
  });

  it('rechaza campaignId vacío', () => {
    const result = submitCampaignForReviewSchema.safeParse({ campaignId: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza payload sin campaignId', () => {
    const result = submitCampaignForReviewSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('nunca acepta organizationId/actorUserId aunque se envíen (se ignoran, no se validan)', () => {
    const result = submitCampaignForReviewSchema.safeParse({
      campaignId: 'campaign-uuid-1',
      organizationId: 'org-uuid-attacker-supplied',
      actorUserId: 'user-uuid-attacker-supplied',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // El schema no define esos campos — parse() los descarta silenciosamente.
      expect(result.data).toEqual({ campaignId: 'campaign-uuid-1' });
    }
  });
});

// ─── approveCampaignSchema ──────────────────────────────────────────────────────

describe('approveCampaignSchema', () => {
  it('acepta un campaignId válido', () => {
    const result = approveCampaignSchema.safeParse({ campaignId: 'campaign-uuid-1' });
    expect(result.success).toBe(true);
  });

  it('rechaza campaignId vacío', () => {
    const result = approveCampaignSchema.safeParse({ campaignId: '' });
    expect(result.success).toBe(false);
  });
});

// ─── rejectCampaignSchema ───────────────────────────────────────────────────────

describe('rejectCampaignSchema', () => {
  it('acepta campaignId + note no vacía', () => {
    const result = rejectCampaignSchema.safeParse({
      campaignId: 'campaign-uuid-1',
      note: 'El presupuesto excede el límite aprobado.',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza note vacía', () => {
    const result = rejectCampaignSchema.safeParse({ campaignId: 'campaign-uuid-1', note: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza note solo con espacios en blanco', () => {
    const result = rejectCampaignSchema.safeParse({ campaignId: 'campaign-uuid-1', note: '   ' });
    expect(result.success).toBe(false);
  });

  it('rechaza note ausente', () => {
    const result = rejectCampaignSchema.safeParse({ campaignId: 'campaign-uuid-1' });
    expect(result.success).toBe(false);
  });

  it('rechaza note de más de 5000 caracteres', () => {
    const result = rejectCampaignSchema.safeParse({
      campaignId: 'campaign-uuid-1',
      note: 'a'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('acepta note de exactamente 5000 caracteres', () => {
    const result = rejectCampaignSchema.safeParse({
      campaignId: 'campaign-uuid-1',
      note: 'a'.repeat(5000),
    });
    expect(result.success).toBe(true);
  });

  it('recorta espacios alrededor de la note (trim)', () => {
    const result = rejectCampaignSchema.safeParse({
      campaignId: 'campaign-uuid-1',
      note: '  falta disclaimer  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe('falta disclaimer');
    }
  });
});

// ─── complianceRuleFilterSchema ─────────────────────────────────────────────────

describe('complianceRuleFilterSchema', () => {
  it('acepta objeto vacío (todos los filtros son opcionales)', () => {
    const result = complianceRuleFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('acepta clientId/platform/jurisdiction', () => {
    const result = complianceRuleFilterSchema.safeParse({
      clientId: 'client-uuid-1',
      platform: 'meta_ads',
      jurisdiction: 'US',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza platform inválida', () => {
    const result = complianceRuleFilterSchema.safeParse({ platform: 'not-a-real-platform' });
    expect(result.success).toBe(false);
  });

  it('nunca acepta organizationId (no está definido en el schema)', () => {
    const result = complianceRuleFilterSchema.safeParse({ organizationId: 'org-uuid-1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('organizationId');
    }
  });
});
