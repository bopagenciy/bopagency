/**
 * Phase 4 Migration — Configuration loader
 *
 * SECURITY:
 * - SUPABASE_SERVICE_ROLE_KEY is read ONCE here and never logged.
 * - MIGRATION_ORGANIZATION_ID must be a valid UUID v4.
 * - Script aborts immediately on any missing/invalid config.
 */

import * as path from 'path';
import type { MigrationConfig, MigrationMode } from './types';

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
  verbose: boolean;
  clients: string[];
  limit: number | null;
}): MigrationConfig {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  // Read key but never log it
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const organizationId = overrides.organizationId ?? requireEnv('MIGRATION_ORGANIZATION_ID');

  validateUuid(organizationId, 'MIGRATION_ORGANIZATION_ID');

  // Derive project root: scripts/migrations/phase-4 → ../../.. → project root
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const dataRoot = projectRoot; // .agencia-ai/ and shared-data/ are at project root

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    organizationId,
    projectRoot,
    dataRoot,
    mode: overrides.mode,
    verbose: overrides.verbose,
    clients: overrides.clients,
    limit: overrides.limit,
  };
}
