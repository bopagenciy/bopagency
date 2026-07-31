/**
 * Phase 4 Migration — Type definitions
 * NO any, NO @ts-ignore, NO eslint-disable
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type MigrationMode = 'dry_run' | 'execute';

export type MigrationAction =
  | 'insert'
  | 'update'
  | 'skip'
  | 'skip-preexisting'
  | 'conflict'
  | 'error'
  | 'excluded'
  | 'excluded-secret'
  | 'excluded-contaminated';

export type MigrationRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';

export type EntityType =
  | 'client'
  | 'document'
  | 'task'
  | 'metric'
  | 'alert'
  | 'report'
  | 'report_recipient'
  | 'agent'
  | 'skill'
  | 'template'
  | 'automation';

// ─── CLI Args ─────────────────────────────────────────────────────────────────

export interface CliArgs {
  mode: MigrationMode;
  organizationId: string | undefined;
  clients: string[];
  limit: number | null;
  verbose: boolean;
  resume: boolean;
  rollback: boolean;
  runId: string | null;
  listRuns: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface MigrationConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  organizationId: string;
  projectRoot: string;
  dataRoot: string;
  mode: MigrationMode;
  verbose: boolean;
  clients: string[];
  limit: number | null;
}

// ─── Migration record ─────────────────────────────────────────────────────────

export interface MigrationRecord {
  runId: string;
  organizationId: string;
  entityType: EntityType;
  sourcePath: string;
  sourceKey: string;
  sourceHash: string | null;
  targetTable: string;
  targetId: string | null;
  action: MigrationAction;
  errorCode: string | null;
  errorMessage: string | null;
}

// ─── Migration result ─────────────────────────────────────────────────────────

export interface MigrationResult {
  record: MigrationRecord;
  durationMs: number;
}

// ─── Importer interface ───────────────────────────────────────────────────────

export interface ImporterContext {
  runId: string;
  organizationId: string;
  config: MigrationConfig;
}

export interface ImporterSummary {
  entityType: EntityType;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  excluded: number;
}

export interface Importer {
  readonly entityType: EntityType;
  run(ctx: ImporterContext): Promise<MigrationResult[]>;
}

// ─── Run summary ──────────────────────────────────────────────────────────────

export interface RunSummary {
  runId: string;
  organizationId: string;
  mode: MigrationMode;
  status: MigrationRunStatus;
  startedAt: string;
  completedAt: string | null;
  importers: ImporterSummary[];
  totals: {
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    excluded: number;
  };
}

// ─── Source data shapes (raw JSON) ───────────────────────────────────────────

export interface RawClientIndex {
  schemaVersion: string;
  lastUpdated: string;
  clients: RawClientEntry[];
}

export interface RawClientEntry {
  id: string;
  slug: string;
  name: string;
  status: string;
  industry?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  timezone?: string;
  currency?: string;
  reportingPeriod?: string;
  notes?: string;
  createdAt?: string;
  lastModified?: string;
}

export interface RawTask {
  id?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
  createdAt?: string;
}

export interface RawMetricsPeriod {
  period: string;
  periodStart: string;
  periodEnd: string;
  currency?: string;
  sources: RawMetricSource[];
}

export interface RawMetricSource {
  platform: string;
  accountId: string;
  accountName?: string;
  metrics: Record<string, unknown>;
  campaigns?: unknown[];
  dataQuality?: Record<string, unknown>;
}

export interface RawAlertEntry {
  alertKey: string;
  alertType: string;
  severity?: string;
  status?: string;
  title?: string;
  description?: string;
  platform?: string;
  accountId?: string;
  detectedAt?: string;
  acknowledgedAt?: string;
  snoozedUntil?: string;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RawReport {
  reportId?: string;
  reportType?: string;
  periodLabel?: string;
  periodStart: string;
  periodEnd: string;
  currency?: string;
  generatedAt?: string;
  summary?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RawReportRecipient {
  email: string;
  reportTypes?: string[];
  active?: boolean;
  clientSlug?: string;
}

export interface RawAutomation {
  id: string;
  name: string;
  description?: string;
  category?: string;
  provider?: string;
  workflowId?: string;
  clientSlug?: string;
  status?: string;
  schedule?: Record<string, unknown>;
  health?: Record<string, unknown>;
  links?: Record<string, unknown>;
}
