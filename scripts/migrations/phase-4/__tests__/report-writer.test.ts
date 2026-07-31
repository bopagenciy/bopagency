/**
 * Phase 4 — Report Writer tests
 *
 * Covers:
 *   1. execute mode → phase-4-execute-* filenames
 *   2. dry_run mode → phase-4-dry-run-* filenames
 *   3. Historical files are NEVER overwritten (wx flag)
 *   4. Individual error records are preserved (not aggregated)
 *   5. Absolute paths are stripped (no secrets / absolute paths in output)
 *   6. Partial run is NOT marked completed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildReportFilenames,
  sanitizeErrorRecord,
  writeRunReport,
} from '../adapters/report-writer';
import type { MigrationRecord, RunSummary } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const RUN_ID = '00000000-0000-0000-0000-000000000001';
const ORG_ID = 'org-uuid-001';
const REPO_ROOT = '/repo/bop-agency';

function makeErrorRecord(overrides: Partial<MigrationRecord> = {}): MigrationRecord {
  return {
    runId: RUN_ID,
    organizationId: ORG_ID,
    entityType: 'client',
    sourcePath: `${REPO_ROOT}/shared-data/clients-index.json`,
    sourceKey: 'legalink-col',
    sourceHash: 'abc123',
    targetTable: 'clients',
    targetId: null,
    action: 'error',
    errorCode: 'INSERT_FAILED',
    errorMessage: 'duplicate key value violates unique constraint',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: RUN_ID,
    organizationId: ORG_ID,
    mode: 'dry_run',
    status: 'completed',
    startedAt: '2026-07-30T10:00:00.000Z',
    completedAt: '2026-07-30T10:01:00.000Z',
    importers: [],
    totals: { total: 10, inserted: 8, updated: 0, skipped: 2, errors: 0, excluded: 0 },
    errorRecords: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildReportFilenames', () => {
  it('execute mode → phase-4-execute-* filenames', () => {
    const names = buildReportFilenames('execute', RUN_ID);
    expect(names.summaryLatest).toBe('phase-4-execute-latest-summary.json');
    expect(names.summaryHistorical).toBe(`phase-4-execute-${RUN_ID}-summary.json`);
    expect(names.errorsLatest).toBe('phase-4-execute-latest-errors.json');
    expect(names.errorsHistorical).toBe(`phase-4-execute-${RUN_ID}-errors.json`);
  });

  it('dry_run mode → phase-4-dry-run-* filenames', () => {
    const names = buildReportFilenames('dry_run', RUN_ID);
    expect(names.summaryLatest).toBe('phase-4-dry-run-latest-summary.json');
    expect(names.summaryHistorical).toBe(`phase-4-dry-run-${RUN_ID}-summary.json`);
    expect(names.errorsLatest).toBe('phase-4-dry-run-latest-errors.json');
    expect(names.errorsHistorical).toBe(`phase-4-dry-run-${RUN_ID}-errors.json`);
  });
});

describe('sanitizeErrorRecord', () => {
  it('strips absolute repositoryRoot prefix from sourcePath', () => {
    const record = makeErrorRecord({
      sourcePath: `${REPO_ROOT}/shared-data/clients-index.json`,
    });
    const result = sanitizeErrorRecord(record, REPO_ROOT, '2026-07-30T10:01:00.000Z');
    expect(result.sourcePath).toBe('shared-data/clients-index.json');
    expect(result.sourcePath).not.toContain(REPO_ROOT);
  });

  it('keeps relative paths as-is', () => {
    const record = makeErrorRecord({ sourcePath: 'shared-data/clients-index.json' });
    const result = sanitizeErrorRecord(record, REPO_ROOT, '2026-07-30T10:01:00.000Z');
    expect(result.sourcePath).toBe('shared-data/clients-index.json');
  });

  it('maps INSERT_FAILED → insert operation', () => {
    const record = makeErrorRecord({ errorCode: 'INSERT_FAILED' });
    const result = sanitizeErrorRecord(record, REPO_ROOT, '2026-07-30T10:01:00.000Z');
    expect(result.operation).toBe('insert');
  });

  it('maps UPDATE_FAILED → update operation', () => {
    const record = makeErrorRecord({ errorCode: 'UPDATE_FAILED' });
    const result = sanitizeErrorRecord(record, REPO_ROOT, '2026-07-30T10:01:00.000Z');
    expect(result.operation).toBe('update');
  });

  it('maps UPSERT_FAILED → upsert operation', () => {
    const record = makeErrorRecord({ errorCode: 'UPSERT_FAILED' });
    const result = sanitizeErrorRecord(record, REPO_ROOT, '2026-07-30T10:01:00.000Z');
    expect(result.operation).toBe('upsert');
  });

  it('maps RPC_ERROR → rpc operation', () => {
    const record = makeErrorRecord({ errorCode: 'RPC_ERROR' });
    const result = sanitizeErrorRecord(record, REPO_ROOT, '2026-07-30T10:01:00.000Z');
    expect(result.operation).toBe('rpc');
  });

  it('includes supabase fields when present', () => {
    const record: MigrationRecord = {
      ...makeErrorRecord(),
      supabaseCode: '23505',
      supabaseDetails: 'Key (slug)=(legalink-col) already exists.',
      supabaseHint: null,
    };
    const result = sanitizeErrorRecord(record, REPO_ROOT, '2026-07-30T10:01:00.000Z');
    expect(result.supabaseCode).toBe('23505');
    expect(result.supabaseDetails).toBe('Key (slug)=(legalink-col) already exists.');
    expect(result.supabaseHint).toBeNull();
  });

  it('preserves all required fields', () => {
    const ts = '2026-07-30T10:01:00.000Z';
    const result = sanitizeErrorRecord(makeErrorRecord(), REPO_ROOT, ts);
    expect(result.runId).toBe(RUN_ID);
    expect(result.entityType).toBe('client');
    expect(result.sourceKey).toBe('legalink-col');
    expect(result.errorCode).toBe('INSERT_FAILED');
    expect(result.targetTable).toBe('clients');
    expect(result.timestamp).toBe(ts);
  });
});

describe('writeRunReport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase4-report-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes four files with correct mode-based names (execute)', () => {
    const summary = makeSummary({ mode: 'execute', status: 'completed' });
    writeRunReport(tmpDir, summary, REPO_ROOT);

    const files = fs.readdirSync(tmpDir);
    expect(files).toContain(`phase-4-execute-latest-summary.json`);
    expect(files).toContain(`phase-4-execute-latest-errors.json`);
    expect(files).toContain(`phase-4-execute-${RUN_ID}-summary.json`);
    expect(files).toContain(`phase-4-execute-${RUN_ID}-errors.json`);
  });

  it('writes four files with correct mode-based names (dry_run)', () => {
    const summary = makeSummary({ mode: 'dry_run', status: 'completed' });
    writeRunReport(tmpDir, summary, REPO_ROOT);

    const files = fs.readdirSync(tmpDir);
    expect(files).toContain('phase-4-dry-run-latest-summary.json');
    expect(files).toContain('phase-4-dry-run-latest-errors.json');
    expect(files).toContain(`phase-4-dry-run-${RUN_ID}-summary.json`);
    expect(files).toContain(`phase-4-dry-run-${RUN_ID}-errors.json`);
  });

  it('does NOT overwrite existing historical files', () => {
    const summary = makeSummary({
      mode: 'execute',
      totals: { total: 1, inserted: 1, updated: 0, skipped: 0, errors: 0, excluded: 0 },
    });
    // Write once
    writeRunReport(tmpDir, summary, REPO_ROOT);
    const historicalPath = path.join(tmpDir, `phase-4-execute-${RUN_ID}-summary.json`);
    const firstContent = fs.readFileSync(historicalPath, 'utf-8');

    // Modify the summary and write again with same runId
    const summary2 = makeSummary({
      mode: 'execute',
      totals: { total: 99, inserted: 99, updated: 0, skipped: 0, errors: 0, excluded: 0 },
    });
    writeRunReport(tmpDir, summary2, REPO_ROOT);

    // Historical file must NOT have changed
    const secondContent = fs.readFileSync(historicalPath, 'utf-8');
    expect(secondContent).toBe(firstContent);
  });

  it('DOES overwrite latest files on second write', () => {
    const summary1 = makeSummary({
      mode: 'execute',
      totals: { total: 1, inserted: 1, updated: 0, skipped: 0, errors: 0, excluded: 0 },
    });
    writeRunReport(tmpDir, summary1, REPO_ROOT);
    const latestPath = path.join(tmpDir, 'phase-4-execute-latest-summary.json');
    const first = JSON.parse(fs.readFileSync(latestPath, 'utf-8')) as { totals: { total: number } };
    expect(first.totals.total).toBe(1);

    const summary2 = makeSummary({
      mode: 'execute',
      totals: { total: 99, inserted: 99, updated: 0, skipped: 0, errors: 0, excluded: 0 },
    });
    writeRunReport(tmpDir, summary2, REPO_ROOT);
    const second = JSON.parse(fs.readFileSync(latestPath, 'utf-8')) as {
      totals: { total: number };
    };
    expect(second.totals.total).toBe(99);
  });

  it('preserves individual error records (not aggregated)', () => {
    const error1 = makeErrorRecord({ sourceKey: 'legalink-col', errorCode: 'INSERT_FAILED' });
    const error2 = makeErrorRecord({
      sourceKey: 'magic-bungalow',
      entityType: 'skill',
      errorCode: 'UPSERT_FAILED',
      errorMessage: 'skill upsert failed',
    });
    const summary = makeSummary({
      mode: 'execute',
      status: 'partial_failure',
      errorRecords: [error1, error2],
      totals: { total: 10, inserted: 8, updated: 0, skipped: 0, errors: 2, excluded: 0 },
    });

    writeRunReport(tmpDir, summary, REPO_ROOT);

    const errorsPath = path.join(tmpDir, 'phase-4-execute-latest-errors.json');
    const errors = JSON.parse(fs.readFileSync(errorsPath, 'utf-8')) as Array<{
      sourceKey: string;
      errorCode: string;
      operation: string;
    }>;

    expect(errors).toHaveLength(2);
    expect(errors[0]?.sourceKey).toBe('legalink-col');
    expect(errors[0]?.errorCode).toBe('INSERT_FAILED');
    expect(errors[0]?.operation).toBe('insert');
    expect(errors[1]?.sourceKey).toBe('magic-bungalow');
    expect(errors[1]?.errorCode).toBe('UPSERT_FAILED');
    expect(errors[1]?.operation).toBe('upsert');
  });

  it('absolute paths are absent from error output', () => {
    const record = makeErrorRecord({
      sourcePath: `${REPO_ROOT}/shared-data/clients-index.json`,
    });
    const summary = makeSummary({
      mode: 'execute',
      status: 'failed',
      errorRecords: [record],
    });

    writeRunReport(tmpDir, summary, REPO_ROOT);

    const errorsPath = path.join(tmpDir, 'phase-4-execute-latest-errors.json');
    const content = fs.readFileSync(errorsPath, 'utf-8');
    // The repo root path must not appear in the output
    expect(content).not.toContain(REPO_ROOT);
    // But the relative path should be there
    expect(content).toContain('shared-data/clients-index.json');
  });

  it('partial run is NOT marked completed — status is preserved', () => {
    const summary = makeSummary({
      mode: 'execute',
      status: 'partial_failure',
      totals: { total: 10, inserted: 7, updated: 0, skipped: 0, errors: 3, excluded: 0 },
    });

    writeRunReport(tmpDir, summary, REPO_ROOT);

    const summaryPath = path.join(tmpDir, 'phase-4-execute-latest-summary.json');
    const written = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as { status: string };
    expect(written.status).toBe('partial_failure');
    expect(written.status).not.toBe('completed');
  });
});
