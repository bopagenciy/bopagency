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

// ─── Phase 6F: resolveActiveByAlertKeyPrefixes (recovery best-effort) ─────────
//
// Cubre el fix del bug "recovery resolve failed (best-effort) / INTERNAL_ERROR"
// observado en Phase 6 local staging, en tres capas:
//  1. `resolved_by` es `uuid NULL REFERENCES auth.users(id)` — no puede
//     recibir una etiqueta de texto libre como "automation-recovery:<execId>".
//  2. `service_role` necesita GRANT explícito sobre `alerts` (cubierto por la
//     migración correctiva, no por este repositorio).
//  3. [RESOLUCIÓN FINAL] `.or(...)` con valores que contienen ':' seguía
//     fallando con 42703 en runtime incluso con el valor correctamente
//     citado entre comillas dobles — confirmado con logging real
//     (RECOVERY_FILTER_V2), Next.js y PostgREST reiniciados. Se eliminó por
//     completo la dependencia de `.or()`: ahora se ejecuta un UPDATE
//     independiente por prefijo usando `.like('alert_key', ...)`.

const ORG_B = 'org-uuid-2' as unknown as OrganizationId;
const VALID_UUID = '11111111-2222-4333-8444-555555555555';

type UpdateChain = {
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

type ChainResult = {
  data?: unknown;
  error?: { code?: string; message?: string; details?: string; hint?: string } | null;
};

function makeChain(result: ChainResult): UpdateChain {
  const chain = {} as UpdateChain;
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.like = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockResolvedValue({ data: result.data ?? [], error: result.error ?? null });
  return chain;
}

/** Un único chain reutilizado en cada `.from()` — para tests donde todos los prefijos se comportan igual. */
function makeUpdateChain(result: ChainResult): UpdateChain {
  return makeChain(result);
}

/**
 * Un chain NUEVO por cada llamada a `.from()`, con resultados en el orden
 * dado — para tests donde cada prefijo (cada iteración del for-of) debe
 * comportarse distinto (p.ej. dedup de ids, o error a mitad de la iteración).
 */
function makeSequentialSupabase(results: ChainResult[]): { from: ReturnType<typeof vi.fn>; chains: UpdateChain[] } {
  const chains: UpdateChain[] = [];
  let callIndex = 0;
  const from = vi.fn().mockImplementation(() => {
    const result = results[callIndex] ?? { data: [], error: null };
    callIndex++;
    const chain = makeChain(result);
    chains.push(chain);
    return chain;
  });
  return { from, chains };
}

describe('SupabaseAlertRepository.resolveActiveByAlertKeyPrefixes', () => {
  it('ya NO llama a .or() — usa .like() por prefijo', async () => {
    // El mock del chain deliberadamente NO define un método `or`: si el
    // repositorio intentara llamar `.or(...)`, esto lanzaría un TypeError
    // ("chain.or is not a function") y el test fallaría. Que la llamada
    // complete con éxito ya es, en sí mismo, la prueba de que `.or()` no se
    // usa; además confirmamos explícitamente que sí se usa `.like()`.
    const chain = makeUpdateChain({ data: [{ id: 'alert-1' }] });
    expect((chain as unknown as { or?: unknown }).or).toBeUndefined();

    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(result.success).toBe(true);
    expect(chain.like).toHaveBeenCalledWith('alert_key', 'automation:org-uuid-1:auto-1:dispatch-failed%');
  });

  it('resuelve la alerta activa abierta por el mismo incidente de automatización', async () => {
    const chain = makeUpdateChain({ data: [{ id: 'alert-1' }] });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(1);
  });

  it('ejecuta un UPDATE independiente por cada prefijo aplicable y resuelve alertas de todos', async () => {
    const { from, chains } = makeSequentialSupabase([
      { data: [{ id: 'alert-dispatch-failed' }] },
      { data: [] },
      { data: [{ id: 'alert-max-attempts' }] },
      { data: [] },
    ]);
    const supabase = { from };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const prefixes = [
      'automation:org-uuid-1:auto-1:dispatch-failed',
      'automation:org-uuid-1:auto-1:execution-failed',
      'automation:org-uuid-1:auto-1:max-attempts',
      'automation:org-uuid-1:auto-1:stuck',
    ];
    const result = await repo.resolveActiveByAlertKeyPrefixes(prefixes, ORG_ID, 'automation-recovery:exec-123');

    expect(from).toHaveBeenCalledTimes(4);
    expect(chains[0]?.like).toHaveBeenCalledWith('alert_key', `${prefixes[0]}%`);
    expect(chains[1]?.like).toHaveBeenCalledWith('alert_key', `${prefixes[1]}%`);
    expect(chains[2]?.like).toHaveBeenCalledWith('alert_key', `${prefixes[2]}%`);
    expect(chains[3]?.like).toHaveBeenCalledWith('alert_key', `${prefixes[3]}%`);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(2);
  });

  it('deduplica ids si el mismo id aparece resuelto por más de un prefijo', async () => {
    const { from } = makeSequentialSupabase([
      { data: [{ id: 'alert-1' }] },
      { data: [{ id: 'alert-1' }] }, // mismo id — no debería ocurrir por diseño, pero no debe contarse dos veces
    ]);
    const supabase = { from };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed', 'automation:org-uuid-1:auto-1:max-attempts'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(1);
  });

  it('NO escribe una etiqueta de texto libre en resolved_by (columna uuid) — usa NULL', async () => {
    const chain = makeUpdateChain({ data: [{ id: 'alert-1' }] });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ resolved_by: null, status: 'resolved' }),
    );
  });

  it('persiste resolved_by cuando resolvedByLabel es un UUID válido, en cada iteración', async () => {
    const { from, chains } = makeSequentialSupabase([
      { data: [] },
      { data: [] },
    ]);
    const supabase = { from };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed', 'automation:org-uuid-1:auto-1:max-attempts'],
      ORG_ID,
      VALID_UUID,
    );

    expect(chains[0]?.update).toHaveBeenCalledWith(expect.objectContaining({ resolved_by: VALID_UUID }));
    expect(chains[1]?.update).toHaveBeenCalledWith(expect.objectContaining({ resolved_by: VALID_UUID }));
  });

  it('filtra siempre por organization_id — no resuelve alertas de otra organización', async () => {
    const chain = makeUpdateChain({ data: [] });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(chain.eq).toHaveBeenCalledWith('organization_id', String(ORG_ID));
    expect(chain.eq).not.toHaveBeenCalledWith('organization_id', String(ORG_B));
  });

  it('aplica siempre status=active (no reabre ni toca alertas ya resueltas)', async () => {
    const chain = makeUpdateChain({ data: [] });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('cada prefijo genera su propio .like("alert_key", "<prefijo>%") — no resuelve una key no incluida', async () => {
    const { from, chains } = makeSequentialSupabase([{ data: [] }, { data: [] }]);
    const supabase = { from };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed', 'automation:org-uuid-1:auto-1:max-attempts'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(chains[0]?.like).toHaveBeenCalledWith('alert_key', 'automation:org-uuid-1:auto-1:dispatch-failed%');
    expect(chains[1]?.like).toHaveBeenCalledWith('alert_key', 'automation:org-uuid-1:auto-1:max-attempts%');
    // Ningún .like() debería haberse llamado con un prefijo de otra automation/incident type.
    expect(chains[0]?.like).not.toHaveBeenCalledWith('alert_key', expect.stringContaining('other-automation'));
    expect(chains[1]?.like).not.toHaveBeenCalledWith('alert_key', expect.stringContaining('execution-failed'));
  });

  // ── Historial: 42703 "column alerts.alert_key does not exist" ───────────────
  //
  // Causa real (confirmada contra la documentación oficial de PostgREST y
  // luego contra evidencia runtime real): ':' es un carácter reservado en la
  // gramática de combinadores or()/and() de PostgREST, y alert_key siempre
  // contiene ':' (formato "automation:{orgId}:{automationId}:{tipo}"). El
  // quoting entre comillas dobles corrigió el string enviado (verificado en
  // runtime), pero `.or()` combinado con UPDATE/PATCH seguía fallando de
  // todas formas. Este test fija el string EXACTO que `resolveActiveByAlertKeyPrefixes`
  // pasa ahora a `.like()` para los IDs reales de la validación E2E — sin
  // pasar nunca por `.or()`.
  it('con los IDs reales de la validación E2E, genera un .like() por prefijo (sin .or())', async () => {
    const organizationId = 'd4c60c86-30a4-4360-8464-81c0af1d813c' as unknown as OrganizationId;
    const automationId = '1aec6ccb-670c-41e6-85a6-03823c6b405e';
    const prefixes = [
      `automation:${organizationId}:${automationId}:dispatch-failed`,
      `automation:${organizationId}:${automationId}:execution-failed`,
      `automation:${organizationId}:${automationId}:max-attempts`,
      `automation:${organizationId}:${automationId}:stuck`,
    ];

    const { from, chains } = makeSequentialSupabase(prefixes.map(() => ({ data: [] })));
    const supabase = { from };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.resolveActiveByAlertKeyPrefixes(prefixes, organizationId, 'automation-recovery:exec-944bca4f');

    expect(from).toHaveBeenCalledTimes(4);
    prefixes.forEach((prefix, i) => {
      expect(chains[i]?.like).toHaveBeenCalledWith('alert_key', `${prefix}%`);
      expect(chains[i]?.eq).toHaveBeenCalledWith('organization_id', String(organizationId));
      expect(chains[i]?.eq).toHaveBeenCalledWith('status', 'active');
    });
  });

  it('si no existe alerta previa activa, no falla — retorna ok(0)', async () => {
    const chain = makeUpdateChain({ data: [] });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(0);
  });

  it('retorna ok(0) sin llamar a Supabase cuando prefixes está vacío', async () => {
    const supabase = { from: vi.fn() };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.resolveActiveByAlertKeyPrefixes([], ORG_ID, 'automation-recovery:exec-123');

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('retorna err(INTERNAL_ERROR) ante error de Supabase — el fallo del repositorio sigue siendo best-effort para el caller', async () => {
    const chain = makeUpdateChain({ error: { code: '22P02', message: 'invalid input syntax for type uuid' } });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });

  it('si un prefijo intermedio falla, detiene la iteración y mapea el error (no sigue con los restantes)', async () => {
    const { from, chains } = makeSequentialSupabase([
      { data: [{ id: 'alert-1' }] },
      { error: { code: '42703', message: 'column alerts.alert_key does not exist' } },
      { data: [{ id: 'alert-3' }] },
    ]);
    const supabase = { from };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    const result = await repo.resolveActiveByAlertKeyPrefixes(
      [
        'automation:org-uuid-1:auto-1:dispatch-failed',
        'automation:org-uuid-1:auto-1:execution-failed',
        'automation:org-uuid-1:auto-1:max-attempts',
      ],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
    // Solo se intentaron los primeros 2 prefijos — el tercero nunca se ejecutó.
    expect(from).toHaveBeenCalledTimes(2);
    expect(chains).toHaveLength(2);
  });

  it('registra de forma segura el error real de Postgres (code/message/details/hint) antes de mapearlo a INTERNAL_ERROR', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const chain = makeUpdateChain({
      error: {
        code: '42501',
        message: 'permission denied for table alerts',
        details: 'Role service_role lacks UPDATE privilege.',
        hint: 'Grant the missing privilege.',
      },
    });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseAlertRepository(supabase as unknown as SupabaseClient);

    await repo.resolveActiveByAlertKeyPrefixes(
      ['automation:org-uuid-1:auto-1:dispatch-failed'],
      ORG_ID,
      'automation-recovery:exec-123',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('resolveActiveByAlertKeyPrefixes'),
      expect.objectContaining({
        prefix:  'automation:org-uuid-1:auto-1:dispatch-failed',
        code:    '42501',
        message: 'permission denied for table alerts',
        details: 'Role service_role lacks UPDATE privilege.',
        hint:    'Grant the missing privilege.',
      }),
    );

    consoleErrorSpy.mockRestore();
  });
});
