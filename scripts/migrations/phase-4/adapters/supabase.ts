/**
 * Phase 4 Migration — Supabase client adapter
 *
 * SECURITY:
 * - Uses service_role key (never logged, never exposed to browser).
 * - All DB operations go through this single client.
 * - Client is created ONCE per migration run.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MigrationConfig } from '../types';

let _client: SupabaseClient | null = null;

export function getSupabaseClient(config: MigrationConfig): SupabaseClient {
  if (_client !== null) return _client;

  _client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}

export async function verifyConnection(
  config: MigrationConfig,
): Promise<{ organizationId: string; organizationName: string }> {
  const client = getSupabaseClient(config);

  const { data, error } = await client
    .from('organizations')
    .select('id, name, deleted_at')
    .eq('id', config.organizationId)
    .single();

  if (error) {
    throw new Error(`[SUPABASE] No se pudo verificar la organización: ${error.message}`);
  }

  if (!data) {
    throw new Error(`[SUPABASE] Organización no encontrada: ${config.organizationId}`);
  }

  const org = data as { id: string; name: string; deleted_at: string | null };

  if (org.deleted_at !== null) {
    throw new Error(
      `[SUPABASE] La organización está eliminada (soft delete): ${config.organizationId}`,
    );
  }

  return { organizationId: org.id, organizationName: org.name };
}
