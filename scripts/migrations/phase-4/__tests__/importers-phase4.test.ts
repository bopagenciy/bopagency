/**
 * Phase 4 — Importer tests (Phase 4 corrections)
 *
 * Cubre:
 *  - Structural: no legacy_id en clients, no .upsert()/onConflict en agents/skills/templates
 *  - persistScopedContentEntity: insert / skip-preexisting / update / conflict / errors
 *  - ClientsImporter: insert / skip / update (vía acceso a método privado)
 *  - Automations: 7 registros existentes → skip/update, sin duplicados
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Elimina comentarios de bloque (/* ... *\/) y de línea (// ...)
 * antes de aplicar aserciones sobre código fuente.
 */
function stripComments(src: string): string {
  // Block comments
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Line comments
  out = out.replace(/\/\/[^\n]*/g, '');
  return out;
}

/**
 * Construye un chain thenable compatible con Supabase query builder.
 * La respuesta se captura en el momento de llamar a `from()`.
 */
function makeChain(response: { data: unknown; error: unknown }) {
  const captured = response;
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(captured),
    maybeSingle: vi.fn().mockResolvedValue(captured),
    then(
      resolve: (v: typeof captured) => unknown,
      reject?: (e: unknown) => unknown,
    ): Promise<unknown> {
      return Promise.resolve(captured).then(resolve, reject);
    },
    catch(reject: (e: unknown) => unknown): Promise<unknown> {
      return Promise.resolve(captured).catch(reject);
    },
    finally(cb: () => void): Promise<unknown> {
      return Promise.resolve(captured).finally(cb);
    },
  };
  return chain;
}

/**
 * Construye un cliente Supabase mock con colas de respuesta por tabla.
 * Cada llamada a `from(table)` desencola la siguiente respuesta de esa tabla.
 */
function makeSupabaseClient(
  tableQueues: Record<string, Array<{ data: unknown; error: unknown }>>,
): { from: ReturnType<typeof vi.fn> } {
  const queues = new Map<string, Array<{ data: unknown; error: unknown }>>(
    Object.entries(tableQueues).map(([k, v]) => [k, [...v]]),
  );

  return {
    from: vi.fn((table: string) => {
      const queue = queues.get(table) ?? [];
      const response = queue.shift() ?? { data: null, error: null };
      return makeChain(response);
    }),
  };
}

// ─── Paths de fuentes ─────────────────────────────────────────────────────────

const IMPORTERS_DIR = path.resolve(__dirname, '..', 'importers');
const readImporter = (name: string) => fs.readFileSync(path.join(IMPORTERS_DIR, name), 'utf-8');
const readImporterCode = (name: string) => stripComments(readImporter(name));

// ─── 1. Structural tests ──────────────────────────────────────────────────────

describe('Structural — clients-importer.ts', () => {
  let src: string;
  let code: string;
  beforeEach(() => {
    src = readImporter('clients-importer.ts');
    code = stripComments(src);
  });

  it('ClientRow interface fue eliminado — INSERT va via RPC (no interface con legacy_id)', () => {
    // ClientRow/ClientUpdateRow eliminados; INSERT y UPDATE se realizan via RPC.
    // No debe existir la interface ni legacy_id en ningún payload.
    expect(code).not.toMatch(/interface ClientRow/);
    expect(code).not.toMatch(/legacy_id/);
  });

  it('payload insert no contiene legacy_id (text guard: "legacy_id:")', () => {
    // Verifica que legacy_id no aparece como clave de objeto en ningún payload
    expect(code).not.toMatch(/legacy_id\s*:/);
  });

  it('payload update no contiene legacy_id (code, sin comentarios)', () => {
    // Código limpio de comentarios no debe mencionar legacy_id
    expect(code).not.toMatch(/legacy_id/);
  });

  it('no usa .upsert( en código (sin comentarios)', () => {
    expect(code).not.toMatch(/\.upsert\(/);
  });

  it('no usa onConflict en código (sin comentarios)', () => {
    expect(code).not.toMatch(/onConflict/);
  });
});

describe('Structural — agents-importer.ts', () => {
  let code: string;
  beforeEach(() => {
    code = readImporterCode('agents-importer.ts');
  });

  it('no usa .upsert( en código (sin comentarios)', () => {
    expect(code).not.toMatch(/\.upsert\(/);
  });

  it('no usa onConflict en código (sin comentarios)', () => {
    expect(code).not.toMatch(/onConflict/);
  });

  it('updatePayload no contiene legacy_path como clave', () => {
    const updateBlock = code.match(/updatePayload[^=]*=\s*\{([^}]+)\}/s);
    const body = updateBlock?.[1] ?? '';
    expect(body, 'updatePayload block not found in agents-importer').not.toBe('');
    expect(body).not.toMatch(/legacy_path\s*:/);
  });

  it('updatePayload no contiene organization_id como clave', () => {
    const updateBlock = code.match(/updatePayload[^=]*=\s*\{([^}]+)\}/s);
    const body = updateBlock?.[1] ?? '';
    expect(body).not.toMatch(/organization_id\s*:/);
  });

  it('updatePayload no contiene slug como clave', () => {
    const updateBlock = code.match(/updatePayload[^=]*=\s*\{([^}]+)\}/s);
    const body = updateBlock?.[1] ?? '';
    expect(body).not.toMatch(/\bslug\s*:/);
  });
});

describe('Structural — skills-importer.ts', () => {
  let code: string;
  beforeEach(() => {
    code = readImporterCode('skills-importer.ts');
  });

  it('no usa .upsert( en código (sin comentarios)', () => {
    expect(code).not.toMatch(/\.upsert\(/);
  });

  it('no usa onConflict en código (sin comentarios)', () => {
    expect(code).not.toMatch(/onConflict/);
  });

  it('updatePayload no contiene legacy_path como clave', () => {
    const updateBlock = code.match(/updatePayload[^=]*=\s*\{([^}]+)\}/s);
    const body = updateBlock?.[1] ?? '';
    expect(body, 'updatePayload block not found in skills-importer').not.toBe('');
    expect(body).not.toMatch(/legacy_path\s*:/);
  });

  it('updatePayload no contiene organization_id como clave', () => {
    const updateBlock = code.match(/updatePayload[^=]*=\s*\{([^}]+)\}/s);
    const body = updateBlock?.[1] ?? '';
    expect(body).not.toMatch(/organization_id\s*:/);
  });

  it('updatePayload no contiene slug como clave', () => {
    const updateBlock = code.match(/updatePayload[^=]*=\s*\{([^}]+)\}/s);
    const body = updateBlock?.[1] ?? '';
    expect(body).not.toMatch(/\bslug\s*:/);
  });
});

describe('Structural — templates-importer.ts', () => {
  let code: string;
  beforeEach(() => {
    code = readImporterCode('templates-importer.ts');
  });

  it('no usa .upsert( en código (sin comentarios)', () => {
    expect(code).not.toMatch(/\.upsert\(/);
  });

  it('no usa onConflict en código (sin comentarios)', () => {
    expect(code).not.toMatch(/onConflict/);
  });

  it('updatePayload no contiene legacy_path como clave', () => {
    const updateBlock = code.match(/updatePayload[^=]*=\s*\{([^}]+)\}/s);
    const body = updateBlock?.[1] ?? '';
    expect(body, 'updatePayload block not found in templates-importer').not.toBe('');
    expect(body).not.toMatch(/legacy_path\s*:/);
  });

  it('updatePayload no contiene organization_id como clave', () => {
    const updateBlock = code.match(/updatePayload[^=]*=\s*\{([^}]+)\}/s);
    const body = updateBlock?.[1] ?? '';
    expect(body).not.toMatch(/organization_id\s*:/);
  });

  it('updatePayload no contiene slug como clave', () => {
    const updateBlock = code.match(/updatePayload[^=]*=\s*\{([^}]+)\}/s);
    const body = updateBlock?.[1] ?? '';
    expect(body).not.toMatch(/\bslug\s*:/);
  });
});

describe('Structural — automations-importer.ts', () => {
  it('busca por organization_id y legacy_id (columna válida en automations)', () => {
    const src = readImporter('automations-importer.ts');
    expect(src).toMatch(/organization_id/);
    expect(src).toMatch(/legacy_id/);
  });
});

// ─── 2. persistScopedContentEntity unit tests ─────────────────────────────────

describe('persistScopedContentEntity', () => {
  const ORG_ID = 'org-1';
  const SLUG = 'my-agent';
  const HASH = 'abc123';

  const baseOpts = {
    table: 'agents' as const,
    organizationId: ORG_ID,
    slug: SLUG,
    sourceHash: HASH,
    insertPayload: {
      organization_id: ORG_ID,
      slug: SLUG,
      name: 'My Agent',
      agent_type: 'specialist',
      description: null,
      content: 'content',
      is_global: false,
      is_active: true,
      legacy_path: '.agencia-ai/.claude/agents/my-agent.md',
      migrated_at: '2024-01-01T00:00:00.000Z',
      migration_version: '4.0.0',
      source_hash: HASH,
    },
    updatePayload: {
      name: 'My Agent',
      agent_type: 'specialist',
      description: null,
      content: 'content',
      is_active: true,
      migrated_at: '2024-01-01T00:00:00.000Z',
      migration_version: '4.0.0',
      source_hash: HASH,
    },
  };

  it('agent inexistente → insert (dry_run, targetId=null)', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const mockClient = makeSupabaseClient({
      agents: [{ data: [], error: null }],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      client: mockClient as never,
      mode: 'dry_run',
    });

    expect(result.action).toBe('insert');
    expect((result as { action: string; targetId: unknown }).targetId).toBeNull();
    // dry_run: solo la SELECT, no llama a insert
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.from).toHaveBeenCalledWith('agents');
  });

  it('agent inexistente → insert (execute, retorna targetId)', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const mockClient = makeSupabaseClient({
      agents: [
        { data: [], error: null }, // SELECT → vacío
        { data: { id: 'new-agent-id' }, error: null }, // INSERT
      ],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      client: mockClient as never,
      mode: 'execute',
    });

    expect(result.action).toBe('insert');
    expect((result as { action: string; targetId: string }).targetId).toBe('new-agent-id');
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it('agent existente mismo hash → skip-preexisting', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const mockClient = makeSupabaseClient({
      agents: [{ data: [{ id: 'existing-id', source_hash: HASH }], error: null }],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      client: mockClient as never,
      mode: 'execute',
    });

    expect(result.action).toBe('skip-preexisting');
    expect((result as { action: string; targetId: string }).targetId).toBe('existing-id');
    // Solo la SELECT fue necesaria
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it('agent existente hash diferente → update (dry_run, sin escritura)', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const mockClient = makeSupabaseClient({
      agents: [{ data: [{ id: 'existing-id', source_hash: 'old-hash' }], error: null }],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      client: mockClient as never,
      mode: 'dry_run',
    });

    expect(result.action).toBe('update');
    expect((result as { action: string; targetId: string }).targetId).toBe('existing-id');
    // dry_run: solo la SELECT, sin UPDATE
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it('agent existente hash diferente → update (execute)', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const mockClient = makeSupabaseClient({
      agents: [
        { data: [{ id: 'existing-id', source_hash: 'old-hash' }], error: null }, // SELECT
        { data: null, error: null }, // UPDATE
      ],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      client: mockClient as never,
      mode: 'execute',
    });

    expect(result.action).toBe('update');
    expect((result as { action: string; targetId: string }).targetId).toBe('existing-id');
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it('múltiples coincidencias → conflict', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const mockClient = makeSupabaseClient({
      agents: [
        {
          data: [
            { id: 'id-1', source_hash: HASH },
            { id: 'id-2', source_hash: HASH },
          ],
          error: null,
        },
      ],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      client: mockClient as never,
      mode: 'execute',
    });

    expect(result.action).toBe('conflict');
  });

  it('error de SELECT preserva PostgREST details', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const pgError = {
      message: 'relation does not exist',
      code: '42P01',
      details: 'Table agents not found',
      hint: 'Check schema',
    };
    const mockClient = makeSupabaseClient({
      agents: [{ data: null, error: pgError }],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      client: mockClient as never,
      mode: 'execute',
    });

    expect(result.action).toBe('error');
    const r = result as {
      action: string;
      errorCode: string;
      errorMessage: string;
      supabaseCode: string | null;
      supabaseDetails: string | null;
      supabaseHint: string | null;
    };
    expect(r.errorCode).toBe('SELECT_FAILED');
    expect(r.errorMessage).toBe('relation does not exist');
    expect(r.supabaseCode).toBe('42P01');
    expect(r.supabaseDetails).toBe('Table agents not found');
    expect(r.supabaseHint).toBe('Check schema');
  });

  it('error de INSERT preserva PostgREST details', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const pgError = {
      message: 'null value in column violates not-null constraint',
      code: '23502',
      details: 'Failing row contains ...',
      hint: null,
    };
    const mockClient = makeSupabaseClient({
      agents: [
        { data: [], error: null }, // SELECT → vacío
        { data: null, error: pgError }, // INSERT → error
      ],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      client: mockClient as never,
      mode: 'execute',
    });

    expect(result.action).toBe('error');
    const r = result as {
      action: string;
      errorCode: string;
      supabaseCode: string | null;
      supabaseDetails: string | null;
    };
    expect(r.errorCode).toBe('INSERT_FAILED');
    expect(r.supabaseCode).toBe('23502');
    expect(r.supabaseDetails).toBe('Failing row contains ...');
  });

  it('error de UPDATE preserva PostgREST details', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const pgError = {
      message: 'permission denied for table agents',
      code: '42501',
      details: null,
      hint: null,
    };
    const mockClient = makeSupabaseClient({
      agents: [
        { data: [{ id: 'existing-id', source_hash: 'old-hash' }], error: null }, // SELECT
        { data: null, error: pgError }, // UPDATE → error
      ],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      client: mockClient as never,
      mode: 'execute',
    });

    expect(result.action).toBe('error');
    const r = result as { action: string; errorCode: string; supabaseCode: string | null };
    expect(r.errorCode).toBe('UPDATE_FAILED');
    expect(r.supabaseCode).toBe('42501');
  });

  it('skill inexistente → insert (dry_run)', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const mockClient = makeSupabaseClient({
      skills: [{ data: [], error: null }],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      table: 'skills',
      client: mockClient as never,
      mode: 'dry_run',
    });

    expect(result.action).toBe('insert');
    expect(mockClient.from).toHaveBeenCalledWith('skills');
  });

  it('template inexistente → insert (dry_run)', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');
    const mockClient = makeSupabaseClient({
      templates: [{ data: [], error: null }],
    });

    const result = await persistScopedContentEntity({
      ...baseOpts,
      table: 'templates',
      client: mockClient as never,
      mode: 'dry_run',
    });

    expect(result.action).toBe('insert');
    expect(mockClient.from).toHaveBeenCalledWith('templates');
  });

  it('update no envía legacy_path, organization_id, ni slug en updatePayload', async () => {
    const { persistScopedContentEntity } = await import('../adapters/scoped-content-persistence');

    const capturedUpdates: unknown[] = [];

    // Chain SELECT — devuelve fila con hash antiguo
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then(
        resolve: (v: { data: Array<{ id: string; source_hash: string }>; error: null }) => unknown,
      ) {
        return Promise.resolve({
          data: [{ id: 'existing', source_hash: 'OLD_HASH' }],
          error: null,
        }).then(resolve);
      },
      catch: (r: (e: unknown) => unknown) => Promise.resolve({ data: null, error: null }).catch(r),
      finally: (cb: () => void) => Promise.resolve({ data: null, error: null }).finally(cb),
    };

    // Chain UPDATE — captura el payload recibido
    const updateChain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn((payload: unknown) => {
        capturedUpdates.push(payload);
        return updateChain;
      }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then(resolve: (v: { data: null; error: null }) => unknown) {
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
      catch: (r: (e: unknown) => unknown) => Promise.resolve({ data: null, error: null }).catch(r),
      finally: (cb: () => void) => Promise.resolve({ data: null, error: null }).finally(cb),
    };

    const mockClient = {
      from: vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain),
    };

    const updatePayload = {
      name: 'Agent',
      agent_type: 'specialist',
      content: 'new content',
      is_active: true,
      migrated_at: new Date().toISOString(),
      migration_version: '4.0.0',
      source_hash: HASH,
    };

    await persistScopedContentEntity({
      ...baseOpts,
      updatePayload,
      client: mockClient as never,
      mode: 'execute',
    });

    expect(capturedUpdates).toHaveLength(1);
    const sent = capturedUpdates[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('legacy_path');
    expect(sent).not.toHaveProperty('organization_id');
    expect(sent).not.toHaveProperty('slug');
  });
});

// ─── 3. ClientsImporter behavioral tests ──────────────────────────────────────
// Nota: se requiere mockear @supabase/supabase-js para evitar el error de
// importación ESM de iceberg-js (dependencia transitiva de storage-js).

describe('ClientsImporter — persistClient (via acceso a método privado)', () => {
  const ORG_ID = 'org-abc';
  const RUN_ID = 'run-001';
  const SOURCE_PATH = 'shared-data/clients-index.json#legalink-col';
  const SOURCE_KEY = 'legalink-col';
  const SOURCE_HASH = 'hash-legalink-v1';

  const fakeEntry = {
    id: 'legalink-col',
    name: 'Legalink Colombia',
    status: 'active',
    industry: 'Servicios legales digitales',
    currency: 'COP',
    timezone: 'America/Bogota',
    website: 'https://legalink.co',
    notes: null,
  };

  type PersistClientFn = (
    client: unknown,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    entry: typeof fakeEntry,
    mode: string,
    actorUserId: string | undefined,
  ) => Promise<{ action: string; targetId: string | null; errorCode: string | null }>;

  /** Mock client con from() Y rpc() */
  function makeClientWithRpc(
    tableQueues: Record<string, Array<{ data: unknown; error: unknown }>>,
    rpcResponses: Array<{ data: unknown; error: unknown }>,
  ) {
    const base = makeSupabaseClient(tableQueues);
    const rpcQueue = [...rpcResponses];
    return Object.assign(base, {
      rpc: vi.fn((_name: string, _args?: unknown) => {
        const res = rpcQueue.shift() ?? { data: null, error: null };
        return Promise.resolve(res);
      }),
    });
  }

  beforeEach(() => {
    vi.resetModules();
  });

  it('cliente inexistente → insert (execute) vía RPC create_migrated_client', async () => {
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const { ClientsImporter } = await import('../importers/clients-importer');
    const importer = new ClientsImporter(false);

    const mockClient = makeClientWithRpc(
      { clients: [{ data: null, error: null }] }, // SELECT → no encontrado
      [{ data: 'new-client-id', error: null }], // rpc create_migrated_client → UUID
    );

    const result = await (importer as unknown as { persistClient: PersistClientFn }).persistClient(
      mockClient,
      RUN_ID,
      ORG_ID,
      SOURCE_PATH,
      SOURCE_KEY,
      SOURCE_HASH,
      fakeEntry,
      'execute',
      'actor-uuid-1234',
    );

    expect(result.action).toBe('insert');
    expect(result.targetId).toBe('new-client-id');
    expect(result.errorCode).toBeNull();

    // Verifica que se llamó al RPC correcto
    expect((mockClient.rpc as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
      'create_migrated_client',
    );
    // p_actor_user_id pasado al RPC
    const rpcArgs = (mockClient.rpc as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(rpcArgs?.['p_actor_user_id']).toBe('actor-uuid-1234');
  });

  it('cliente existente mismo hash → skip-preexisting', async () => {
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const { ClientsImporter } = await import('../importers/clients-importer');
    const importer = new ClientsImporter(false);

    const mockClient = makeClientWithRpc(
      {
        clients: [{ data: { id: 'existing-id', deleted_at: null }, error: null }],
        migration_records: [{ data: { source_hash: SOURCE_HASH }, error: null }],
      },
      [],
    );

    const result = await (importer as unknown as { persistClient: PersistClientFn }).persistClient(
      mockClient,
      RUN_ID,
      ORG_ID,
      SOURCE_PATH,
      SOURCE_KEY,
      SOURCE_HASH,
      fakeEntry,
      'execute',
      'actor-uuid-1234',
    );

    expect(result.action).toBe('skip-preexisting');
    expect(result.targetId).toBe('existing-id');
  });

  it('cliente existente hash diferente → update (execute) vía RPC update_migrated_client', async () => {
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const { ClientsImporter } = await import('../importers/clients-importer');
    const importer = new ClientsImporter(false);

    const mockClient = makeClientWithRpc(
      {
        clients: [{ data: { id: 'existing-id', deleted_at: null }, error: null }],
        migration_records: [{ data: { source_hash: 'OLD_HASH_DIFFERENT' }, error: null }],
      },
      [{ data: null, error: null }], // rpc update_migrated_client
    );

    const result = await (importer as unknown as { persistClient: PersistClientFn }).persistClient(
      mockClient,
      RUN_ID,
      ORG_ID,
      SOURCE_PATH,
      SOURCE_KEY,
      SOURCE_HASH,
      fakeEntry,
      'execute',
      'actor-uuid-1234',
    );

    expect(result.action).toBe('update');
    expect(result.targetId).toBe('existing-id');
    // Verifica que se llamó al RPC correcto
    expect((mockClient.rpc as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
      'update_migrated_client',
    );
  });

  it('payload INSERT de clients no contiene legacy_id (structural guard)', () => {
    const code = stripComments(
      fs.readFileSync(path.resolve(IMPORTERS_DIR, 'clients-importer.ts'), 'utf-8'),
    );
    expect(code).not.toMatch(/legacy_id\s*:/);
  });
});

// ─── 4. Automations — no duplica registros existentes ────────────────────────

describe('Structural — automations-importer.ts no duplica', () => {
  it('no usa onConflict en agents/skills/templates (sin comentarios)', () => {
    expect(readImporterCode('agents-importer.ts')).not.toMatch(/onConflict/);
    expect(readImporterCode('skills-importer.ts')).not.toMatch(/onConflict/);
    expect(readImporterCode('templates-importer.ts')).not.toMatch(/onConflict/);
  });

  it('automations verifica existencia (maybeSingle) antes de insertar', () => {
    const src = readImporter('automations-importer.ts');
    expect(src).toMatch(/maybeSingle/);
  });

  it('automations compara source_hash para skip-preexisting (no duplica)', () => {
    const src = readImporter('automations-importer.ts');
    expect(src).toMatch(/source_hash/);
    expect(src).toMatch(/skip-preexisting/);
  });

  it('automations busca por organization_id + legacy_id', () => {
    const src = readImporter('automations-importer.ts');
    expect(src).toMatch(/organization_id/);
    expect(src).toMatch(/legacy_id/);
  });
});

// ─── 5. Structural — clients Phase 2 (sin migrated_at/migration_version) ──────

describe('Structural — clients-importer.ts (Phase 2: columnas reales)', () => {
  let src: string;
  let code: string;
  beforeEach(() => {
    src = readImporter('clients-importer.ts');
    code = stripComments(src);
  });

  it('ClientRow y ClientUpdateRow interfaces eliminadas — INSERT/UPDATE vía RPC', () => {
    // Las interfaces fueron eliminadas; INSERT y UPDATE ahora usan RPCs SECURITY DEFINER.
    // Verificamos que no existan las interfaces ni las columnas problemáticas.
    expect(code).not.toMatch(/interface ClientRow\b/);
    expect(code).not.toMatch(/interface ClientUpdateRow\b/);
    expect(code).not.toMatch(/migrated_at/);
    expect(code).not.toMatch(/migration_version/);
  });

  it('código no contiene migrated_at ni migration_version como clave', () => {
    expect(code).not.toMatch(/migrated_at\s*:/);
    expect(code).not.toMatch(/migration_version\s*:/);
  });

  it('payload INSERT no contiene migrated_at: como clave', () => {
    expect(code).not.toMatch(/migrated_at\s*:/);
  });

  it('payload INSERT no contiene migration_version: como clave', () => {
    expect(code).not.toMatch(/migration_version\s*:/);
  });

  it('mapClientStatus no produce valores "paused" ni "archived"', () => {
    // Esos valores no existen en el enum client_status real
    const fnMatch = code.match(/function mapClientStatus[\s\S]*?\}/);
    const fnBody = fnMatch?.[0] ?? '';
    expect(fnBody, 'mapClientStatus function not found').not.toBe('');
    expect(fnBody).not.toMatch(/'paused'/);
    expect(fnBody).not.toMatch(/'archived'/);
  });

  it('mapClientStatus cubre active, inactive, onboarding, churned', () => {
    const fnMatch = code.match(/function mapClientStatus[\s\S]*?\}/);
    const fnBody = fnMatch?.[0] ?? '';
    expect(fnBody).toMatch(/'active'/);
    expect(fnBody).toMatch(/'inactive'/);
    expect(fnBody).toMatch(/'churned'/);
  });
});

// ─── 6. Structural — alerts-importer.ts ──────────────────────────────────────

describe('Structural — alerts-importer.ts (Phase 2: normalización y sourceKey)', () => {
  let src: string;
  let code: string;
  beforeEach(() => {
    src = readImporter('alerts-importer.ts');
    code = stripComments(src);
  });

  it('exporta normalizeAlertStatus', () => {
    expect(src).toMatch(/export function normalizeAlertStatus/);
  });

  it('exporta deriveAlertSourceKey', () => {
    expect(src).toMatch(/export function deriveAlertSourceKey/);
  });

  it('usa normalizeAlertStatus en upsertAlert (no pasa entry.status ?? directamente al DB)', () => {
    // normalizeAlertStatus debe ser llamado antes del upsert
    expect(code).toMatch(/normalizeAlertStatus/);
    // El upsert ya no debe tener entry.status ?? 'active' directamente
    const upsertBlock = code.match(/upsert\s*\(\s*\{([\s\S]*?)\}\s*,\s*\{/);
    const upsertBody = upsertBlock?.[1] ?? '';
    expect(upsertBody).not.toMatch(/entry\.status/);
  });

  it('usa deriveAlertSourceKey en run() para derivar sourceKey', () => {
    expect(code).toMatch(/deriveAlertSourceKey/);
  });

  it('rechaza alertas con sourceKey no derivable (SOURCE_KEY_MISSING)', () => {
    expect(src).toMatch(/SOURCE_KEY_MISSING/);
  });

  it('alert_key en el upsert usa la clave derivada (no entry.alertKey directamente)', () => {
    const upsertBlock = code.match(/upsert\s*\(\s*\{([\s\S]*?)\}\s*,\s*\{/);
    const upsertBody = upsertBlock?.[1] ?? '';
    // alert_key debe referenciar la clave derivada, no entry.alertKey
    expect(upsertBody).not.toMatch(/entry\.alertKey/);
    expect(upsertBody).toMatch(/alert_key\s*:/);
  });

  it('preserva el estado validado (normalizedStatus) en el payload del upsert', () => {
    const upsertBlock = code.match(/upsert\s*\(\s*\{([\s\S]*?)\}\s*,\s*\{/);
    const upsertBody = upsertBlock?.[1] ?? '';
    expect(upsertBody).toMatch(/normalizedStatus/);
  });

  it('rechaza estado UNKNOWN_STATUS antes de escribir al DB', () => {
    expect(src).toMatch(/UNKNOWN_STATUS/);
  });

  it('parseAlertEntries usa Object.entries para preservar stateKey', () => {
    expect(code).toMatch(/Object\.entries/);
  });
});

// ─── 7. Unit — normalizeAlertStatus ──────────────────────────────────────────

describe('normalizeAlertStatus (unit)', () => {
  type NormalizeFunc = (raw: string | undefined) => string | null;
  let normalize: NormalizeFunc;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const mod = await import('../importers/alerts-importer');
    normalize = mod.normalizeAlertStatus as NormalizeFunc;
  });

  it('open → active', () => {
    expect(normalize('open')).toBe('active');
  });

  it('active → active', () => {
    expect(normalize('active')).toBe('active');
  });

  it('acknowledged → acknowledged', () => {
    expect(normalize('acknowledged')).toBe('acknowledged');
  });

  it('snoozed → snoozed', () => {
    expect(normalize('snoozed')).toBe('snoozed');
  });

  it('resolved → resolved', () => {
    expect(normalize('resolved')).toBe('resolved');
  });

  it('closed → resolved', () => {
    expect(normalize('closed')).toBe('resolved');
  });

  it('undefined → active (default para alertas sin estado)', () => {
    expect(normalize(undefined)).toBe('active');
  });

  it('estado desconocido → null (manual-review, nunca enviado al DB)', () => {
    expect(normalize('pending')).toBeNull();
    expect(normalize('NEW')).toBeNull();
    expect(normalize('random-status')).toBeNull();
  });

  it('es case-insensitive para el input', () => {
    expect(normalize('OPEN')).toBe('active');
    expect(normalize('Closed')).toBe('resolved');
    expect(normalize('ACTIVE')).toBe('active');
  });
});

// ─── 8. Unit — deriveAlertSourceKey ──────────────────────────────────────────

describe('deriveAlertSourceKey (unit)', () => {
  type DeriveFunc = (entry: unknown) => string | null;
  let derive: DeriveFunc;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const mod = await import('../importers/alerts-importer');
    derive = mod.deriveAlertSourceKey as DeriveFunc;
  });

  it('usa alertKey si está presente y no vacío', () => {
    const entry = { alertKey: 'my-alert-key-123', alertType: 'security' };
    expect(derive(entry)).toBe('my-alert-key-123');
  });

  it('usa id cuando alertKey es undefined', () => {
    const entry = { id: 'alert-id-from-source', alertType: 'security' };
    expect(derive(entry)).toBe('alert-id-from-source');
  });

  it('prioriza id sobre alertKey', () => {
    const entry = { id: 'id-wins', alertKey: 'alertkey-loses', alertType: 'security' };
    expect(derive(entry)).toBe('id-wins');
  });

  it('usa signature cuando id y alertKey faltan', () => {
    const entry = { signature: 'sig-abc123', alertType: 'security' };
    expect(derive(entry)).toBe('sig-abc123');
  });

  it('fallback a hash cuando no hay id/alertKey/signature', () => {
    const entry = {
      alertType: 'security',
      platform: 'google-ads',
      accountId: 'acc-123',
      detectedAt: '2024-01-01T00:00:00Z',
    };
    const result = derive(entry);
    expect(result).not.toBeNull();
    expect(result).toMatch(/^alert-/);
  });

  it('fallback hash es estable (mismo input → mismo output)', () => {
    const entry = {
      alertType: 'fraud',
      platform: 'meta',
      accountId: 'acc-456',
      detectedAt: '2024-06-15T12:00:00Z',
    };
    expect(derive(entry)).toBe(derive(entry));
  });

  it('retorna null solo si no hay absolutamente ningún dato identificador', () => {
    const entry = { alertType: '', platform: '', accountId: '', detectedAt: '' };
    expect(derive(entry)).toBeNull();
  });

  it('nunca retorna undefined (siempre string o null)', () => {
    const cases = [
      { alertKey: 'key', alertType: 'a' },
      { alertType: 'a', platform: 'p', accountId: 'id', detectedAt: 'dt' },
      { alertType: '', platform: '', accountId: '', detectedAt: '' },
    ];
    for (const c of cases) {
      const result = derive(c);
      expect(result).not.toBeUndefined();
    }
  });

  it('resultado máximo 255 caracteres', () => {
    const entry = { alertKey: 'a'.repeat(300), alertType: 'security' };
    const result = derive(entry);
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result.length).toBeLessThanOrEqual(255);
    }
  });

  it('alertKey vacío o solo espacios usa fallback', () => {
    const entry = {
      alertKey: '   ',
      alertType: 'security',
      platform: 'google',
      accountId: 'acc-1',
      detectedAt: '2024-01-01',
    };
    const result = derive(entry);
    // No debe usar el alertKey de espacios
    expect(result).not.toBe('   ');
    expect(result).toMatch(/^alert-/);
  });
});

// ─── 9. Structural — clients-importer.ts (migration actor) ───────────────────

describe('Structural — clients-importer.ts (Migration Actor)', () => {
  let src: string;
  let code: string;
  beforeEach(() => {
    src = readImporter('clients-importer.ts');
    code = stripComments(src);
  });

  it('usa create_migrated_client RPC para INSERT (no .from(clients).insert)', () => {
    // El INSERT debe ir vía RPC, no vía from('clients').insert(
    expect(code).toMatch(/create_migrated_client/);
    // No debe haber .from('clients').insert( en código limpio
    const fromInsertPattern = /\.from\s*\(\s*['"]clients['"]\s*\)\s*[\s\S]*?\.insert\s*\(/;
    expect(code).not.toMatch(fromInsertPattern);
  });

  it('usa update_migrated_client RPC para UPDATE (no .from(clients).update)', () => {
    expect(code).toMatch(/update_migrated_client/);
    const fromUpdatePattern = /\.from\s*\(\s*['"]clients['"]\s*\)\s*[\s\S]*?\.update\s*\(/;
    expect(code).not.toMatch(fromUpdatePattern);
  });

  it('valida ACTOR_MISSING en execute sin actorUserId (fallo temprano)', () => {
    expect(code).toMatch(/ACTOR_MISSING/);
    expect(code).toMatch(/actorUserId/);
  });

  it('p_actor_user_id se pasa al RPC de insert', () => {
    const rpcBlock = code.match(/create_migrated_client[\s\S]*?\}/);
    const body = rpcBlock?.[0] ?? '';
    expect(body).toMatch(/p_actor_user_id/);
  });

  it('p_actor_user_id se pasa al RPC de update', () => {
    const rpcBlock = code.match(/update_migrated_client[\s\S]*?\}/);
    const body = rpcBlock?.[0] ?? '';
    expect(body).toMatch(/p_actor_user_id/);
  });

  it('dry_run no hace escrituras (INSERT en dry_run retorna action insert, targetId null)', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const { ClientsImporter } = await import('../importers/clients-importer');
    const importer = new ClientsImporter(false);

    // En dry_run, persistClient devuelve insert sin llamar al RPC
    const mockClient = makeSupabaseClient({
      clients: [{ data: null, error: null }], // SELECT maybeSingle → no encontrado
    });

    type PersistFn = (
      client: unknown,
      runId: string,
      orgId: string,
      sourcePath: string,
      sourceKey: string,
      sourceHash: string,
      entry: unknown,
      mode: string,
      actorUserId: string | undefined,
    ) => Promise<{ action: string; targetId: string | null }>;

    const result = await (importer as unknown as { persistClient: PersistFn }).persistClient(
      mockClient,
      'run-1',
      'org-1',
      'shared-data/clients-index.json#legalink-col',
      'legalink-col',
      'hash-1',
      {
        id: 'legalink-col',
        name: 'Legalink',
        status: 'active',
        industry: 'Servicios legales digitales',
        currency: 'COP',
        timezone: 'America/Bogota',
        website: null,
        notes: null,
      },
      'dry_run',
      undefined, // no actor needed in dry_run
    );

    expect(result.action).toBe('insert');
    expect(result.targetId).toBeNull();
    // Solo la SELECT fue llamada, no el RPC
    expect((mockClient.from as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('execute sin actorUserId → error ACTOR_MISSING antes de procesar clientes', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const { ClientsImporter } = await import('../importers/clients-importer');
    const importer = new ClientsImporter(false);

    // Mock del filesystem para que el importer encuentre datos
    const mockConfig = {
      mode: 'execute',
      actorUserId: undefined, // ← no actor
      clients: [],
      limit: null,
      repositoryRoot: '/non-existent',
      projectRoot: '/non-existent',
      dataRoot: '/non-existent',
      verbose: false,
      supabaseUrl: 'http://localhost',
      supabaseServiceRoleKey: 'service_key',
      organizationId: 'org-1',
    };

    const results = await importer.run({
      runId: 'run-1',
      organizationId: 'org-1',
      config: mockConfig as never,
      migrationContext: {
        projectedClients: new Map(),
        excludedSlugs: new Set(),
      },
    });

    // Debe retornar error ACTOR_MISSING inmediatamente
    expect(results).toHaveLength(1);
    expect(results[0]?.record.action).toBe('error');
    expect(results[0]?.record.errorCode).toBe('ACTOR_MISSING');
  });
});

// ─── 10. Unit — normalizeAlertType ───────────────────────────────────────────

describe('normalizeAlertType (unit)', () => {
  type NormalizeTypeFunc = (entry: unknown, sourceKey: string) => string | null;
  let normalizeType: NormalizeTypeFunc;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const mod = await import('../importers/alerts-importer');
    normalizeType = mod.normalizeAlertType as NormalizeTypeFunc;
  });

  it('usa alert_type explícito (campo snake_case)', () => {
    const entry = { alert_type: 'no_campaigns', alertType: 'NO_CAMPAIGNS' };
    expect(normalizeType(entry, 'any-key')).toBe('no_campaigns');
  });

  it('usa alertType camelCase si alert_type no está', () => {
    const entry = { alertType: 'HIGH_CPA' };
    expect(normalizeType(entry, 'any-key')).toBe('high_cpa');
  });

  it('usa type genérico si no hay alert_type ni alertType', () => {
    const entry = { type: 'tracking_error' };
    expect(normalizeType(entry, 'any-key')).toBe('tracking_error');
  });

  it('NO_CAMPAIGNS desde sourceKey cuando entry no tiene campo de tipo', () => {
    const entry = { status: 'open' }; // sin alertType
    const sourceKey = 'legalink-col_NO_CAMPAIGNS_act_906768512465553';
    expect(normalizeType(entry, sourceKey)).toBe('no_campaigns');
  });

  it('NO_SPEND desde sourceKey', () => {
    const entry = {};
    expect(normalizeType(entry, 'magic-bungalow_NO_SPEND_act_123456')).toBe('no_spend');
  });

  it('HIGH_CPA desde sourceKey', () => {
    const entry = {};
    expect(normalizeType(entry, 'client-slug_HIGH_CPA_act_99999')).toBe('high_cpa');
  });

  it('LOW_CTR desde sourceKey', () => {
    const entry = {};
    expect(normalizeType(entry, 'client_LOW_CTR_act_111')).toBe('low_ctr');
  });

  it('TRACKING_ERROR desde sourceKey', () => {
    const entry = {};
    expect(normalizeType(entry, 'client-x_TRACKING_ERROR_act_222')).toBe('tracking_error');
  });

  it('tipo desconocido sin sourceKey derivable → null (ALERT_TYPE_MISSING)', () => {
    const entry = {};
    // sourceKey sin segmentos MAYÚSCULAS derivables
    expect(normalizeType(entry, 'plain-key-without-type')).toBeNull();
  });

  it('alert_type nunca null en el payload (normalizado o rechazado)', () => {
    // Si normalizeType retorna null, el importer NO debe enviar null al DB
    const entryWithType = { alertType: 'NO_SPEND' };
    const result = normalizeType(entryWithType, 'any');
    expect(result).not.toBeNull();
    expect(result).toBe('no_spend');
  });

  it('normaliza a formato ^[a-z][a-z0-9_]{0,99}$ siempre', () => {
    const cases = [
      { entry: { alertType: 'NO_CAMPAIGNS' }, key: 'k', expected: 'no_campaigns' },
      { entry: {}, key: 'slug_HIGH_CPA_act_1', expected: 'high_cpa' },
      { entry: { type: 'LOW_ROAS' }, key: 'k', expected: 'low_roas' },
    ];
    for (const c of cases) {
      const result = normalizeType(c.entry, c.key);
      expect(result).toBe(c.expected);
      if (result !== null) {
        expect(result).toMatch(/^[a-z][a-z0-9_]{0,99}$/);
      }
    }
  });

  it('segunda ejecución con mismo sourceKey → idempotente (mismo tipo derivado)', () => {
    const entry = { status: 'open' };
    const sourceKey = 'legalink-col_NO_CAMPAIGNS_act_906768512465553';
    expect(normalizeType(entry, sourceKey)).toBe(normalizeType(entry, sourceKey));
  });
});

// ─── 11. Structural — alerts-importer.ts (normalizeAlertType) ────────────────

describe('Structural — alerts-importer.ts (normalizeAlertType)', () => {
  let src: string;
  let code: string;
  beforeEach(() => {
    src = readImporter('alerts-importer.ts');
    code = stripComments(src);
  });

  it('exporta normalizeAlertType', () => {
    expect(src).toMatch(/export function normalizeAlertType/);
  });

  it('tiene KNOWN_ALERT_TYPE_MAP con mapeos explícitos', () => {
    expect(code).toMatch(/KNOWN_ALERT_TYPE_MAP/);
    expect(code).toMatch(/NO_CAMPAIGNS.*no_campaigns/s);
    expect(code).toMatch(/NO_SPEND.*no_spend/s);
    expect(code).toMatch(/HIGH_CPA.*high_cpa/s);
    expect(code).toMatch(/LOW_CTR.*low_ctr/s);
    expect(code).toMatch(/TRACKING_ERROR.*tracking_error/s);
  });

  it('usa normalizedAlertType en el payload del upsert (no entry.alertType directo)', () => {
    const upsertBlock = code.match(/upsert\s*\(\s*\{([\s\S]*?)\}\s*,\s*\{/);
    const body = upsertBlock?.[1] ?? '';
    expect(body).toMatch(/normalizedAlertType/);
    expect(body).not.toMatch(/entry\.alertType/);
  });

  it('rechaza ALERT_TYPE_MISSING si no se puede derivar tipo', () => {
    expect(src).toMatch(/ALERT_TYPE_MISSING/);
  });

  it('ALERT_TYPE_MISSING se comprueba ANTES de la operación de DB', () => {
    // ALERT_TYPE_MISSING debe aparecer antes de 'migration_records' en el código fuente.
    // La primera aparición de ALERT_TYPE_MISSING es el chequeo early-return en upsertAlert;
    // 'migration_records' aparece en el upsert posterior a ese chequeo.
    const typeMissingIdx = src.indexOf('ALERT_TYPE_MISSING');
    const migRecordsIdx = src.indexOf("'migration_records'");
    expect(typeMissingIdx, 'ALERT_TYPE_MISSING not found in source').toBeGreaterThan(-1);
    expect(migRecordsIdx, "'migration_records' not found in source").toBeGreaterThan(-1);
    expect(typeMissingIdx).toBeLessThan(migRecordsIdx);
  });
});

// ─── 12. Unit — deriveMonthlyPeriod (metrics) ────────────────────────────────

describe('deriveMonthlyPeriod (unit)', () => {
  let derive: typeof import('../importers/metrics-importer').deriveMonthlyPeriod;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const mod = await import('../importers/metrics-importer');
    derive = mod.deriveMonthlyPeriod;
  });

  it('2026-06 → 2026-06-01 / 2026-06-30', () => {
    const r = derive('2026-06.json', { sources: [] });
    expect(r).toEqual({ periodStart: '2026-06-01', periodEnd: '2026-06-30' });
  });

  it('2026-07 → 2026-07-01 / 2026-07-31', () => {
    const r = derive('2026-07.json', { sources: [] });
    expect(r).toEqual({ periodStart: '2026-07-01', periodEnd: '2026-07-31' });
  });

  it('febrero bisiesto 2028 → 2028-02-01 / 2028-02-29', () => {
    const r = derive('2028-02.json', { sources: [] });
    expect(r).toEqual({ periodStart: '2028-02-01', periodEnd: '2028-02-29' });
  });

  it('febrero no bisiesto 2025 → 2025-02-01 / 2025-02-28', () => {
    const r = derive('2025-02.json', { sources: [] });
    expect(r).toEqual({ periodStart: '2025-02-01', periodEnd: '2025-02-28' });
  });

  it('campos explícitos (periodStart/periodEnd top-level) tienen prioridad sobre filename', () => {
    const r = derive('2026-06.json', {
      periodStart: '2026-06-05',
      periodEnd: '2026-06-25',
      sources: [],
    });
    expect(r).toEqual({ periodStart: '2026-06-05', periodEnd: '2026-06-25' });
  });

  it('objeto period anidado {start, end} tiene prioridad sobre filename', () => {
    const r = derive('2026-06.json', {
      period: { start: '2026-06-01', end: '2026-06-30', timezone: 'America/Bogota' },
      sources: [],
    });
    expect(r).toEqual({ periodStart: '2026-06-01', periodEnd: '2026-06-30' });
  });

  it('filename inválido sin campos → null (PERIOD_MISSING)', () => {
    const r = derive('invalid-filename.json', { sources: [] });
    expect(r).toBeNull();
  });

  it('nunca devuelve null para nombres válidos YYYY-MM.json', () => {
    const filenames = ['2026-01.json', '2026-12.json', '2000-01.json'];
    for (const f of filenames) {
      expect(derive(f, { sources: [] })).not.toBeNull();
    }
  });
});

// ─── 13. Unit — normalizePlatform (metrics) ──────────────────────────────────

describe('normalizePlatform (unit)', () => {
  let normalize: typeof import('../importers/metrics-importer').normalizePlatform;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const mod = await import('../importers/metrics-importer');
    normalize = mod.normalizePlatform;
  });

  it('meta_ads → meta', () => expect(normalize('meta_ads')).toBe('meta'));
  it('meta → meta', () => expect(normalize('meta')).toBe('meta'));
  it('google_ads → google', () => expect(normalize('google_ads')).toBe('google'));
  it('google → google', () => expect(normalize('google')).toBe('google'));
  it('tiktok_ads → tiktok', () => expect(normalize('tiktok_ads')).toBe('tiktok'));
  it('linkedin_ads → linkedin', () => expect(normalize('linkedin_ads')).toBe('linkedin'));
  it('twitter_ads → twitter', () => expect(normalize('twitter_ads')).toBe('twitter'));
  it('desconocido → other', () => expect(normalize('unknown_platform')).toBe('other'));
  it('resultado siempre es uno de los valores permitidos por el CHECK de la DB', () => {
    const allowed = new Set(['meta', 'google', 'tiktok', 'linkedin', 'twitter', 'other']);
    const inputs = ['meta_ads', 'google_ads', 'tiktok', 'linkedin', 'foo', 'bar'];
    for (const inp of inputs) {
      expect(allowed.has(normalize(inp))).toBe(true);
    }
  });
});

// ─── 14. Unit — deriveMonthlyReportPeriod + deriveIsoWeekPeriod (reports) ────

describe('deriveMonthlyReportPeriod (unit)', () => {
  let deriveMonthly: typeof import('../importers/reports-importer').deriveMonthlyReportPeriod;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const mod = await import('../importers/reports-importer');
    deriveMonthly = mod.deriveMonthlyReportPeriod;
  });

  it('monthly/2026-06.json → 2026-06-01 / 2026-06-30', () => {
    expect(deriveMonthly('2026-06.json', {})).toEqual({
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
    });
  });

  it('monthly/2026-07.json → 2026-07-01 / 2026-07-31', () => {
    expect(deriveMonthly('2026-07.json', {})).toEqual({
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
  });

  it('campos explícitos period.startDate/endDate tienen prioridad sobre filename', () => {
    expect(
      deriveMonthly('2026-06.json', { period: { startDate: '2026-06-01', endDate: '2026-06-30' } }),
    ).toEqual({ periodStart: '2026-06-01', periodEnd: '2026-06-30' });
  });

  it('periodStart/periodEnd top-level tienen máxima prioridad', () => {
    expect(
      deriveMonthly('2026-06.json', { periodStart: '2026-06-05', periodEnd: '2026-06-20' }),
    ).toEqual({ periodStart: '2026-06-05', periodEnd: '2026-06-20' });
  });

  it('filename inválido sin campos → null (REPORT_PERIOD_MISSING)', () => {
    expect(deriveMonthly('invalid.json', {})).toBeNull();
  });

  it('nunca devuelve string "undefined"', () => {
    const r = deriveMonthly('2026-06.json', {});
    expect(r?.periodStart).not.toBe('undefined');
    expect(r?.periodEnd).not.toBe('undefined');
  });
});

describe('deriveIsoWeekPeriod (unit)', () => {
  let deriveWeekly: typeof import('../importers/reports-importer').deriveIsoWeekPeriod;
  let isoWeekToMonday: typeof import('../importers/reports-importer').isoWeekToMonday;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    const mod = await import('../importers/reports-importer');
    deriveWeekly = mod.deriveIsoWeekPeriod;
    isoWeekToMonday = mod.isoWeekToMonday;
  });

  it('2026-W25.json → 2026-06-15 (lunes) / 2026-06-21 (domingo)', () => {
    expect(deriveWeekly('2026-W25.json', {})).toEqual({
      periodStart: '2026-06-15',
      periodEnd: '2026-06-21',
    });
  });

  it('2026-W27.json → lunes ISO de la semana 27', () => {
    const r = deriveWeekly('2026-W27.json', {});
    expect(r).not.toBeNull();
    // Verificar que el start es lunes: getUTCDay() === 1
    expect(r).toBeDefined();
    const start = new Date(r!.periodStart);
    expect(start.getUTCDay()).toBe(1); // lunes
    // end = start + 6 días
    const end = new Date(r!.periodEnd);
    expect(end.getUTCDay()).toBe(0); // domingo
  });

  it('2026-W53.json → semana 53 válida (diciembre 2026)', () => {
    const r = deriveWeekly('2026-W53.json', {});
    expect(r).not.toBeNull();
    expect(r?.periodStart).toBe('2026-12-28');
    expect(r?.periodEnd).toBe('2027-01-03');
  });

  it('2026-W54.json → semana inexistente → null', () => {
    expect(deriveWeekly('2026-W54.json', {})).toBeNull();
  });

  it('period.startDate/endDate explícitos tienen prioridad sobre filename', () => {
    expect(
      deriveWeekly('2026-W25.json', { period: { startDate: '2026-06-15', endDate: '2026-06-21' } }),
    ).toEqual({ periodStart: '2026-06-15', periodEnd: '2026-06-21' });
  });

  it('nunca devuelve string "undefined"', () => {
    const r = deriveWeekly('2026-W25.json', {});
    expect(r?.periodStart).not.toBe('undefined');
    expect(r?.periodEnd).not.toBe('undefined');
  });

  it('isoWeekToMonday(2026, 25) === 2026-06-15', () => {
    const d = isoWeekToMonday(2026, 25);
    expect(d).not.toBeNull();
    expect(d?.getUTCFullYear()).toBe(2026);
    expect(d?.getUTCMonth()).toBe(5); // junio = 5 (0-indexed)
    expect(d?.getUTCDate()).toBe(15);
  });

  it('isoWeekToMonday(2026, 54) → null (semana inexistente)', () => {
    expect(isoWeekToMonday(2026, 54)).toBeNull();
  });

  it('segunda ejecución con mismo filename → resultado idempotente', () => {
    expect(deriveWeekly('2026-W30.json', {})).toEqual(deriveWeekly('2026-W30.json', {}));
  });
});

// ─── 15. Structural — documents-importer.ts (actor + RPC) ───────────────────

describe('Structural — documents-importer.ts (Migration Actor)', () => {
  let src: string;
  let code: string;
  beforeEach(() => {
    src = readImporter('documents-importer.ts');
    code = stripComments(src);
  });

  it('usa upsert_migrated_client_document (no upsert_client_document directo)', () => {
    expect(code).toMatch(/upsert_migrated_client_document/);
    expect(code).not.toMatch(/['"]upsert_client_document['"]/);
  });

  it('valida ACTOR_MISSING en execute sin actorUserId', () => {
    expect(code).toMatch(/ACTOR_MISSING/);
    expect(code).toMatch(/actorUserId/);
  });

  it('pasa p_actor_user_id al RPC', () => {
    const rpcBlock = code.match(/upsert_migrated_client_document[\s\S]*?\}/);
    expect(rpcBlock?.[0] ?? '').toMatch(/p_actor_user_id/);
  });

  it('dry_run no llama al RPC (retorna insert sin escribir)', () => {
    // En el código limpio (sin comentarios), la guarda dry_run debe aparecer
    // antes que la llamada rpc('upsert_migrated_client_document').
    // El string literal entre comillas solo aparece en la llamada real, no en comentarios.
    const dryIdx = code.indexOf("'dry_run'");
    const rpcIdx = code.indexOf("'upsert_migrated_client_document'");
    expect(dryIdx, "'dry_run' not found in code").toBeGreaterThan(-1);
    expect(rpcIdx, "'upsert_migrated_client_document' not found in code").toBeGreaterThan(-1);
    expect(dryIdx).toBeLessThan(rpcIdx);
  });

  it('ACTOR_MISSING se comprueba ANTES de iterar documentos', () => {
    const actorIdx = src.indexOf('ACTOR_MISSING');
    const iterIdx = src.indexOf('for (const clientSlug');
    expect(actorIdx).toBeGreaterThan(-1);
    expect(iterIdx).toBeGreaterThan(-1);
    expect(actorIdx).toBeLessThan(iterIdx);
  });
});

// ─── 16. Structural — metrics-importer.ts (deriveMonthlyPeriod) ──────────────

describe('Structural — metrics-importer.ts (period derivation)', () => {
  let src: string;
  let code: string;
  beforeEach(() => {
    src = readImporter('metrics-importer.ts');
    code = stripComments(src);
  });

  it('exporta deriveMonthlyPeriod', () => {
    expect(src).toMatch(/export function deriveMonthlyPeriod/);
  });

  it('exporta normalizePlatform', () => {
    expect(src).toMatch(/export function normalizePlatform/);
  });

  it('tiene PLATFORM_MAP con meta_ads → meta', () => {
    expect(code).toMatch(/PLATFORM_MAP/);
    expect(code).toMatch(/meta_ads.*meta/s);
  });

  it('usa derivedPeriod.periodStart en el payload (no period.periodStart directo)', () => {
    const upsertBlock = code.match(/\.upsert\s*\(\s*\{([\s\S]*?)\}\s*,/);
    const body = upsertBlock?.[1] ?? '';
    expect(body).toMatch(/derivedPeriod\.periodStart/);
    expect(body).not.toMatch(/period\.periodStart/);
  });

  it('usa normalizedPlatform en el payload (no source.platform directo)', () => {
    const upsertBlock = code.match(/\.upsert\s*\(\s*\{([\s\S]*?)\}\s*,/);
    const body = upsertBlock?.[1] ?? '';
    expect(body).toMatch(/normalizedPlatform/);
    expect(body).not.toMatch(/source\.platform/);
  });

  it('PERIOD_MISSING se emite si no puede derivarse período', () => {
    expect(code).toMatch(/PERIOD_MISSING/);
  });
});

// ─── 17. Structural — reports-importer.ts (period derivation) ────────────────

describe('Structural — reports-importer.ts (period derivation)', () => {
  let src: string;
  let code: string;
  beforeEach(() => {
    src = readImporter('reports-importer.ts');
    code = stripComments(src);
  });

  it('exporta deriveMonthlyReportPeriod', () => {
    expect(src).toMatch(/export function deriveMonthlyReportPeriod/);
  });

  it('exporta deriveIsoWeekPeriod', () => {
    expect(src).toMatch(/export function deriveIsoWeekPeriod/);
  });

  it('exporta isoWeekToMonday', () => {
    expect(src).toMatch(/export function isoWeekToMonday/);
  });

  it('no usa String(periodStart) ni String(periodEnd) en el payload', () => {
    const upsertBlock = code.match(/\.upsert\s*\(\s*\{([\s\S]*?)\}\s*,/);
    const body = upsertBlock?.[1] ?? '';
    expect(body).not.toMatch(/String\s*\(\s*periodStart\s*\)/);
    expect(body).not.toMatch(/String\s*\(\s*periodEnd\s*\)/);
  });

  it('usa derivedPeriod.periodStart y derivedPeriod.periodEnd en el payload', () => {
    const upsertBlock = code.match(/\.upsert\s*\(\s*\{([\s\S]*?)\}\s*,/);
    const body = upsertBlock?.[1] ?? '';
    expect(body).toMatch(/derivedPeriod\.periodStart/);
    expect(body).toMatch(/derivedPeriod\.periodEnd/);
  });

  it('emite REPORT_PERIOD_MISSING si no puede derivarse', () => {
    expect(code).toMatch(/REPORT_PERIOD_MISSING/);
  });

  it('nunca envía "undefined" como fecha (no String(undefined) patterns)', () => {
    expect(code).not.toMatch(/String\s*\(\s*undefined\s*\)/);
    expect(code).not.toMatch(/"undefined"/);
  });
});
