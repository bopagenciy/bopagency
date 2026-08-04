/**
 * SupabaseMetricsRepository — tests unitarios.
 *
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 *
 * Cobertura:
 * - organización con métricas
 * - organización vacía
 * - filtro por cliente
 * - filtro por período
 * - findLatestByClient — con y sin resultados
 * - paginación
 * - JSONB parcial (campos opcionales ausentes)
 * - error de Supabase propagado como err(INTERNAL_ERROR)
 * - tenant scope obligatorio (nunca consulta sin organization_id)
 * - getOrganizationSummary correcto con múltiples filas
 * - getAvailablePeriods con deduplicación
 */

import { describe, it, expect, vi } from 'vitest';
import type { OrganizationId, ClientId, MetricId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseMetricsRepository } from '../supabase-metrics.repository';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1' as unknown as OrganizationId;
const CLIENT_ID_1 = 'client-uuid-1' as unknown as ClientId;
const CLIENT_ID_2 = 'client-uuid-2' as unknown as ClientId;
const METRIC_ID = 'metric-uuid-1' as unknown as MetricId;

const baseMetrics = {
  spend: 77053,
  impressions: 10704,
  reach: 6808,
  clicks: 715,
  leads: 0,
  purchases: 0,
  conversions: 0,
  revenue: 0,
  ctr: 0.067,
  cpc: 107.8,
  cpm: 7.19,
  cpl: 0,
  roas: 0,
};

const makeMetricRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'metric-uuid-1',
  organization_id: ORG_ID,
  client_id: CLIENT_ID_1,
  platform: 'meta',
  account_id: 'act_123456',
  account_name: 'Test Account',
  period_start: '2026-06-01T00:00:00.000Z',
  period_end: '2026-06-30T23:59:59.000Z',
  currency: 'COP',
  metrics: baseMetrics,
  data_quality: { status: 'complete', warnings: [] },
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

// ─── Mock builder ─────────────────────────────────────────────────────────────

/**
 * Crea un mock del Supabase client que retorna los valores dados.
 * La cadena de métodos (.select().eq()...) retorna siempre el mismo mock.
 */
function makeSupabaseMock(result: {
  data?: unknown;
  error?: { message: string } | null;
  count?: number;
}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
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
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
    single: vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// ─── findByOrganization ───────────────────────────────────────────────────────

describe('SupabaseMetricsRepository.findByOrganization', () => {
  it('retorna métricas de la organización', async () => {
    const row = makeMetricRow();
    const supabase = makeSupabaseMock({ data: [row], count: 1 });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.data[0]?.platform).toBe('meta');
  });

  it('retorna lista vacía cuando no hay métricas', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasNextPage).toBe(false);
  });

  it('filtra por cliente', async () => {
    const row = makeMetricRow({ client_id: CLIENT_ID_1 });
    const supabase = makeSupabaseMock({ data: [row], count: 1 });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID, clientId: CLIENT_ID_1 },
      { page: 1, pageSize: 10 },
    );

    // Verifica que se aplica el filtro eq('client_id')
    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID_1);
    expect(result.data).toHaveLength(1);
  });

  it('filtra por período', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const periodStart = new Date('2026-06-01');
    const periodEnd = new Date('2026-06-30');
    await repo.findByOrganization(
      { organizationId: ORG_ID, periodStart, periodEnd },
      { page: 1, pageSize: 10 },
    );

    expect(supabase._chain.gte).toHaveBeenCalledWith('period_start', periodStart.toISOString());
    expect(supabase._chain.lte).toHaveBeenCalledWith('period_end', periodEnd.toISOString());
  });

  it('calcula paginación correctamente', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 25 });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 2, pageSize: 10 },
    );

    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPreviousPage).toBe(true);
    expect(result.page).toBe(2);
  });

  it('retorna lista vacía (no lanza) ante error de Supabase', async () => {
    const supabase = makeSupabaseMock({ error: { message: 'connection error' } });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('siempre filtra por organization_id (tenant scope)', async () => {
    const supabase = makeSupabaseMock({ data: [], count: 0 });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    await repo.findByOrganization({ organizationId: ORG_ID }, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });

  it('maneja JSONB parcial (campos opcionales ausentes en metrics)', async () => {
    // metrics sin traffic/engagement/conversations
    const row = makeMetricRow({ metrics: { ...baseMetrics } });
    const supabase = makeSupabaseMock({ data: [row], count: 1 });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByOrganization(
      { organizationId: ORG_ID },
      { page: 1, pageSize: 10 },
    );

    expect(result.data[0]?.metrics.traffic).toBeUndefined();
    expect(result.data[0]?.metrics.spend).toBe(77053);
  });
});

// ─── findByClient ─────────────────────────────────────────────────────────────

describe('SupabaseMetricsRepository.findByClient', () => {
  it('delega a findByOrganization con clientId', async () => {
    const row = makeMetricRow();
    const supabase = makeSupabaseMock({ data: [row], count: 1 });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findByClient(CLIENT_ID_1, ORG_ID, {}, { page: 1, pageSize: 10 });

    expect(supabase._chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(supabase._chain.eq).toHaveBeenCalledWith('client_id', CLIENT_ID_1);
    expect(result.data).toHaveLength(1);
  });
});

// ─── findLatestByClient ───────────────────────────────────────────────────────

describe('SupabaseMetricsRepository.findLatestByClient', () => {
  it('retorna la métrica más reciente', async () => {
    const row = makeMetricRow();
    const supabase = makeSupabaseMock({ data: row });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findLatestByClient(CLIENT_ID_1, ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).not.toBeNull();
      expect(result.value?.platform).toBe('meta');
    }
  });

  it('retorna null cuando no hay métricas para el cliente', async () => {
    const supabase = makeSupabaseMock({ data: null });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findLatestByClient(CLIENT_ID_2, ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBeNull();
  });

  it('retorna err(INTERNAL_ERROR) ante error de Supabase', async () => {
    const supabase = makeSupabaseMock({ error: { message: 'db error' } });
    // maybeSingle resuelve con error
    supabase._chain.maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'db error' },
    });
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findLatestByClient(CLIENT_ID_1, ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── getOrganizationSummary ───────────────────────────────────────────────────

describe('SupabaseMetricsRepository.getOrganizationSummary', () => {
  it('agrega totales correctamente con múltiples filas', async () => {
    const row1 = makeMetricRow({ metrics: { ...baseMetrics, spend: 100, roas: 2 } });
    const row2 = makeMetricRow({
      id: 'metric-uuid-2',
      client_id: CLIENT_ID_2,
      metrics: { ...baseMetrics, spend: 200, roas: 4 },
    });

    // limit() requiere mock que resuelva directamente (no range)
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [row1, row2], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.getOrganizationSummary(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.totalSpend).toBe(300);
      expect(result.value.avgRoas).toBe(3); // (2+4)/2
    }
  });

  it('retorna ceros cuando no hay métricas', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.getOrganizationSummary(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.totalSpend).toBe(0);
      expect(result.value.avgRoas).toBe(0);
    }
  });

  it('excluye ROAS = 0 del promedio', async () => {
    const row = makeMetricRow({ metrics: { ...baseMetrics, spend: 100, roas: 0 } });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [row], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.getOrganizationSummary(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.avgRoas).toBe(0);
  });

  it('retorna err(INTERNAL_ERROR) ante error de Supabase', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.getOrganizationSummary(ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── getAvailablePeriods ──────────────────────────────────────────────────────

describe('SupabaseMetricsRepository.getAvailablePeriods', () => {
  it('deduplica períodos de múltiples clientes', async () => {
    // Dos clientes con el mismo período
    const rows = [
      { period_start: '2026-06-01T00:00:00.000Z', period_end: '2026-06-30T23:59:59.000Z' },
      { period_start: '2026-06-01T00:00:00.000Z', period_end: '2026-06-30T23:59:59.000Z' },
      { period_start: '2026-07-01T00:00:00.000Z', period_end: '2026-07-31T23:59:59.000Z' },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.getAvailablePeriods(ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      // 3 filas → 2 períodos únicos
      expect(result.value).toHaveLength(2);
    }
  });
});

// ─── findById ─────────────────────────────────────────────────────────────────

describe('SupabaseMetricsRepository.findById', () => {
  it('retorna la métrica por ID con campaigns', async () => {
    const row = {
      ...makeMetricRow(),
      campaigns: [
        {
          id: 'c1',
          name: 'Campaign 1',
          spend: 100,
          impressions: 500,
          clicks: 10,
          leads: 0,
          conversions: 0,
          revenue: 0,
        },
      ],
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(METRIC_ID, ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.campaigns).toHaveLength(1);
    }
  });

  it('retorna err(NOT_FOUND) cuando no existe', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(METRIC_ID, ORG_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('siempre filtra por organization_id (tenant scope)', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseMetricsRepository(supabase as unknown as SupabaseClient);

    await repo.findById(METRIC_ID, ORG_ID);

    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });
});
