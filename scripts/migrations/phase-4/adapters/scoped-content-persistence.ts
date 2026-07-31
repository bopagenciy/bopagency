/**
 * Phase 4 — Scoped Content Persistence Helper
 *
 * Reutilizable para agents, skills y templates (organization-scoped, is_global=false).
 * Implementa el flujo insert/update/skip sin usar .upsert() ni onConflict.
 *
 * Algoritmo:
 *  1. SELECT por organization_id + slug + is_global=false (array, no maybeSingle)
 *  2. Múltiples filas        → conflict/manual-review
 *  3. No existe              → insert (dry_run: sin escritura)
 *  4. Existe, mismo hash     → skip-preexisting
 *  5. Existe, hash diferente → update por id (dry_run: sin escritura)
 *
 * Campos protegidos — NUNCA en UPDATE:
 *   id, organization_id, slug, created_at, legacy_path
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractPostgrestExtra } from './postgrest-error';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScopedTable = 'agents' | 'skills' | 'templates';

export type PersistScopedResult =
  | { action: 'insert'; targetId: string | null }
  | { action: 'update'; targetId: string }
  | { action: 'skip-preexisting'; targetId: string }
  | { action: 'conflict'; message: string }
  | {
      action: 'error';
      errorCode: string;
      errorMessage: string;
      supabaseCode?: string | null;
      supabaseDetails?: string | null;
      supabaseHint?: string | null;
    };

export interface PersistScopedOptions {
  client: SupabaseClient;
  table: ScopedTable;
  organizationId: string;
  slug: string;
  sourceHash: string;
  /**
   * Payload para INSERT.
   * Debe incluir: organization_id, slug, is_global=false, legacy_path, etc.
   */
  insertPayload: Record<string, unknown>;
  /**
   * Payload para UPDATE.
   * NO debe incluir: id, organization_id, slug, created_at, legacy_path.
   */
  updatePayload: Record<string, unknown>;
  mode: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Persiste una entidad scoped (agent/skill/template) usando flujo manual.
 * Nunca usa .upsert() ni onConflict.
 */
export async function persistScopedContentEntity(
  opts: PersistScopedOptions,
): Promise<PersistScopedResult> {
  const { client, table, organizationId, slug, sourceHash, insertPayload, updatePayload, mode } =
    opts;

  // 1. Buscar por clave natural en la tabla destino
  const { data, error: selectError } = await client
    .from(table)
    .select('id, source_hash')
    .eq('organization_id', organizationId)
    .eq('slug', slug)
    .eq('is_global', false);

  if (selectError) {
    return {
      action: 'error',
      errorCode: 'SELECT_FAILED',
      errorMessage: selectError.message,
      ...extractPostgrestExtra(selectError),
    };
  }

  const rows = (data ?? []) as Array<{ id: string; source_hash: string | null }>;

  // 2. Múltiples filas → conflict/manual-review
  if (rows.length > 1) {
    return {
      action: 'conflict',
      message: `Multiple rows found in ${table} for org=${organizationId} slug=${slug} is_global=false`,
    };
  }

  // 3. No existe → insert
  if (rows.length === 0) {
    if (mode === 'dry_run') {
      return { action: 'insert', targetId: null };
    }

    const { data: inserted, error: insertError } = await client
      .from(table)
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError) {
      return {
        action: 'error',
        errorCode: 'INSERT_FAILED',
        errorMessage: insertError.message,
        ...extractPostgrestExtra(insertError),
      };
    }

    return { action: 'insert', targetId: (inserted as { id: string }).id };
  }

  // 4. Existe exactamente uno
  const existing = rows[0];
  if (existing === undefined) {
    // Defensive: no debería ocurrir dado que rows.length === 1
    return {
      action: 'error',
      errorCode: 'UNEXPECTED_EMPTY_ROW',
      errorMessage: 'Unexpected: rows array has length 1 but rows[0] is undefined',
    };
  }

  if (existing.source_hash === sourceHash) {
    return { action: 'skip-preexisting', targetId: existing.id };
  }

  // 5. Hash diferente → update
  if (mode === 'dry_run') {
    return { action: 'update', targetId: existing.id };
  }

  const { error: updateError } = await client
    .from(table)
    .update(updatePayload)
    .eq('id', existing.id);

  if (updateError) {
    return {
      action: 'error',
      errorCode: 'UPDATE_FAILED',
      errorMessage: updateError.message,
      ...extractPostgrestExtra(updateError),
    };
  }

  return { action: 'update', targetId: existing.id };
}
