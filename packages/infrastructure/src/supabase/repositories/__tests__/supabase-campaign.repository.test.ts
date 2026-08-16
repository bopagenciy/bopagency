/**
 * SupabaseCampaignRepository — tests unitarios.
 *
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 *
 * Cobertura:
 * - findById: encontrado, no encontrado (aislado por organization_id)
 * - findAll: básico, filtros (clientId/status/platform), paginación
 * - create: inserta con status 'draft', mapea campos, propaga error de Supabase
 * - update: actualiza campos parciales, setea submitted_for_review_at al
 *   transicionar a 'review', no encontrado, error de Supabase propagado
 * - approve/reject (Phase 7C): delegan a RPC (no UPDATE directo), verifican
 *   la campaña primero, recargan la campaña tras éxito, mapean errores de la
 *   RPC (not found / forbidden / conflict / validation / internal)
 * - tenant scope obligatorio (organization_id) en cada operación
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseCampaignRepository } from '../supabase-campaign.repository';
import type { CampaignRow } from '../../mappers/campaign.mapper';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationId, ClientId, CampaignId } from '@bop-agency/domain';
import { isOk, isErr } from '@bop-agency/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1' as unknown as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as unknown as ClientId;
const CAMPAIGN_ID = 'campaign-uuid-1' as unknown as CampaignId;

const makeCampaignRow = (overrides: Partial<CampaignRow> = {}): CampaignRow => ({
  id: 'campaign-uuid-1',
  organization_id: ORG_ID as string,
  client_id: CLIENT_ID as string,
  name: 'Campaña de Verano',
  platform: 'meta_ads',
  objective: 'lead_generation',
  status: 'draft',
  brief: null,
  budget: 5000000,
  currency: 'COP',
  start_date: null,
  end_date: null,
  generated_content: null,
  metadata: {},
  created_by: 'user-uuid-1',
  updated_by: null,
  submitted_for_review_at: null,
  approved_at: null,
  rejected_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

// ─── Mock builder ─────────────────────────────────────────────────────────────

function makeQueryChain(result: {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number;
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({
      data: result.data ?? [],
      error: result.error ?? null,
      count: result.count ?? 0,
    }),
    single: vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
  return chain;
}

function makeSupabaseMock(result: {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number;
}) {
  const chain = makeQueryChain(result);
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

// ─── findById ─────────────────────────────────────────────────────────────────

describe('SupabaseCampaignRepository.findById', () => {
  it('retorna la campaña cuando existe en la organización', async () => {
    const row = makeCampaignRow();
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(CAMPAIGN_ID, ORG_ID);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.id).toBe('campaign-uuid-1');
      expect(result.value.organizationId).toBe(ORG_ID);
    }
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', CAMPAIGN_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });

  it('retorna NOT_FOUND cuando no existe (o pertenece a otra organización)', async () => {
    const supabase = makeSupabaseMock({ data: null, error: { message: 'not found' } });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(CAMPAIGN_ID, ORG_ID);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});

// ─── findAll ──────────────────────────────────────────────────────────────────

describe('SupabaseCampaignRepository.findAll', () => {
  it('retorna campañas de la organización', async () => {
    const row = makeCampaignRow();
    const supabase = makeSupabaseMock({ data: [row], count: 1 });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findAll({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });

  it('filtra por clientId', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.findAll(
      { organizationId: ORG_ID, clientId: CLIENT_ID },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
  });

  it('filtra por status', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.findAll({ organizationId: ORG_ID, status: 'review' }, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('status', 'review');
  });

  it('filtra por platform', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.findAll(
      { organizationId: ORG_ID, platform: 'google_ads' },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.eq).toHaveBeenCalledWith('platform', 'google_ads');
  });

  it('retorna resultado paginado vacío si Supabase retorna error', async () => {
    const supabase = makeSupabaseMock({ error: { message: 'boom' } });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findAll({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('descarta silenciosamente filas con datos inválidos', async () => {
    const badRow = makeCampaignRow({ status: 'not-a-status' });
    const goodRow = makeCampaignRow({ id: 'campaign-uuid-2' });
    const supabase = makeSupabaseMock({ data: [badRow, goodRow], count: 2 });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findAll({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('campaign-uuid-2');
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('SupabaseCampaignRepository.create', () => {
  it('crea la campaña y retorna la entidad mapeada', async () => {
    const row = makeCampaignRow();
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      name: 'Campaña de Verano',
      platform: 'meta_ads',
      objective: 'lead_generation',
      budget: 5000000,
      createdBy: 'user-uuid-1',
    });

    expect(isOk(result)).toBe(true);
    expect(supabase._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: String(ORG_ID),
        client_id: String(CLIENT_ID),
        status: 'draft',
        created_by: 'user-uuid-1',
      }),
    );
  });

  it('propaga error de Supabase como INTERNAL_ERROR', async () => {
    const supabase = makeSupabaseMock({ data: null, error: { message: 'insert failed' } });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      name: 'Campaña de Verano',
      platform: 'meta_ads',
      objective: 'lead_generation',
      budget: 5000000,
      createdBy: 'user-uuid-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });

  // ── Phase 7D: generatedContent → generated_content ────────────────────────

  it('Phase 7D: reenvía generatedContent como generated_content en el insert cuando se provee (generateCampaignDraftWithAI)', async () => {
    const row = makeCampaignRow({ generated_content: { schemaVersion: 'campaign-content-v1', platform: 'meta_ads' } });
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.create({
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      name: 'AI draft',
      platform: 'meta_ads',
      objective: 'lead_generation',
      budget: 5000000,
      generatedContent: { schemaVersion: 'campaign-content-v1', platform: 'meta_ads' },
      metadata: { ai: { provider: 'anthropic' } },
      createdBy: 'user-uuid-1',
    });

    expect(supabase._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        generated_content: { schemaVersion: 'campaign-content-v1', platform: 'meta_ads' },
        metadata: { ai: { provider: 'anthropic' } },
      }),
    );
  });

  it('Phase 7D: inserta generated_content: null cuando no se provee (createCampaignDraft, 7B)', async () => {
    const row = makeCampaignRow();
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.create({
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      name: 'Campaña de Verano',
      platform: 'meta_ads',
      objective: 'lead_generation',
      budget: 5000000,
      createdBy: 'user-uuid-1',
    });

    expect(supabase._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ generated_content: null }),
    );
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('SupabaseCampaignRepository.update', () => {
  it('actualiza campos parciales', async () => {
    const row = makeCampaignRow({ name: 'Nuevo nombre' });
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.update(CAMPAIGN_ID, ORG_ID, {
      name: 'Nuevo nombre',
      updatedBy: 'user-uuid-1',
    });

    expect(isOk(result)).toBe(true);
    expect(supabase._chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Nuevo nombre', updated_by: 'user-uuid-1' }),
    );
  });

  it('setea submitted_for_review_at al transicionar status a review', async () => {
    const row = makeCampaignRow({ status: 'review' });
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.update(CAMPAIGN_ID, ORG_ID, { status: 'review', updatedBy: 'user-uuid-1' });

    expect(supabase._chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review', submitted_for_review_at: expect.any(String) }),
    );
  });

  it('retorna NOT_FOUND cuando la campaña no existe en la organización', async () => {
    const supabase = makeSupabaseMock({
      data: null,
      error: { message: 'no rows', code: 'PGRST116' },
    });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.update(CAMPAIGN_ID, ORG_ID, { updatedBy: 'user-uuid-1' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('siempre aísla por organization_id', async () => {
    const row = makeCampaignRow();
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.update(CAMPAIGN_ID, ORG_ID, { updatedBy: 'user-uuid-1' });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });

  // ── Phase 7D: generatedContent → generated_content ────────────────────────

  it('Phase 7D: reenvía generatedContent como generated_content en el patch cuando se provee (regenerateCampaignContent)', async () => {
    const row = makeCampaignRow({ generated_content: { schemaVersion: 'campaign-content-v1', platform: 'google_ads' } });
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.update(CAMPAIGN_ID, ORG_ID, {
      generatedContent: { schemaVersion: 'campaign-content-v1', platform: 'google_ads' },
      metadata: { ai: { provider: 'anthropic', generatedAt: '2026-08-16T00:00:00.000Z' } },
      updatedBy: 'user-uuid-1',
    });

    expect(supabase._chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        generated_content: { schemaVersion: 'campaign-content-v1', platform: 'google_ads' },
        metadata: { ai: { provider: 'anthropic', generatedAt: '2026-08-16T00:00:00.000Z' } },
      }),
    );
  });

  it('Phase 7D: NO incluye generated_content en el patch cuando no se provee (edición 7B normal — no debe borrar generated_content existente)', async () => {
    const row = makeCampaignRow({ name: 'Nuevo nombre' });
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.update(CAMPAIGN_ID, ORG_ID, { name: 'Nuevo nombre', updatedBy: 'user-uuid-1' });

    const updateMock = supabase._chain.update as ReturnType<typeof vi.fn>;
    const patchArg = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patchArg).not.toHaveProperty('generated_content');
  });

  it('Phase 7D: permite explícitamente limpiar generated_content con null', async () => {
    const row = makeCampaignRow({ generated_content: null });
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    await repo.update(CAMPAIGN_ID, ORG_ID, { generatedContent: null, updatedBy: 'user-uuid-1' });

    expect(supabase._chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ generated_content: null }),
    );
  });
});

// ─── approve (Phase 7C) — RPC ──────────────────────────────────────────────────

describe('SupabaseCampaignRepository.approve', () => {
  it('llama a RPC approve_campaign (no UPDATE directo) y recarga la campaña', async () => {
    const findChain = makeQueryChain({ data: makeCampaignRow({ status: 'review' }) });
    const reloadChain = makeQueryChain({ data: makeCampaignRow({ status: 'approved' }) });
    const fromMock = vi.fn().mockReturnValueOnce(findChain).mockReturnValueOnce(reloadChain);
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { from: fromMock, rpc: rpcMock };
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.approve(CAMPAIGN_ID, ORG_ID, 'user-uuid-admin');

    expect(rpcMock).toHaveBeenCalledWith('approve_campaign', { p_campaign_id: CAMPAIGN_ID });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.status).toBe('approved');
    }
  });

  it('no llama a la RPC si la campaña no existe en la organización', async () => {
    const findChain = makeQueryChain({ data: null, error: { message: 'not found' } });
    const rpcMock = vi.fn();
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: rpcMock };
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.approve(CAMPAIGN_ID, ORG_ID, 'user-uuid-admin');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('mapea "not found" del error de la RPC a NOT_FOUND', async () => {
    const findChain = makeQueryChain({ data: makeCampaignRow() });
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'approve_campaign: campaign not found (id: x)' } });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: rpcMock };
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.approve(CAMPAIGN_ID, ORG_ID, 'user-uuid-admin');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('mapea "lacks admin/owner role" del error de la RPC a FORBIDDEN', async () => {
    const findChain = makeQueryChain({ data: makeCampaignRow() });
    const rpcMock = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'approve_campaign: actor lacks admin/owner role (campaign_id: x, organization_id: y)' } });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: rpcMock };
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.approve(CAMPAIGN_ID, ORG_ID, 'user-uuid-operator');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('mapea "is not in review" del error de la RPC a CONFLICT', async () => {
    const findChain = makeQueryChain({ data: makeCampaignRow({ status: 'draft' }) });
    const rpcMock = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'approve_campaign: campaign x is not in review (current status: draft)' } });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: rpcMock };
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.approve(CAMPAIGN_ID, ORG_ID, 'user-uuid-admin');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('mapea un error desconocido a INTERNAL_ERROR', async () => {
    const findChain = makeQueryChain({ data: makeCampaignRow() });
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'unexpected database error' } });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: rpcMock };
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.approve(CAMPAIGN_ID, ORG_ID, 'user-uuid-admin');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});

// ─── reject (Phase 7C) — RPC ───────────────────────────────────────────────────

describe('SupabaseCampaignRepository.reject', () => {
  it('llama a RPC reject_campaign con la nota (no UPDATE directo) y recarga la campaña', async () => {
    const findChain = makeQueryChain({ data: makeCampaignRow({ status: 'review' }) });
    const reloadChain = makeQueryChain({ data: makeCampaignRow({ status: 'rejected' }) });
    const fromMock = vi.fn().mockReturnValueOnce(findChain).mockReturnValueOnce(reloadChain);
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { from: fromMock, rpc: rpcMock };
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.reject(CAMPAIGN_ID, ORG_ID, 'user-uuid-admin', 'Presupuesto excesivo');

    expect(rpcMock).toHaveBeenCalledWith('reject_campaign', {
      p_campaign_id: CAMPAIGN_ID,
      p_note: 'Presupuesto excesivo',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.status).toBe('rejected');
    }
  });

  it('mapea "rejection note is required" del error de la RPC a VALIDATION_ERROR', async () => {
    const findChain = makeQueryChain({ data: makeCampaignRow() });
    const rpcMock = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'reject_campaign: rejection note is required' } });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: rpcMock };
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.reject(CAMPAIGN_ID, ORG_ID, 'user-uuid-admin', '');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('no llama a la RPC si la campaña no existe en la organización', async () => {
    const findChain = makeQueryChain({ data: null, error: { message: 'not found' } });
    const rpcMock = vi.fn();
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: rpcMock };
    const repo = new SupabaseCampaignRepository(supabase as unknown as SupabaseClient);

    const result = await repo.reject(CAMPAIGN_ID, ORG_ID, 'user-uuid-admin', 'nota');

    expect(isErr(result)).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
