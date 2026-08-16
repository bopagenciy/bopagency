/**
 * SupabaseCampaignApprovalRepository — tests unitarios.
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseCampaignApprovalRepository } from '../supabase-campaign-approval.repository';
import type { CampaignApprovalRow } from '../../mappers/campaign-approval.mapper';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationId, CampaignId } from '@bop-agency/domain';
import { isOk, isErr } from '@bop-agency/shared';

const ORG_ID = 'org-uuid-1' as unknown as OrganizationId;
const CAMPAIGN_ID = 'campaign-uuid-1' as unknown as CampaignId;

const makeRow = (overrides: Partial<CampaignApprovalRow> = {}): CampaignApprovalRow => ({
  id: 'approval-uuid-1',
  organization_id: ORG_ID as string,
  campaign_id: CAMPAIGN_ID as string,
  action: 'approved',
  note: null,
  actor_user_id: 'user-uuid-1',
  metadata: {},
  created_at: '2026-08-16T00:00:00.000Z',
  ...overrides,
});

describe('SupabaseCampaignApprovalRepository.findByCampaignId', () => {
  it('retorna el historial ordenado (más reciente primero, delegado a la query)', async () => {
    const rows = [makeRow({ id: 'approval-2' }), makeRow({ id: 'approval-1' })];
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignApprovalRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByCampaignId(CAMPAIGN_ID, ORG_ID);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(2);
    }
    expect(chain.eq).toHaveBeenCalledWith('campaign_id', CAMPAIGN_ID);
    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('retorna array vacío si no hay decisiones', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignApprovalRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByCampaignId(CAMPAIGN_ID, ORG_ID);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([]);
    }
  });

  it('propaga error de Supabase como INTERNAL_ERROR', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignApprovalRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByCampaignId(CAMPAIGN_ID, ORG_ID);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('descarta silenciosamente filas con datos inválidos... en realidad falla toda la operación (sin mapSafe aquí)', async () => {
    // A diferencia de findAll de campaigns/alerts (paginado, tolera filas
    // corruptas individuales), el audit trail es una lista corta y
    // completa: se prefiere fallar explícito ante datos corruptos en vez de
    // ocultar silenciosamente una decisión de aprobación/rechazo.
    const badRow = makeRow({ action: 'not-a-real-action' });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [badRow], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignApprovalRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByCampaignId(CAMPAIGN_ID, ORG_ID);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});

describe('SupabaseCampaignApprovalRepository.findLatestByCampaignId', () => {
  it('retorna la última decisión', async () => {
    const row = makeRow();
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignApprovalRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findLatestByCampaignId(CAMPAIGN_ID, ORG_ID);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value?.id).toBe('approval-uuid-1');
    }
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it('retorna null si la campaña nunca fue decidida', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignApprovalRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findLatestByCampaignId(CAMPAIGN_ID, ORG_ID);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBeNull();
    }
  });

  it('propaga error de Supabase como INTERNAL_ERROR', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignApprovalRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findLatestByCampaignId(CAMPAIGN_ID, ORG_ID);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('siempre aísla por organization_id', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: makeRow(), error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignApprovalRepository(supabase as unknown as SupabaseClient);

    await repo.findLatestByCampaignId(CAMPAIGN_ID, ORG_ID);

    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });
});
