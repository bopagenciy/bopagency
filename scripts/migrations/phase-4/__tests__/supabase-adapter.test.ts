/**
 * Phase 4 — supabase adapter unit tests
 *
 * These tests verify verifyConnection() behaviour without a real DB:
 *  1. Existing org   → returns organizationId and organizationName
 *  2. Missing org    → throws (maybeSingle returns null)
 *  3. Supabase error → throws with the error message
 *  4. No deleted_at  → adapter source never references it
 *  5. Dry-run safety → no INSERT/UPDATE calls are made
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a minimal MigrationConfig stub. */
function makeConfig(organizationId = '00000000-0000-0000-0000-000000000001') {
  return {
    organizationId,
    supabaseUrl: 'https://fake.supabase.co',
    supabaseServiceRoleKey: 'fake-key',
    mode: 'dry_run' as const,
    verbose: false,
    clients: [],
    limit: null,
    projectRoot: '/tmp',
  };
}

/** Build a chainable Supabase query-builder mock. */
function makeQueryMock(result: { data: unknown; error: unknown }) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
  return chain;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('verifyConnection()', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns organizationId and organizationName when org exists', async () => {
    const orgRow = { id: '00000000-0000-0000-0000-000000000001', name: 'Bop Agency', slug: 'bop' };
    const mock = makeQueryMock({ data: orgRow, error: null });

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mock,
    }));

    const { verifyConnection } = await import('../adapters/supabase');
    const result = await verifyConnection(makeConfig());

    expect(result.organizationId).toBe(orgRow.id);
    expect(result.organizationName).toBe(orgRow.name);
  });

  it('throws when maybeSingle returns null (org not found)', async () => {
    const mock = makeQueryMock({ data: null, error: null });

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mock,
    }));

    const { verifyConnection } = await import('../adapters/supabase');

    await expect(verifyConnection(makeConfig('nonexistent-id'))).rejects.toThrow(
      /organización no encontrada/i,
    );
  });

  it('throws when Supabase returns an error', async () => {
    const mock = makeQueryMock({ data: null, error: { message: 'connection refused' } });

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mock,
    }));

    const { verifyConnection } = await import('../adapters/supabase');

    await expect(verifyConnection(makeConfig())).rejects.toThrow(/connection refused/i);
  });

  it('adapter source does not reference deleted_at on organizations', () => {
    const adapterPath = path.resolve(__dirname, '..', 'adapters', 'supabase.ts');
    const source = fs.readFileSync(adapterPath, 'utf-8');

    // Must NOT select or compare deleted_at
    expect(source).not.toMatch(/deleted_at/);
    // Must NOT use .single() (which errors on no rows)
    expect(source).not.toMatch(/\.single\(\)/);
    // Must use maybeSingle()
    expect(source).toMatch(/\.maybeSingle\(\)/);
  });

  it('dry-run: maybeSingle is called but no INSERT or UPDATE is issued', async () => {
    const orgRow = { id: '00000000-0000-0000-0000-000000000002', name: 'Test Org', slug: 'test' };
    const mock = makeQueryMock({ data: orgRow, error: null });

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mock,
    }));

    const { verifyConnection } = await import('../adapters/supabase');
    await verifyConnection(makeConfig('00000000-0000-0000-0000-000000000002'));

    expect(mock.maybeSingle).toHaveBeenCalledOnce();
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
});
