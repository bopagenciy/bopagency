/**
 * Campaign schemas — tests unitarios
 */
import { describe, it, expect } from 'vitest';
import {
  createCampaignDraftSchema,
  updateCampaignDraftSchema,
  campaignFilterSchema,
  generateCampaignDraftWithAiSchema,
  regenerateCampaignContentSchema,
} from '../campaign.schema';

const baseValidInput = {
  clientId: 'client-uuid-1',
  name: 'Campaña de Verano',
  platform: 'meta_ads',
  objective: 'lead_generation',
  budget: 5000000,
};

describe('createCampaignDraftSchema', () => {
  it('acepta un payload mínimo válido', () => {
    const result = createCampaignDraftSchema.safeParse(baseValidInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('COP'); // default
      expect(result.data.metadata).toEqual({}); // default
    }
  });

  it('rechaza name vacío', () => {
    const result = createCampaignDraftSchema.safeParse({ ...baseValidInput, name: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza clientId vacío', () => {
    const result = createCampaignDraftSchema.safeParse({ ...baseValidInput, clientId: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza platform inválido', () => {
    const result = createCampaignDraftSchema.safeParse({
      ...baseValidInput,
      platform: 'myspace_ads',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza objective inválido', () => {
    const result = createCampaignDraftSchema.safeParse({
      ...baseValidInput,
      objective: 'go_viral',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza budget negativo', () => {
    const result = createCampaignDraftSchema.safeParse({ ...baseValidInput, budget: -1 });
    expect(result.success).toBe(false);
  });

  it('acepta budget 0', () => {
    const result = createCampaignDraftSchema.safeParse({ ...baseValidInput, budget: 0 });
    expect(result.success).toBe(true);
  });

  it('rechaza currency fuera de la lista soportada', () => {
    const result = createCampaignDraftSchema.safeParse({ ...baseValidInput, currency: 'JPY' });
    expect(result.success).toBe(false);
  });

  it('rechaza brief mayor a 10000 caracteres', () => {
    const result = createCampaignDraftSchema.safeParse({
      ...baseValidInput,
      brief: 'a'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('acepta brief null', () => {
    const result = createCampaignDraftSchema.safeParse({ ...baseValidInput, brief: null });
    expect(result.success).toBe(true);
  });

  it('no acepta ni requiere organizationId ni createdBy en el schema', () => {
    // organizationId/createdBy se obtienen de la sesión del servidor, nunca del payload.
    const result = createCampaignDraftSchema.safeParse({
      ...baseValidInput,
      organizationId: 'org-uuid-1',
      createdBy: 'user-uuid-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('organizationId');
      expect(result.data).not.toHaveProperty('createdBy');
    }
  });
});

describe('updateCampaignDraftSchema', () => {
  it('acepta payload parcial vacío', () => {
    const result = updateCampaignDraftSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('acepta status draft', () => {
    const result = updateCampaignDraftSchema.safeParse({ status: 'draft' });
    expect(result.success).toBe(true);
  });

  it('acepta status review (enviar a revisión)', () => {
    const result = updateCampaignDraftSchema.safeParse({ status: 'review' });
    expect(result.success).toBe(true);
  });

  it('rechaza status approved (reservado a la RPC de Phase 7C)', () => {
    const result = updateCampaignDraftSchema.safeParse({ status: 'approved' });
    expect(result.success).toBe(false);
  });

  it('rechaza status rejected (reservado a la RPC de Phase 7C)', () => {
    const result = updateCampaignDraftSchema.safeParse({ status: 'rejected' });
    expect(result.success).toBe(false);
  });
});

describe('campaignFilterSchema', () => {
  it('aplica defaults de paginación', () => {
    const result = campaignFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('acepta filtros combinados', () => {
    const result = campaignFilterSchema.safeParse({
      clientId: 'client-uuid-1',
      status: 'review',
      platform: 'google_ads',
      page: 2,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza status inválido', () => {
    const result = campaignFilterSchema.safeParse({ status: 'launched' });
    expect(result.success).toBe(false);
  });
});

// ─── generateCampaignDraftWithAiSchema — Phase 7D ──────────────────────────────

const baseAiInput = {
  clientId: 'client-uuid-1',
  platform: 'meta_ads',
  objective: 'lead_generation',
  brief: 'Cliente busca aumentar leads calificados en el área metropolitana.',
  budget: 5000000,
};

describe('generateCampaignDraftWithAiSchema', () => {
  it('acepta un payload mínimo válido', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse(baseAiInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('COP'); // default
    }
  });

  it('rechaza brief vacío (a diferencia de createCampaignDraftSchema, aquí es obligatorio)', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse({ ...baseAiInput, brief: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza brief ausente', () => {
    const { brief, ...withoutBrief } = baseAiInput;
    void brief;
    const result = generateCampaignDraftWithAiSchema.safeParse(withoutBrief);
    expect(result.success).toBe(false);
  });

  it('rechaza clientId vacío', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse({ ...baseAiInput, clientId: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza platform inválido', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse({
      ...baseAiInput,
      platform: 'myspace_ads',
    });
    expect(result.success).toBe(false);
  });

  it('acepta platform youtube_ads a nivel de forma (la restricción de soporte real es de dominio, no de este schema)', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse({
      ...baseAiInput,
      platform: 'youtube_ads',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza budget negativo', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse({ ...baseAiInput, budget: -1 });
    expect(result.success).toBe(false);
  });

  it('acepta language y market opcionales', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse({
      ...baseAiInput,
      language: 'en',
      market: 'US',
    });
    expect(result.success).toBe(true);
  });

  it('no acepta ni requiere organizationId ni actorUserId en el schema', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse({
      ...baseAiInput,
      organizationId: 'org-uuid-1',
      actorUserId: 'user-uuid-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('organizationId');
      expect(result.data).not.toHaveProperty('actorUserId');
    }
  });
});

// ─── regenerateCampaignContentSchema — Phase 7D ────────────────────────────────

describe('regenerateCampaignContentSchema', () => {
  it('acepta solo campaignId', () => {
    const result = regenerateCampaignContentSchema.safeParse({ campaignId: 'campaign-uuid-1' });
    expect(result.success).toBe(true);
  });

  it('acepta overrides opcionales de language/market', () => {
    const result = regenerateCampaignContentSchema.safeParse({
      campaignId: 'campaign-uuid-1',
      language: 'en',
      market: 'MX',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza campaignId vacío', () => {
    const result = regenerateCampaignContentSchema.safeParse({ campaignId: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza campaignId ausente', () => {
    const result = regenerateCampaignContentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
