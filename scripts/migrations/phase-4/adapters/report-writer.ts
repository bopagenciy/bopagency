/**
 * Phase 4 Migration — Report Writer
 *
 * Writes run summary and individual error records to disk.
 *
 * File naming:
 *   Historical (never overwritten): phase-4-{mode}-{runId}-summary.json
 *                                   phase-4-{mode}-{runId}-errors.json
 *   Latest (always replaced):       phase-4-{mode}-latest-summary.json
 *                                   phase-4-{mode}-latest-errors.json
 *
 * Security:
 *   - Absolute paths are stripped (replaced with repo-relative paths)
 *   - No secrets are written (source data already scanned upstream)
 *   - Supabase error details truncated at ingestion (postgrest-error.ts)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MigrationRecord, MigrationMode, RunSummary } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SanitizedRunError {
  runId: string;
  entityType: string;
  sourceKey: string;
  /** Relative path (never absolute) */
  sourcePath: string;
  errorCode: string | null;
  errorMessage: string | null;
  targetTable: string;
  operation: string;
  timestamp: string;
  supabaseCode?: string | null;
  supabaseDetails?: string | null;
  supabaseHint?: string | null;
}

export interface ReportFilenames {
  summaryLatest: string;
  summaryHistorical: string;
  errorsLatest: string;
  errorsHistorical: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ERROR_CODE_TO_OPERATION: Record<string, string> = {
  INSERT_FAILED: 'insert',
  UPDATE_FAILED: 'update',
  UPSERT_FAILED: 'upsert',
  RPC_ERROR: 'rpc',
  IMPORT_ERROR: 'import',
  SOURCE_NOT_FOUND: 'read',
  READ_ERROR: 'read',
  PATH_BLOCKED: 'read',
  QUARANTINE: 'read',
  SECRET_DETECTED: 'scan',
};

function deriveOperation(errorCode: string | null): string {
  if (!errorCode) return 'unknown';
  return ERROR_CODE_TO_OPERATION[errorCode] ?? 'unknown';
}

/**
 * Make a path relative to repositoryRoot.
 * If the sourcePath is already relative (no drive letter / leading slash), return as-is.
 */
function sanitizePath(sourcePath: string, repositoryRoot: string): string {
  // Already relative
  if (!path.isAbsolute(sourcePath)) return sourcePath;
  // Strip repositoryRoot prefix
  const rel = path.relative(repositoryRoot, sourcePath);
  // If it still escapes (e.g. on different drive), return basename only
  if (rel.startsWith('..')) return path.basename(sourcePath);
  // Normalise to posix separators for cross-platform consistency
  return rel.split(path.sep).join('/');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Build the four output filenames for a given mode + runId. */
export function buildReportFilenames(mode: MigrationMode, runId: string): ReportFilenames {
  const modeSlug = mode === 'dry_run' ? 'dry-run' : 'execute';
  return {
    summaryLatest: `phase-4-${modeSlug}-latest-summary.json`,
    summaryHistorical: `phase-4-${modeSlug}-${runId}-summary.json`,
    errorsLatest: `phase-4-${modeSlug}-latest-errors.json`,
    errorsHistorical: `phase-4-${modeSlug}-${runId}-errors.json`,
  };
}

/** Convert a MigrationRecord (error/conflict action) to a sanitized output record. */
export function sanitizeErrorRecord(
  record: MigrationRecord,
  repositoryRoot: string,
  timestamp: string,
): SanitizedRunError {
  const out: SanitizedRunError = {
    runId: record.runId,
    entityType: record.entityType,
    sourceKey: record.sourceKey,
    sourcePath: sanitizePath(record.sourcePath, repositoryRoot),
    errorCode: record.errorCode,
    errorMessage: record.errorMessage ? record.errorMessage.slice(0, 300) : null,
    targetTable: record.targetTable,
    operation: deriveOperation(record.errorCode),
    timestamp,
  };

  // Include Supabase extra fields only when present
  if (record.supabaseCode !== undefined) out.supabaseCode = record.supabaseCode;
  if (record.supabaseDetails !== undefined) out.supabaseDetails = record.supabaseDetails;
  if (record.supabaseHint !== undefined) out.supabaseHint = record.supabaseHint;

  return out;
}

/**
 * Write historical + latest report files to outputDir.
 *
 * Historical files are written with `wx` (exclusive create) — they are NEVER
 * overwritten. If a file with the same name exists (extremely unlikely due to
 * UUID runId), the write is silently skipped and the latest copy is still updated.
 */
export function writeRunReport(
  outputDir: string,
  summary: RunSummary,
  repositoryRoot: string,
): void {
  fs.mkdirSync(outputDir, { recursive: true });

  const names = buildReportFilenames(summary.mode, summary.runId);
  const timestamp = summary.completedAt ?? new Date().toISOString();

  // ── Summary payload (no secrets: counts, IDs, timestamps only) ──────────────
  const summaryPayload = {
    runId: summary.runId,
    mode: summary.mode,
    status: summary.status,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    importers: summary.importers,
    totals: summary.totals,
  };
  const summaryJson = JSON.stringify(summaryPayload, null, 2);

  // ── Error records (sanitized, individual) ───────────────────────────────────
  const sanitizedErrors: SanitizedRunError[] = summary.errorRecords.map((r) =>
    sanitizeErrorRecord(r, repositoryRoot, timestamp),
  );
  const errorsJson = JSON.stringify(sanitizedErrors, null, 2);

  // ── Historical (write-once, `wx` flag) ──────────────────────────────────────
  const historicalSummaryPath = path.join(outputDir, names.summaryHistorical);
  const historicalErrorsPath = path.join(outputDir, names.errorsHistorical);

  try {
    fs.writeFileSync(historicalSummaryPath, summaryJson, { encoding: 'utf-8', flag: 'wx' });
  } catch (err: unknown) {
    // EEXIST means the file already exists — skip silently (no-overwrite guarantee)
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') throw err;
  }

  try {
    fs.writeFileSync(historicalErrorsPath, errorsJson, { encoding: 'utf-8', flag: 'wx' });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') throw err;
  }

  // ── Latest (always overwrite) ────────────────────────────────────────────────
  fs.writeFileSync(path.join(outputDir, names.summaryLatest), summaryJson, 'utf-8');
  fs.writeFileSync(path.join(outputDir, names.errorsLatest), errorsJson, 'utf-8');
}
