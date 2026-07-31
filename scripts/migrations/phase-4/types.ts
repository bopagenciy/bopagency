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

/**
 * Migration run statuses.
 * NOTE: 'partial_failure' is a local-only status (never written to the DB enum).
 * Runner maps it to 'failed' before any DB update.
 */
export type MigrationRunStatus =
  'pending' | 'running' | 'completed' | 'partial_failure' | 'failed' | 'rolled_back';

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
  /** UUID del usuario actor para migración (admin/owner de la org). Requerido en execute. */
  actorUserId: string | undefined;
  clients: string[];
  limit: number | null;
  verbose: boolean;
  resume: boolean;
  rollback: boolean;
  runId: string | null;
  listRuns: boolean;
  repositoryRoot: string | undefined;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface MigrationConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  organizationId: string;
  /**
   * UUID del usuario actor para migración (admin/owner de la org).
   * Requerido en mode=execute para operaciones de escritura en public.clients
   * (la RPC create_migrated_client / update_migrated_client lo usa para
   * asignar created_by/updated_by cuando auth.uid() es NULL).
   * Opcional en mode=dry_run.
   */
  actorUserId: string | undefined;
  /** Absolute path to the repository root (contains shared-data/, .agencia-ai/, etc.) */
  repositoryRoot: string;
  /** @deprecated Use repositoryRoot. Kept for importer compatibility. */
  projectRoot: string;
  /** @deprecated Use repositoryRoot. Kept for importer compatibility. */
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
  /**
   * Optional Supabase/PostgreSQL error fields, populated on DB-level errors.
   * These are NOT written to migration_records (no DB column), only to local output files.
   * All values are sanitized (truncated) before being stored here.
   */
  supabaseCode?: string | null;
  supabaseDetails?: string | null;
  supabaseHint?: string | null;
}

// ─── Migration result ─────────────────────────────────────────────────────────

export interface MigrationResult {
  record: MigrationRecord;
  durationMs: number;
}

// ─── Migration context (shared in-memory state across importers) ──────────────

/**
 * Ephemeral representation of a client that has been processed by
 * ClientsImporter. Used by dependent importers to resolve client IDs
 * without hitting the DB in dry_run mode.
 */
export interface ProjectedClient {
  /**
   * Stable ID for this run:
   *   - execute mode: same as realId (the actual DB UUID)
   *   - dry_run, new client: a freshly generated UUID (never written to DB)
   *   - dry_run, existing client: same as realId
   */
  projectedId: string;
  /** Actual DB UUID — null only when client does not exist in DB yet. */
  realId: string | null;
  organizationId: string;
  slug: string;
  name: string;
  action: 'insert' | 'update' | 'skip-preexisting';
  sourceHash: string;
  /** True when the client was confirmed to exist in the database. */
  existsInDatabase: boolean;
}

/**
 * Result of resolving a client slug in the current migration run.
 * Discriminated union — always check `kind` before using `clientId`.
 */
export type ClientResolution =
  | { kind: 'existing'; clientId: string; slug: string }
  | { kind: 'projected'; clientId: string; slug: string }
  | { kind: 'excluded'; slug: string }
  | { kind: 'missing'; slug: string };

/**
 * Shared state built and mutated by the runner during a single migration run.
 * Passed through ImporterContext so each importer can read projected state
 * without making redundant DB queries.
 */
export interface MigrationContext {
  mode: MigrationMode;
  organizationId: string;
  runId: string;
  repositoryRoot: string;
  /**
   * Populated by ClientsImporter as it processes each approved client.
   * Key: client slug (e.g. "legalink-col")
   */
  projectedClients: Map<string, ProjectedClient>;
  /** Slugs that were explicitly excluded (not approved, template, missing-index, etc.) */
  excludedSlugs: Set<string>;
}

// ─── Importer interface ───────────────────────────────────────────────────────

export interface ImporterContext {
  runId: string;
  organizationId: string;
  config: MigrationConfig;
  /** Shared in-memory migration state — populated progressively by importers. */
  migrationContext: MigrationContext;
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
  /**
   * Individual error records from all importers.
   * Populated by the runner. Used by report-writer to output granular error details.
   * Contains only records with action === 'error' | 'conflict'.
   */
  errorRecords: MigrationRecord[];
}

// ─── Source data shapes (raw JSON) ───────────────────────────────────────────

export interface RawClientIndex {
  schemaVersion: string;
  lastUpdated: string | null;
  clients: RawClientEntry[];
}

/**
 * Shape of each entry in shared-data/clients-index.json.
 * The `id` field serves as the client slug (e.g. "legalink-col").
 * Per-client details live in .agencia-ai/clients/{id}/client.json.
 */
export interface RawClientEntry {
  /** Unique identifier and slug (e.g. "legalink-col") */
  id: string;
  name: string;
  status: string;
  industry?: string;
  language?: string;
  timezone?: string;
  schemaVersion?: string;
  documents?: Record<string, string>;
  dataFiles?: Record<string, string>;
  /** Relative folder path, e.g. "/agencia-ai/clients/legalink-col" */
  folderPath?: string;
  isValid?: boolean;
  // Optional fields that may appear in per-client client.json
  website?: string;
  currency?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
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
  schemaVersion?: string;
  clientId?: string;
  /**
   * Puede ser un objeto {start, end, timezone} (formato actual de shared-data)
   * o un string "YYYY-MM" (formato legacy).
   * deriveMonthlyPeriod() extrae period_start/period_end de cualquiera de los dos.
   */
  period?: { start?: string; end?: string; timezone?: string } | string;
  /** Campos legacy camelCase — presentes en archivos antiguos. */
  periodStart?: string;
  periodEnd?: string;
  currency?: string;
  sources: RawMetricSource[];
  [key: string]: unknown;
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
  /** Campos legacy top-level. */
  periodStart?: string;
  periodEnd?: string;
  /**
   * Objeto period del formato actual (shared-data/reports).
   * Contiene startDate/endDate con las fechas reales del período.
   */
  period?: {
    label?: string;
    startDate?: string;
    endDate?: string;
    [key: string]: unknown;
  };
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
