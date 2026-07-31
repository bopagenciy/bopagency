/**
 * Phase 4 — Central client resolver
 *
 * Resolves a client slug against the in-memory MigrationContext built by
 * ClientsImporter. Dependent importers (documents, metrics, reports,
 * automations) call this instead of hitting the DB.
 *
 * Resolution order:
 *   1. In projectedClients AND existsInDatabase → "existing" (real DB UUID)
 *   2. In projectedClients AND !existsInDatabase → "projected" (ephemeral UUID)
 *   3. In excludedSlugs → "excluded" (skip silently)
 *   4. Not found anywhere → "missing" (log warning)
 */

import type { ClientResolution, MigrationContext } from '../types';

/**
 * Resolve a client slug within the current migration run.
 *
 * @param slug  - The client slug to resolve (e.g. "legalink-col")
 * @param ctx   - The shared MigrationContext built by the runner
 * @returns A ClientResolution discriminated union
 */
export function resolveMigrationClient(slug: string, ctx: MigrationContext): ClientResolution {
  const projected = ctx.projectedClients.get(slug);

  if (projected !== undefined) {
    if (projected.existsInDatabase) {
      // Client exists in DB — use the real UUID
      return {
        kind: 'existing',
        clientId: projected.realId ?? projected.projectedId,
        slug,
      };
    }
    // Client will be inserted in execute mode; in dry_run use the ephemeral UUID
    return { kind: 'projected', clientId: projected.projectedId, slug };
  }

  if (ctx.excludedSlugs.has(slug)) {
    return { kind: 'excluded', slug };
  }

  return { kind: 'missing', slug };
}
