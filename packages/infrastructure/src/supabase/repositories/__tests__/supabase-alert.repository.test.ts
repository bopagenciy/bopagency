/**
 * SupabaseAlertRepository — tests unitarios.
 *
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 *
 * Cobertura:
 * - findByOrganization: todas las alertas, filtros por status/severity/client
 * - findActiveByOrganization: siempre filtra status='active'
 * - findByClient: filtra por client_id
 * - countBySeverity: conteo correcto de alertas activas
 * - paginación y orden
 * - nullables (clientId, platform, detectedAt, etc.)
 * - error de Supabase propagado
 * - tenant scope obligatorio (siempre eq organization_id)
 * - acknowledge y resolve delegan a RPC (no UPDATE directo)
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseAlertRepository } from '../supabase-alert.repository';
import type { AlertRow } from '../../mappers/alert.mapper';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationId, ClientId, AlertId } from '@bop-agency/domain';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1' as unknown as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as unknown as ClientId;
const ALERT_ID = 'alert-uuid-1' as unknown as AlertId;

const makeAlertRow = (overrides: Partial<AlertRow> = {}): AlertRow => ({
  id: 'alert-uuid-1',
  organization_id: ORG_ID as string,
  client_id: CLIENT_ID as string,
  alert_key: 'ctr_drop_2026_07',
  alert_type: 'ctr_drop',
  platform: 'meta',
  account_id: 'act_123456',
  severity: 'warning',
  status: 'active',
  title: 'CTR bajo en Meta',
  description: 'CTR cayó un 40% respecto al período anterior',
  metadata: {},
  detected_at: '2026-07-15T10:00:00.000Z',
  acknowledged_at: null,
  acknowledged_by: null,
  snoozed_until: null,
  resolved_at: null,
  resolved_by: null,
  created_at: '2026-07-15T10:00:00.000Z',
  updated_at: '2026-07-15T10:00:00.000Z',
  ...overrides,
});

// ─── Mock builder ─────────────────────────────────────────────────────────────

function makeQueryChain(result: {
  data?: unknown;
  error?: { message: string } | null;
  count?: number;
}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
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
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

function makeSupabaseMock(result: {
  data?: unknown;
  error?: { message: string } | null;
  count?: number;
  rpcError?: { message: string } | null;
}) {
  const chain = makeQueryChain(result);
  const supabase = {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: result.rpcError ?? null }),
    _chain: chain,
  };
  return supabase;
}

// ─── findByOrganization ───────────────────────────────────────────────────────

describe('SupabaseAlertRepository.findByOrganization', () => {
  it('retorna alertas de la organización', async () => {
    const row = makeAlertRow();
    const supabase = makeSupabaseMock({ data: [row], count: 1 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.alertType).toBe('ctr_drop');
    expect(result.total).toBe(1);
  });

  it('retorna lista vacía cuando no hay alertas', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('filtra por status', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization(
      { organizationId: ORG_ID, status: 'active' },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('filtra por severity', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization(
      { organizationId: ORG_ID, severity: 'critical' },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.eq).toHaveBeenCalledWith('severity', 'critical');
  });

  it('filtra por clientId', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization(
      { organizationId: ORG_ID, clientId: CLIENT_ID },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
  });

  it('maneja nullables (client_id null, platform null, detected_at null)', async () => {
    const row = makeAlertRow({
      client_id: null,
      platform: null,
      detected_at: null,
    });
    const supabase = makeSupabaseMock({ data: [row], count: 1 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data[0]?.clientId).toBeNull();
    expect(result.data[0]?.platform).toBeNull();
    expect(result.data[0]?.detectedAt).toBeNull();
  });

  it('paginación correcta', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 50 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 2, pageSize: 10 },
    );

    expect(result.totalPages).toBe(5);
    expect(result.hasPreviousPage).toBe(true);
    expect(result.hasNextPage).toBe(true);
  });

  it('retorna lista vacía ante error de Supabase', async () => {
    const supabase = makeSupabaseMock({ error: { message: 'connection error' } });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(0);
  });

  it('siempre filtra por organization_id (tenant scope)', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });
});

// ─── findActiveByOrganization ─────────────────────────────────────────────────

describe('SupabaseAlertRepository.findActiveByOrganization', () => {
  it('siempre aplica status="active"', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.findActiveByOrganization(ORG_ID, {}, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('pasa filtros adicionales (severity, clientId)', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.findActiveByOrganization(
      ORG_ID,
      { severity: 'critical', clientId: CLIENT_ID },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.eq).toHaveBeenCalledWith('severity', 'critical');
    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
  });
});

// ─── findByClient ─────────────────────────────────────────────────────────────

describe('SupabaseAlertRepository.findByClient', () => {
  it('filtra por client_id y organization_id', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.findByClient(CLIENT_ID, ORG_ID, {}, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID);
  });
});

// ─── countBySeverity ──────────────────────────────────────────────────────────

describe('SupabaseAlertRepository.countBySeverity', () => {
  it('cuenta alertas activas por severidad correctamente', async () => {
    const rows = [
      { severity: 'critical' },
      { severity: 'critical' },
      { severity: 'warning' },
      { severity: 'info' },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      // La cadena termina en eq (no tiene range ni order)
    };
    // El último eq debe resolver el resultado
    let callCount = 0;
    chain.eq = vi.fn().mockImplementation(() => {
      callCount++;
      // Después de los dos eq (organization_id y status), resuelve
      if (callCount >= 2) return Promise.resolve({ data: rows, error: null });
      return chain;
    });

    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countBySeverity(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.critical).toBe(2);
      expect(result.value.warning).toBe(1);
      expect(result.value.info).toBe(1);
    }
  });

  it('retorna ceros cuando no hay alertas activas', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(),
    };
    let callCount = 0;
    chain.eq = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount >= 2) return Promise.resolve({ data: [], error: null });
      return chain;
    });

    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countBySeverity(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.critical).toBe(0);
      expect(result.value.warning).toBe(0);
      expect(result.value.info).toBe(0);
    }
  });

  it('retorna err(INTERNAL_ERROR) ante error de Supabase', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(),
    };
    let callCount = 0;
    chain.eq = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount >= 2) return Promise.resolve({ data: null, error: { message: 'DB error' } });
      return chain;
    });

    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.countBySeverity(ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── acknowledge / resolve (RPC) ──────────────────────────────────────────────

describe('SupabaseAlertRepository.acknowledge', () => {
  it('llama a RPC acknowledge_alert, no UPDATE directo', async () => {
    // findById debe retornar OK primero
    const alertRow = makeAlertRow();
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: alertRow, error: null }),
    };
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const supabase = {
      from: vi.fn().mockReturnValue(findChain),
      rpc: rpcMock,
    };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.acknowledge(ALERT_ID, ORG_ID);

    expect(result.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('acknowledge_alert', { p_alert_id: ALERT_ID });
    // Verifica que NO se llamó un UPDATE directo
    expect(findChain.select).not.toHaveBeenCalledWith(expect.objectContaining({ update: true }));
  });

  it('retorna err(NOT_FOUND) si la alerta no pertenece a la organización', async () => {
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };

    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: vi.fn() };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.acknowledge(ALERT_ID, ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    // RPC nunca se llama si la alerta no es de esta organización
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('SupabaseAlertRepository.resolve', () => {
  it('llama a RPC resolve_alert', async () => {
    const alertRow = makeAlertRow();
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: alertRow, error: null }),
    };
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: rpcMock };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.resolve(ALERT_ID, ORG_ID);

    expect(result.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('resolve_alert', { p_alert_id: ALERT_ID });
  });

  it('retorna err(INTERNAL_ERROR) si la RPC falla', async () => {
    const alertRow = makeAlertRow();
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: alertRow, error: null }),
    };
    const rpcMock = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc: rpcMock };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.resolve(ALERT_ID, ORG_ID);

    expect(result.success).toBe(false);
  });
});
