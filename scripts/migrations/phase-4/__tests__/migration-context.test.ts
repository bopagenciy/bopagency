/**
 * Phase 4 — MigrationContext and client-resolver tests
 *
 * Covers:
 *   1. resolveMigrationClient() — all 4 kinds (existing, projected, excluded, missing)
 *   2. MigrationContext population via helper
 *   3. dry_run flag: projected clients exist, no real IDs
 *   4. execute flag: projected clients carry real IDs
 *   5. Empty excludedSlugs / projectedClients
 *   6. Multiple clients coexist
 *   7. Conflict: slug in both projectedClients AND excludedSlugs → projectedClients wins
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveMigrationClient } from '../adapters/client-resolver';
import type { MigrationContext, ProjectedClient } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<MigrationContext> = {}): MigrationContext {
  return {
    mode: 'dry_run',
    organizationId: 'org-uuid-001',
    runId: 'run-uuid-001',
    repositoryRoot: '/fake/repo',
    projectedClients: new Map(),
    excludedSlugs: new Set(),
    ...overrides,
  };
}

function makeProjectedClient(overrides: Partial<ProjectedClient> = {}): ProjectedClient {
  return {
    projectedId: 'proj-uuid-001',
    realId: null,
    organizationId: 'org-uuid-001',
    slug: 'legalink-col',
    name: 'LegaLink Colombia',
    action: 'insert',
    sourceHash: 'hash-abc123',
    existsInDatabase: false,
    ...overrides,
  };
}

// ── resolveMigrationClient ─────────────────────────────────────────────────────

describe('resolveMigrationClient()', () => {
  let ctx: MigrationContext;

  beforeEach(() => {
    ctx = makeContext();
  });

  it('returns kind=missing when context is empty', () => {
    const result = resolveMigrationClient('legalink-col', ctx);
    expect(result.kind).toBe('missing');
    expect(result.slug).toBe('legalink-col');
  });

  it('returns kind=excluded when slug is in excludedSlugs', () => {
    ctx.excludedSlugs.add('_template-client');
    const result = resolveMigrationClient('_template-client', ctx);
    expect(result.kind).toBe('excluded');
    expect(result.slug).toBe('_template-client');
  });

  it('returns kind=projected for new client (existsInDatabase=false)', () => {
    const pc = makeProjectedClient({ existsInDatabase: false, realId: null });
    ctx.projectedClients.set('legalink-col', pc);

    const result = resolveMigrationClient('legalink-col', ctx);
    expect(result.kind).toBe('projected');
    if (result.kind === 'projected') {
      expect(result.clientId).toBe(pc.projectedId);
      expect(result.slug).toBe('legalink-col');
    }
  });

  it('returns kind=existing for client already in DB (existsInDatabase=true)', () => {
    const pc = makeProjectedClient({
      existsInDatabase: true,
      realId: 'real-db-uuid-legalink',
      projectedId: 'real-db-uuid-legalink',
    });
    ctx.projectedClients.set('legalink-col', pc);

    const result = resolveMigrationClient('legalink-col', ctx);
    expect(result.kind).toBe('existing');
    if (result.kind === 'existing') {
      expect(result.clientId).toBe('real-db-uuid-legalink');
    }
  });

  it('uses projectedId as fallback when realId is null but existsInDatabase=true', () => {
    // Edge case: unlikely, but resolver must not throw
    const pc = makeProjectedClient({
      existsInDatabase: true,
      realId: null,
      projectedId: 'fallback-proj-uuid',
    });
    ctx.projectedClients.set('legalink-col', pc);

    const result = resolveMigrationClient('legalink-col', ctx);
    expect(result.kind).toBe('existing');
    if (result.kind === 'existing') {
      expect(result.clientId).toBe('fallback-proj-uuid');
    }
  });

  it('projectedClients takes precedence over excludedSlugs', () => {
    // Slug is in both — projected wins
    const pc = makeProjectedClient({ existsInDatabase: false });
    ctx.projectedClients.set('legalink-col', pc);
    ctx.excludedSlugs.add('legalink-col');

    const result = resolveMigrationClient('legalink-col', ctx);
    expect(result.kind).toBe('projected');
  });

  it('handles multiple clients independently', () => {
    const pcA = makeProjectedClient({
      slug: 'legalink-col',
      projectedId: 'proj-legalink',
      existsInDatabase: false,
    });
    const pcB = makeProjectedClient({
      slug: 'magic-bungalow',
      projectedId: 'proj-magic',
      existsInDatabase: false,
    });
    ctx.projectedClients.set('legalink-col', pcA);
    ctx.projectedClients.set('magic-bungalow', pcB);
    ctx.excludedSlugs.add('_template-client');

    expect(resolveMigrationClient('legalink-col', ctx).kind).toBe('projected');
    expect(resolveMigrationClient('magic-bungalow', ctx).kind).toBe('projected');
    expect(resolveMigrationClient('_template-client', ctx).kind).toBe('excluded');
    expect(resolveMigrationClient('bop-soluciones', ctx).kind).toBe('missing');
  });
});

// ── MigrationContext population ───────────────────────────────────────────────

describe('MigrationContext population', () => {
  it('starts with empty projectedClients and excludedSlugs', () => {
    const ctx = makeContext();
    expect(ctx.projectedClients.size).toBe(0);
    expect(ctx.excludedSlugs.size).toBe(0);
  });

  it('accepts ProjectedClient with action=insert and existsInDatabase=false', () => {
    const ctx = makeContext({ mode: 'dry_run' });
    const pc: ProjectedClient = {
      projectedId: 'new-uuid-001',
      realId: null,
      organizationId: 'org-uuid-001',
      slug: 'legalink-col',
      name: 'LegaLink',
      action: 'insert',
      sourceHash: 'h1',
      existsInDatabase: false,
    };
    ctx.projectedClients.set('legalink-col', pc);

    const stored = ctx.projectedClients.get('legalink-col');
    expect(stored).toBeDefined();
    expect(stored?.existsInDatabase).toBe(false);
    expect(stored?.realId).toBeNull();
    expect(stored?.projectedId).toBe('new-uuid-001');
  });

  it('accepts ProjectedClient with action=update and existsInDatabase=true', () => {
    const ctx = makeContext({ mode: 'execute' });
    const pc: ProjectedClient = {
      projectedId: 'existing-db-uuid',
      realId: 'existing-db-uuid',
      organizationId: 'org-uuid-001',
      slug: 'magic-bungalow',
      name: 'Magic Bungalow',
      action: 'update',
      sourceHash: 'h2',
      existsInDatabase: true,
    };
    ctx.projectedClients.set('magic-bungalow', pc);

    const result = resolveMigrationClient('magic-bungalow', ctx);
    expect(result.kind).toBe('existing');
    if (result.kind === 'existing') {
      expect(result.clientId).toBe('existing-db-uuid');
    }
  });

  it('resolves as missing for unknown slug not in context', () => {
    const ctx = makeContext();
    ctx.projectedClients.set('legalink-col', makeProjectedClient());
    // 'unknown-client' was never added
    const result = resolveMigrationClient('unknown-client', ctx);
    expect(result.kind).toBe('missing');
  });
});
