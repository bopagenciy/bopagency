/**
 * Phase 4 — PostgREST error extraction helper
 *
 * Provides a type-safe way to extract structured error fields from Supabase
 * (PostgREST) errors without importing the full @supabase/supabase-js types.
 *
 * All fields are sanitized (truncated) before being stored. This module MUST
 * NOT log, print, or return raw secret values.
 */

/** Minimal shape of a PostgREST error as returned by Supabase query builders. */
export interface PostgrestLike {
  message: string;
  /** PostgreSQL error code, e.g. "23505" for unique_violation */
  code?: string;
  /** Human-readable detail, may contain row values — always truncate */
  details?: string;
  /** PostgreSQL hint text */
  hint?: string;
}

/** Maximum length for sanitized text fields written to output files. */
const MAX_DETAIL_LEN = 200;
const MAX_HINT_LEN = 200;

/**
 * Extract sanitized Supabase/PostgREST extra fields from an error.
 * Returns null-safe values ready for MigrationRecord or report output.
 */
export function extractPostgrestExtra(e: PostgrestLike): {
  supabaseCode: string | null;
  supabaseDetails: string | null;
  supabaseHint: string | null;
} {
  return {
    supabaseCode: e.code ? e.code.slice(0, 20) : null,
    supabaseDetails: e.details ? e.details.slice(0, MAX_DETAIL_LEN) : null,
    supabaseHint: e.hint ? e.hint.slice(0, MAX_HINT_LEN) : null,
  };
}
