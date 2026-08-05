/**
 * supabase-automation-execution.repository.test.ts — Tests unitarios.
 *
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 *
 * Cobertura:
 * - create: éxito, CONFLICT (idempotency_key duplicada), INTERNAL_ERROR
 * - updateStatus: éxito, NOT_FOUND, INTERNAL_ERROR
 * - findById: éxito, NOT_FOUND, tenant scope
 * - findByIdempotencyKey: encontrado, no encontrado (null), PGRST116 → null, error
 * - findByAutomation: delega con automationId y organizationId
 * - findByOrganization: filtros, paginación, error → []
 * - countByStatus: conteo, con automationId, error
 * - Aislamiento multi-tenant: organization_id siempre presente
 * - clientId nullable: null y con valor
 * - Paginación: correcta en todas las páginas
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseAutomationExecutionRepository } from '../supabase-automation-execution.repository';
import type { AutomationExecutionRow } from '../../mappers/automation-execution.mapper';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OrganizationId,
  ClientId,
  AutomationId,
  AutomationExecutionId,
  IdempotencyKey,
} from '@bop-agency/domain';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID   = 'org-uuid-1' as unknown as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as unknown as ClientId;
const AUTO_ID  = 'auto-uuid-1' as unknown as AutomationId;
const EXEC_ID  = 'exec-uuid-1' as unknown as AutomationExecutionId;
const IDEM_KEY = 'auto-uuid-1:schedule:2026-08-01:1' as unknown as IdempotencyKey;

const makeRow = (overrides: Partial<AutomationExecutionRow> = {}): AutomationExecutionRow => ({
  id: 'exec-uuid-1',
  organization_id: ORG_ID as string,
  automation_id: AUTO_ID as string,
  client_id: null,
  status: 'queued',
  attempt: 1,
  idempotency_key: IDEM_KEY as string,
  triggered_by: 'schedule-service',
  trigger_type: 'schedule',
  input_metadata: null,
  output_metadata: null,
  error_code: null,
  error_message: null,
  queued_at: '2026-08-01T06:00:00.000Z',
  started_at: null,
  completed_at: null,
  created_at: '2026-08-01T06:00:00.000Z',
  updated_at: '2026-08-01T06:00:00.000Z',
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
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    range:  vi.fn().mockResolvedValue({
      data:  result.data ?? [],
      error: result.error ?? null,
      count: result.count ?? 0,
    }),
    single: vi.fn().mockResolvedValue({
      data:  result.data ?? null,
      error: result.error ?? null,
    }),
  };
  return chain;
}

function makeSupabase(result: MockResult) {
  const chain = makeChain(result);
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

// ─── create ───────────────────────────────────────────────────────────────────

describe('SupabaseAutomationExecutionRepository.create', () => {
  it('retorna AutomationExecution con status queued', async () => {
    const row = makeRow({ status: 'queued' });
    const supabase = makeSupabase({ data: row });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId:  ORG_ID,
      automationId:    AUTO_ID,
      idempotencyKey:  IDEM_KEY,
      triggeredBy:     'schedule-service',
      triggerType:     'schedule',
      attempt:         1,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.status).toBe('queued');
      expect(result.value.organizationId).toBe(ORG_ID);
    }
  });

  it('crea con clientId', async () => {
    const row = makeRow({ client_id: CLIENT_ID as string });
    const supabase = makeSupabase({ data: row });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      automationId:   AUTO_ID,
      clientId:       CLIENT_ID,
      idempotencyKey: IDEM_KEY,
      triggeredBy:    'user-uuid-1',
      triggerType:    'manual',
      attempt:        1,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.clientId).toBe(CLIENT_ID);
  });

  it('clientId null cuando no se pasa (global)', async () => {
    const row = makeRow({ client_id: null });
    const supabase = makeSupabase({ data: row });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      automationId:   AUTO_ID,
      idempotencyKey: IDEM_KEY,
      triggeredBy:    'system',
      triggerType:    'event',
      attempt:        1,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.clientId).toBeNull();
  });

  it('retorna CONFLICT ante idempotency_key duplicada (23505)', async () => {
    const supabase = makeSupabase({ error: { message: 'unique', code: '23505' } });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      automationId:   AUTO_ID,
      idempotencyKey: IDEM_KEY,
      triggeredBy:    'schedule-service',
      triggerType:    'schedule',
      attempt:        1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.message).toContain('idempotent');
    }
  });

  it('retorna INTERNAL_ERROR ante error genérico', async () => {
    const supabase = makeSupabase({ error: { message: 'db timeout' } });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      automationId:   AUTO_ID,
      idempotencyKey: IDEM_KEY,
      triggeredBy:    'system',
      triggerType:    'schedule',
      attempt:        1,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── updateStatus ─────────────────────────────────────────────────────────────

describe('SupabaseAutomationExecutionRepository.updateStatus', () => {
  it('actualiza a running con startedAt', async () => {
    const row = makeRow({ status: 'running', started_at: '2026-08-01T06:00:05.000Z' });
    const supabase = makeSupabase({ data: row });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.updateStatus(EXEC_ID, ORG_ID, {
      status:    'running',
      startedAt: new Date('2026-08-01T06:00:05.000Z'),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.status).toBe('running');
      expect(result.value.startedAt).toBeInstanceOf(Date);
    }
  });

  it('actualiza a succeeded con completed_at y output_metadata', async () => {
    const row = makeRow({
      status: 'succeeded',
      started_at: '2026-08-01T06:00:05.000Z',
      completed_at: '2026-08-01T06:00:35.000Z',
      output_metadata: { records: 10 },
    });
    const supabase = makeSupabase({ data: row });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.updateStatus(EXEC_ID, ORG_ID, {
      status:          'succeeded',
      completedAt:     new Date('2026-08-01T06:00:35.000Z'),
      outputMetadata:  { records: 10 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.outputMetadata).toEqual({ records: 10 });
      expect(result.value.completedAt).toBeInstanceOf(Date);
    }
  });

  it('actualiza a failed con errorCode y errorMessage', async () => {
    const row = makeRow({
      status: 'failed',
      error_code: 'TIMEOUT',
      error_message: 'n8n timed out after 30s',
    });
    const supabase = makeSupabase({ data: row });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.updateStatus(EXEC_ID, ORG_ID, {
      status:       'failed',
      errorCode:    'TIMEOUT',
      errorMessage: 'n8n timed out after 30s',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.errorCode).toBe('TIMEOUT');
      expect(result.value.errorMessage).toBe('n8n timed out after 30s');
    }
  });

  it('filtra por organization_id en updateStatus (tenant scope)', async () => {
    const supabase = makeSupabase({ data: makeRow() });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    await repo.updateStatus(EXEC_ID, ORG_ID, { status: 'cancelled' });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', EXEC_ID);
  });

  it('retorna NOT_FOUND ante PGRST116', async () => {
    const supabase = makeSupabase({ error: { message: 'not found', code: 'PGRST116' }, data: null });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.updateStatus(EXEC_ID, ORG_ID, { status: 'cancelled' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ─── findById ─────────────────────────────────────────────────────────────────

describe('SupabaseAutomationExecutionRepository.findById', () => {
  it('retorna ejecución por ID', async () => {
    const supabase = makeSupabase({ data: makeRow() });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(EXEC_ID, ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.id).toBe('exec-uuid-1');
  });

  it('filtra por organization_id y id', async () => {
    const supabase = makeSupabase({ data: makeRow() });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    await repo.findById(EXEC_ID, ORG_ID);

    expect(supabase._chain.eq).toHaveBeenCalledWith('id', EXEC_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });

  it('retorna NOT_FOUND cuando no existe', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'not found' } });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(EXEC_ID, ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ─── findByIdempotencyKey ─────────────────────────────────────────────────────

describe('SupabaseAutomationExecutionRepository.findByIdempotencyKey', () => {
  it('retorna ejecución cuando existe', async () => {
    const supabase = makeSupabase({ data: makeRow() });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByIdempotencyKey(IDEM_KEY, ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).not.toBeNull();
  });

  it('retorna null (no error) cuando no existe (PGRST116)', async () => {
    const supabase = makeSupabase({ error: { message: 'not found', code: 'PGRST116' } });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByIdempotencyKey(IDEM_KEY, ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBeNull();
  });

  it('filtra por organization_id (no búsqueda global)', async () => {
    const supabase = makeSupabase({ data: makeRow() });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    await repo.findByIdempotencyKey(IDEM_KEY, ORG_ID);

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('idempotency_key', IDEM_KEY);
  });

  it('retorna INTERNAL_ERROR ante error de Supabase (no PGRST116)', async () => {
    const supabase = makeSupabase({ error: { message: 'connection error', code: '08000' } });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByIdempotencyKey(IDEM_KEY, ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── findByAutomation ────────────────────────────────────────────────────────

describe('SupabaseAutomationExecutionRepository.findByAutomation', () => {
  it('filtra por automation_id y organization_id', async () => {
    const supabase = makeSupabase({ data: [], count: 0 });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    await repo.findByAutomation(AUTO_ID, ORG_ID, {}, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('automation_id', AUTO_ID);
  });

  it('pasa filtro de status', async () => {
    const supabase = makeSupabase({ data: [], count: 0 });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    await repo.findByAutomation(AUTO_ID, ORG_ID, { status: 'failed' }, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('status', 'failed');
  });
});

// ─── findByOrganization ───────────────────────────────────────────────────────

describe('SupabaseAutomationExecutionRepository.findByOrganization', () => {
  it('retorna lista de ejecuciones', async () => {
    const supabase = makeSupabase({ data: [makeRow(), makeRow({ id: 'exec-2' })], count: 2 });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('paginación correcta — página 3 de 5', async () => {
    const supabase = makeSupabase({ data: [], count: 50 });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 3, pageSize: 10 },
    );

    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(5);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPreviousPage).toBe(true);
  });

  it('retorna lista vacía ante error de Supabase', async () => {
    const supabase = makeSupabase({ error: { message: 'timeout' } });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(0);
  });

  it('siempre filtra por organization_id', async () => {
    const supabase = makeSupabase({ data: [], count: 0 });
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });
});

// ─── countByStatus ────────────────────────────────────────────────────────────

describe('SupabaseAutomationExecutionRepository.countByStatus', () => {
  it('cuenta ejecuciones por status', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { status: 'queued' },
          { status: 'running' },
          { status: 'running' },
          { status: 'succeeded' },
          { status: 'failed' },
          { status: 'cancelled' },
          { status: 'retrying' },
        ],
        error: null,
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countByStatus(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.queued).toBe(1);
      expect(result.value.running).toBe(2);
      expect(result.value.succeeded).toBe(1);
      expect(result.value.failed).toBe(1);
      expect(result.value.cancelled).toBe(1);
      expect(result.value.retrying).toBe(1);
    }
  });

  it('filtra por automationId cuando se pasa', async () => {
    // El segundo .eq() es el terminal (se awaita directamente).
    // Hacemos que eq devuelva 'this' en la primera llamada y una Promise en la segunda.
    let callCount = 0;
    const resolvedValue = { data: [], error: null };
    const eqMock = vi.fn().mockImplementation(() => {
      callCount++;
      // Primera llamada (organization_id): encadenable
      if (callCount === 1) return chain;
      // Segunda llamada (automation_id): terminal, awaitable
      return Promise.resolve(resolvedValue);
    });
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: eqMock,
    };

    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    await repo.countByStatus(ORG_ID, AUTO_ID);

    expect(eqMock).toHaveBeenCalledWith('automation_id', AUTO_ID);
  });

  it('retorna INTERNAL_ERROR ante error de Supabase', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAutomationExecutionRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countByStatus(ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});
