/**
 * Phase 4 Migration — Configuration loader
 *
 * SECURITY:
 * - SUPABASE_SERVICE_ROLE_KEY is read ONCE here and never logged.
 * - MIGRATION_ORGANIZATION_ID must be a valid UUID v4.
 * - Script aborts immediately on any missing/invalid config.
 */

import type { MigrationConfig, MigrationMode } from './types';
import { resolveRepositoryRoot } from './adapters/repository-root';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`[CONFIG] Variable de entorno requerida ausente o vacía: ${name}`);
  }
  return value.trim();
}

function validateUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`[CONFIG] ${label} no es un UUID v4 válido: ${value}`);
  }
}

export function loadConfig(overrides: {
  mode: MigrationMode;
  organizationId?: string;
  actorUserId?: string;
  verbose: boolean;
  clients: string[];
  limit: number | null;
  repositoryRoot?: string;
}): MigrationConfig {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  // Read key but never log it
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const organizationId = overrides.organizationId ?? requireEnv('MIGRATION_ORGANIZATION_ID');

  validateUuid(organizationId, 'MIGRATION_ORGANIZATION_ID');

  // actorUserId: CLI arg > env var > undefined
  // Obligatorio solo en execute — la validación se realiza en los importers
  // que lo necesitan (clients-importer) para dar mensajes de error específicos.
  const rawActorUserId =
    overrides.actorUserId ?? process.env['MIGRATION_ACTOR_USER_ID']?.trim() ?? undefined;

  let actorUserId: string | undefined;
  if (rawActorUserId && rawActorUserId !== '') {
    validateUuid(rawActorUserId, 'MIGRATION_ACTOR_USER_ID');
    actorUserId = rawActorUserId;
  }

  // Resolve repository root robustly — walks upward from this file's location,
  // verifying shared-data/, .agencia-ai/, scripts/migrations/phase-4/ all exist.
  // Override via --repository-root CLI arg if provided.
  const repositoryRoot = resolveRepositoryRoot(overrides.repositoryRoot);

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    organizationId,
    actorUserId,
    repositoryRoot,
    // Keep projectRoot/dataRoot pointing at the same location for importer compatibility
    projectRoot: repositoryRoot,
    dataRoot: repositoryRoot,
    mode: overrides.mode,
    verbose: overrides.verbose,
    clients: overrides.clients,
    limit: overrides.limit,
  };
}
