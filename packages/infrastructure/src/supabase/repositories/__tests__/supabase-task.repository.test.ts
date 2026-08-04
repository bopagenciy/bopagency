/**
 * SupabaseTaskRepository — tests unitarios.
 *
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 *
 * Cobertura:
 * - findByOrganization: básico, con filtros, paginación, overdue
 * - findByClient: filtra por client_id y org_id
 * - findUpcoming: tareas en el próximo N días
 * - tareas sin dueDate excluidas de findUpcoming
 * - overdue detection usando fecha inyectable
 * - countByStatus: conteo correcto por estado
 * - updateStatus: retorna tarea actualizada
 * - error de Supabase propagado
 * - tenant scope obligatorio
 * - soft-delete respetado (deleted_at IS NULL por defecto)
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseTaskRepository } from '../supabase-task.repository';
import type { TaskRow } from '../../mappers/task.mapper';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationId, ClientId, TaskId } from '@bop-agency/domain';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1' as unknown as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as unknown as ClientId;
const TASK_ID = 'task-uuid-1' as unknown as TaskId;

const makeTaskRow = (overrides: Partial<TaskRow> = {}): TaskRow => ({
  id: 'task-uuid-1',
  organization_id: ORG_ID as string,
  client_id: CLIENT_ID as string,
  title: 'Revisar métricas de campaña',
  description: null,
  status: 'pending',
  priority: 'medium',
  due_date: null,
  tags: [],
  created_by: null,
  updated_by: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  deleted_at: null,
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
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
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

// ─── findByOrganization ───────────────────────────────────────────────────────

describe('SupabaseTaskRepository.findByOrganization', () => {
  it('retorna tareas de la organización', async () => {
    const row = makeTaskRow({ status: 'pending' });
    const supabase = makeSupabaseMock({ data: [row], count: 1 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.status).toBe('pending');
  });

  it('filtra por estado', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization(
      { organizationId: ORG_ID, status: 'in_progress' },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.eq).toHaveBeenCalledWith('status', 'in_progress');
  });

  it('filtra por cliente', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization(
      { organizationId: ORG_ID, clientId: CLIENT_ID },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
  });

  it('aplica filtro overdue (due_date < now, status activo)', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization(
      { organizationId: ORG_ID, overdue: true },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.lt).toHaveBeenCalledWith('due_date', expect.any(String));
    expect(supabase._chain.not).toHaveBeenCalledWith('due_date', 'is', null);
    expect(supabase._chain.in).toHaveBeenCalledWith(
      'status',
      expect.arrayContaining(['pending', 'in_progress', 'blocked']),
    );
  });

  it('excluye soft-deleted por defecto (is deleted_at null)', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(supabase._chain.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('incluye soft-deleted cuando includeDeleted=true', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization(
      { organizationId: ORG_ID, includeDeleted: true },
      { page: 1, pageSize: 10 },
    );

    // is('deleted_at', null) NO debe llamarse
    const isCalls = (supabase._chain.is as ReturnType<typeof vi.fn>).mock.calls;
    const deletedAtCall = isCalls.find((c: unknown[]) => c[0] === 'deleted_at');
    expect(deletedAtCall).toBeUndefined();
  });

  it('paginación correcta', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 30 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 3, pageSize: 10 },
    );

    expect(result.totalPages).toBe(3);
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(true);
  });

  it('retorna lista vacía ante error de Supabase', async () => {
    const supabase = makeSupabaseMock({ error: { message: 'timeout' } });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(0);
  });

  it('siempre filtra por organization_id (tenant scope)', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });
});

// ─── findByClient ─────────────────────────────────────────────────────────────

describe('SupabaseTaskRepository.findByClient', () => {
  it('filtra por client_id y organization_id', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findByClient(CLIENT_ID, ORG_ID, {}, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
  });

  it('pasa filtro de status al findByOrganization', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findByClient(CLIENT_ID, ORG_ID, { status: 'done' }, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('status', 'done');
  });
});

// ─── findUpcoming ─────────────────────────────────────────────────────────────

describe('SupabaseTaskRepository.findUpcoming', () => {
  it('excluye tareas sin due_date', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findUpcoming(ORG_ID, 7);

    // Verifica que se excluye due_date IS NULL
    expect(chain.not).toHaveBeenCalledWith('due_date', 'is', null);
  });

  it('excluye estados finales (done, cancelled)', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findUpcoming(ORG_ID, 7);

    // Verifica que se excluyen estados finales
    const notCalls = chain.not.mock.calls;
    const statusCall = notCalls.find((c: unknown[]) => c[0] === 'status');
    expect(statusCall).toBeDefined();
  });

  it('retorna tareas ordenadas por due_date ASC', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.findUpcoming(ORG_ID, 7);

    expect(chain.order).toHaveBeenCalledWith('due_date', { ascending: true });
  });

  it('retorna err(INTERNAL_ERROR) ante error de Supabase', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findUpcoming(ORG_ID, 7);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── countByStatus ────────────────────────────────────────────────────────────

describe('SupabaseTaskRepository.countByStatus', () => {
  it('cuenta tareas por estado correctamente', async () => {
    const rows = [
      { status: 'pending' },
      { status: 'pending' },
      { status: 'in_progress' },
      { status: 'done' },
      { status: 'blocked' },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countByStatus(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.pending).toBe(2);
      expect(result.value.in_progress).toBe(1);
      expect(result.value.done).toBe(1);
      expect(result.value.cancelled).toBe(0);
      expect(result.value.blocked).toBe(1);
    }
  });

  it('excluye soft-deleted', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.countByStatus(ORG_ID);

    expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('retorna err(INTERNAL_ERROR) ante error de Supabase', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countByStatus(ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── updateStatus ─────────────────────────────────────────────────────────────

describe('SupabaseTaskRepository.updateStatus', () => {
  it('actualiza el estado y retorna la tarea actualizada', async () => {
    const updatedRow = makeTaskRow({ status: 'in_progress' });
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.updateStatus(TASK_ID, 'in_progress', ORG_ID, 'user-uuid-1');

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.status).toBe('in_progress');
  });

  it('retorna err(NOT_FOUND) si la tarea no existe en la organización', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found', code: 'PGRST116' },
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.updateStatus(TASK_ID, 'done', ORG_ID, 'user-uuid-1');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('siempre filtra por organization_id (tenant scope)', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    await repo.updateStatus(TASK_ID, 'done', ORG_ID, 'user-uuid-1');

    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });
});

// ─── findById ─────────────────────────────────────────────────────────────────

describe('SupabaseTaskRepository.findById', () => {
  it('retorna la tarea por ID', async () => {
    const row = makeTaskRow();
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(TASK_ID, ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.title).toBe('Revisar métricas de campaña');
  });

  it('retorna err(NOT_FOUND) cuando no existe', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseTaskRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(TASK_ID, ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});
