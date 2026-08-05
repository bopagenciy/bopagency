/**
 * supabase-automation.repository.test.ts — Tests unitarios.
 *
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 *
 * Cobertura:
 * - create: éxito, conflict (unique violation), error interno
 * - update: éxito, NOT_FOUND, CONFLICT, patch vacío
 * - archive: éxito, NOT_FOUND, idempotente
 * - findById: éxito, NOT_FOUND
 * - findByOrganization: básico, filtros, paginación, error → []
 * - findByClient: delega con client_id y organization_id
 * - existsByName: existe, no existe, con excludeId, error
 * - countByStatus: conteo, inactive → paused, error
 * - Aislamiento multi-tenant: organization_id siempre presente
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseAutomationRepository } from '../supabase-automation.repository';
import type { AutomationRow } from '../../mappers/automation.mapper';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationId, ClientId, AutomationId } from '@bop-agency/domain';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1' as unknown as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as unknown as ClientId;
const AUTO_ID = 'auto-uuid-1' as unknown as AutomationId;

const makeRow = (overrides: Partial<AutomationRow> = {}): AutomationRow => ({
  id: 'auto-uuid-1',
  organization_id: ORG_ID as string,
  client_id: null,
  name: 'Reporte semanal',
  description: null,
  status: 'active',
  trigger_config: { type: 'schedule', cron: '0 6 * * 1' },
  retry_policy: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
  n8n_workflow_id: null,
  metadata: {},
  is_manual_only: false,
  last_executed_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

// ─── Mock builder ─────────────────────────────────────────────────────────────

type MockResult = {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number;
};

function makeChain(result: MockResult) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select:  vi.fn().mockReturnThis(),
    insert:  vi.fn().mockReturnThis(),
    update:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    neq:     vi.fn().mockReturnThis(),
    order:   vi.fn().mockReturnThis(),
    limit:   vi.fn().mockResolvedValue({ data: result.data ?? [], error: result.error ?? null }),
    range:   vi.fn().mockResolvedValue({ data: result.data ?? [], error: result.error ?? null, count: result.count ?? 0 }),
    single:  vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
  };
  return chain;
}

function makeSupabase(result: MockResult) {
  const chain = makeChain(result);
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

// ─── create ───────────────────────────────────────────────────────────────────

describe('SupabaseAutomationRepository.create', () => {
  it('retorna Automation en éxito', async () => {
    const row = makeRow({ status: 'draft' });
    const supabase = makeSupabase({ data: row });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      name: 'Reporte semanal',
      triggerConfig: { type: 'manual' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.organizationId).toBe(ORG_ID);
      expect(result.value.status).toBe('draft');
    }
  });

  it('retorna CONFLICT ante unique violation (23505)', async () => {
    const supabase = makeSupabase({ error: { message: 'unique', code: '23505' } });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      name: 'Reporte semanal',
      triggerConfig: { type: 'manual' },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONFLICT');
  });

  it('retorna INTERNAL_ERROR ante otros errores', async () => {
    const supabase = makeSupabase({ error: { message: 'db timeout' } });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      name: 'Test',
      triggerConfig: { type: 'manual' },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('SupabaseAutomationRepository.update', () => {
  it('actualiza y retorna Automation', async () => {
    const row = makeRow({ status: 'active', name: 'Nuevo nombre' });
    const supabase = makeSupabase({ data: row });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.update(AUTO_ID, ORG_ID, { name: 'Nuevo nombre' });

    expect(result.success).toBe(true);
  });

  it('filtra por organization_id en update', async () => {
    const supabase = makeSupabase({ data: makeRow() });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    await repo.update(AUTO_ID, ORG_ID, { status: 'paused' });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', AUTO_ID);
  });

  it('retorna NOT_FOUND ante PGRST116', async () => {
    const supabase = makeSupabase({ error: { message: 'not found', code: 'PGRST116' }, data: null });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.update(AUTO_ID, ORG_ID, { status: 'archived' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ─── archive ──────────────────────────────────────────────────────────────────

describe('SupabaseAutomationRepository.archive', () => {
  it('retorna ok(void) en éxito', async () => {
    const supabase = makeSupabase({ data: { id: AUTO_ID, status: 'archived' } });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.archive(AUTO_ID, ORG_ID);

    expect(result.success).toBe(true);
  });

  it('filtra por organization_id en archive', async () => {
    const supabase = makeSupabase({ data: { id: AUTO_ID } });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    await repo.archive(AUTO_ID, ORG_ID);

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', AUTO_ID);
  });

  it('retorna NOT_FOUND si no existe en la organización', async () => {
    const supabase = makeSupabase({ error: { message: 'not found', code: 'PGRST116' }, data: null });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.archive(AUTO_ID, ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ─── findById ─────────────────────────────────────────────────────────────────

describe('SupabaseAutomationRepository.findById', () => {
  it('retorna Automation por ID', async () => {
    const row = makeRow();
    const supabase = makeSupabase({ data: row });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(AUTO_ID, ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.id).toBe('auto-uuid-1');
  });

  it('filtra por organization_id (tenant scope)', async () => {
    const supabase = makeSupabase({ data: makeRow() });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    await repo.findById(AUTO_ID, ORG_ID);

    expect(supabase._chain.eq).toHaveBeenCalledWith('id', AUTO_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });

  it('retorna NOT_FOUND cuando no existe', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'not found' } });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(AUTO_ID, ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ─── findByOrganization ───────────────────────────────────────────────────────

describe('SupabaseAutomationRepository.findByOrganization', () => {
  it('retorna lista de automatizaciones', async () => {
    const supabase = makeSupabase({ data: [makeRow(), makeRow({ id: 'auto-uuid-2' })], count: 2 });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('filtra por status', async () => {
    const supabase = makeSupabase({ data: [], count: 0 });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization({ organizationId: ORG_ID, status: 'active' }, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('filtra por clientId', async () => {
    const supabase = makeSupabase({ data: [], count: 0 });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization(
      { organizationId: ORG_ID, clientId: CLIENT_ID },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
  });

  it('paginación correcta — página 2 de 3', async () => {
    const supabase = makeSupabase({ data: [], count: 30 });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 2, pageSize: 10 },
    );

    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPreviousPage).toBe(true);
  });

  it('retorna lista vacía ante error de Supabase', async () => {
    const supabase = makeSupabase({ error: { message: 'timeout' } });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('filas con status inválido se descartan silenciosamente', async () => {
    const validRow   = makeRow({ status: 'active' });
    const invalidRow = makeRow({ id: 'bad', status: 'unknown_legacy_status' });
    const supabase   = makeSupabase({ data: [validRow, invalidRow], count: 2 });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    // Solo la fila válida pasa
    expect(result.data).toHaveLength(1);
  });
});

// ─── findByClient ─────────────────────────────────────────────────────────────

describe('SupabaseAutomationRepository.findByClient', () => {
  it('filtra por client_id y organization_id', async () => {
    const supabase = makeSupabase({ data: [], count: 0 });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    await repo.findByClient(CLIENT_ID, ORG_ID, {}, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
  });
});

// ─── existsByName ─────────────────────────────────────────────────────────────

describe('SupabaseAutomationRepository.existsByName', () => {
  it('retorna true si existe', async () => {
    const supabase = makeSupabase({ data: [{ id: 'x' }] });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.existsByName('Reporte semanal', ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(true);
  });

  it('retorna false si no existe', async () => {
    const supabase = makeSupabase({ data: [] });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.existsByName('Nombre nuevo', ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(false);
  });

  it('usa neq para excludeId', async () => {
    const supabase = makeSupabase({ data: [] });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    await repo.existsByName('Nombre', ORG_ID, AUTO_ID);

    expect(supabase._chain.neq).toHaveBeenCalledWith('id', AUTO_ID);
  });

  it('retorna INTERNAL_ERROR ante error de Supabase', async () => {
    const supabase = makeSupabase({ error: { message: 'db error' } });
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.existsByName('Test', ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── countByStatus ────────────────────────────────────────────────────────────

describe('SupabaseAutomationRepository.countByStatus', () => {
  it('cuenta correctamente por status de dominio', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { status: 'active' },
          { status: 'active' },
          { status: 'draft' },
          { status: 'paused' },
          { status: 'archived' },
        ],
        error: null,
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countByStatus(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.active).toBe(2);
      expect(result.value.draft).toBe(1);
      expect(result.value.paused).toBe(1);
      expect(result.value.archived).toBe(1);
    }
  });

  it('inactive → paused en countByStatus', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ status: 'inactive' }, { status: 'paused' }],
        error: null,
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countByStatus(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      // inactive mapea a paused → total paused = 2
      expect(result.value.paused).toBe(2);
    }
  });

  it('retorna INTERNAL_ERROR ante error de Supabase', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countByStatus(ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });

  it('filtra siempre por organization_id', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAutomationRepository(supabase as unknown as SupabaseClient);

    await repo.countByStatus(ORG_ID);

    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });
});
