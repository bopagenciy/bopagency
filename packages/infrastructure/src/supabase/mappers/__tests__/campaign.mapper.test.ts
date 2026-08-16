import { describe, it, expect } from 'vitest';
import { rowToCampaign, type CampaignRow } from '../campaign.mapper';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseCampaignRow: CampaignRow = {
  id: 'campaign-uuid-1',
  organization_id: 'org-uuid-1',
  client_id: 'client-uuid-1',
  name: 'Campaña de Verano',
  platform: 'meta_ads',
  objective: 'lead_generation',
  status: 'draft',
  brief: 'Promocionar el nuevo servicio de temporada alta.',
  budget: 5000000,
  currency: 'COP',
  start_date: '2026-08-01',
  end_date: '2026-08-31',
  generated_content: null,
  metadata: {},
  created_by: 'user-uuid-1',
  updated_by: null,
  submitted_for_review_at: null,
  approved_at: null,
  rejected_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

describe('rowToCampaign', () => {
  it('mapea todos los campos básicos correctamente', () => {
    const campaign = rowToCampaign(baseCampaignRow);
    expect(campaign.id).toBe('campaign-uuid-1');
    expect(campaign.organizationId).toBe('org-uuid-1');
    expect(campaign.clientId).toBe('client-uuid-1');
    expect(campaign.name).toBe('Campaña de Verano');
    expect(campaign.platform).toBe('meta_ads');
    expect(campaign.objective).toBe('lead_generation');
    expect(campaign.status).toBe('draft');
    expect(campaign.brief).toBe('Promocionar el nuevo servicio de temporada alta.');
    expect(campaign.budget).toBe(5000000);
    expect(campaign.currency).toBe('COP');
    expect(campaign.startDate).toBeInstanceOf(Date);
    expect(campaign.endDate).toBeInstanceOf(Date);
    expect(campaign.generatedContent).toBeNull();
    expect(campaign.metadata).toEqual({});
    expect(campaign.createdBy).toBe('user-uuid-1');
    expect(campaign.updatedBy).toBeNull();
    expect(campaign.submittedForReviewAt).toBeNull();
    expect(campaign.approvedAt).toBeNull();
    expect(campaign.rejectedAt).toBeNull();
    expect(campaign.createdAt).toBeInstanceOf(Date);
    expect(campaign.updatedAt).toBeInstanceOf(Date);
  });

  it('parsea budget cuando llega como string (numeric de Postgres)', () => {
    const campaign = rowToCampaign({ ...baseCampaignRow, budget: '1234.56' });
    expect(campaign.budget).toBe(1234.56);
  });

  it('lanza si budget no es un número válido', () => {
    expect(() => rowToCampaign({ ...baseCampaignRow, budget: 'not-a-number' })).toThrow();
  });

  it('mapea start_date/end_date null a null', () => {
    const campaign = rowToCampaign({ ...baseCampaignRow, start_date: null, end_date: null });
    expect(campaign.startDate).toBeNull();
    expect(campaign.endDate).toBeNull();
  });

  it('mapea brief null a null', () => {
    const campaign = rowToCampaign({ ...baseCampaignRow, brief: null });
    expect(campaign.brief).toBeNull();
  });

  it('mapea generated_content cuando está presente', () => {
    const campaign = rowToCampaign({
      ...baseCampaignRow,
      generated_content: { headline: 'Ahorra hoy', variants: 3 },
    });
    expect(campaign.generatedContent).toEqual({ headline: 'Ahorra hoy', variants: 3 });
  });

  it('lanza si generated_content es un array (debe ser objeto)', () => {
    expect(() =>
      rowToCampaign({ ...baseCampaignRow, generated_content: ['a', 'b'] }),
    ).toThrow();
  });

  it('mapea metadata null a objeto vacío', () => {
    const campaign = rowToCampaign({ ...baseCampaignRow, metadata: null });
    expect(campaign.metadata).toEqual({});
  });

  it('lanza si status no es válido', () => {
    expect(() => rowToCampaign({ ...baseCampaignRow, status: 'launched' })).toThrow();
  });

  it('lanza si objective no es válido', () => {
    expect(() => rowToCampaign({ ...baseCampaignRow, objective: 'go_viral' })).toThrow();
  });

  it('lanza si platform no es válido', () => {
    expect(() => rowToCampaign({ ...baseCampaignRow, platform: 'myspace_ads' })).toThrow();
  });

  it('mapea submitted_for_review_at/approved_at/rejected_at cuando están presentes', () => {
    const campaign = rowToCampaign({
      ...baseCampaignRow,
      status: 'rejected',
      submitted_for_review_at: '2026-08-02T00:00:00.000Z',
      rejected_at: '2026-08-03T00:00:00.000Z',
    });
    expect(campaign.submittedForReviewAt).toBeInstanceOf(Date);
    expect(campaign.rejectedAt).toBeInstanceOf(Date);
    expect(campaign.approvedAt).toBeNull();
  });
});
