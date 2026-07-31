/**
 * Phase 4 — Metrics Importer
 *
 * Source:  shared-data/metrics/periods/{YYYY-MM}.json
 *          Each file is an array of RawMetricsPeriod.
 * Target:  public.client_metrics
 * Key:     client_id + platform + account_id + period_start + period_end
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import { computeHash } from '../hash';
import { Logger } from '../logger';
import { listDirectory, readJsonFile, safeResolvePath } from '../adapters/filesystem';
import { detectSecrets } from '../adapters/secret-detector';
import { getSupabaseClient } from '../adapters/supabase';
import type {
  Importer,
  ImporterContext,
  MigrationAction,
  MigrationResult,
  RawMetricsPeriod,
  RawMetricSource,
} from '../types';

const METRICS_DIR = 'shared-data/metrics/periods';

interface ClientRow {
  id: string;
  slug: string;
}

export class MetricsImporter implements Importer {
  readonly entityType = 'metric' as const;
  private readonly logger: Logger;

  constructor(verbose: boolean) {
    this.logger = new Logger(verbose);
  }

  async run(ctx: ImporterContext): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { runId, organizationId, config } = ctx;
    const client = getSupabaseClient(config);

    // Load all approved clients from DB
    const { data: clientRows } = await client
      .from('clients')
      .select('id, slug')
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    const clientMap = new Map<string, string>(
      ((clientRows ?? []) as ClientRow[]).map((c) => [c.slug, c.id]),
    );

    // List period files
    let periodFiles: string[];
    try {
      safeResolvePath(config.dataRoot, METRICS_DIR);
      periodFiles = listDirectory(config.dataRoot, METRICS_DIR).filter((f) => f.endsWith('.json'));
    } catch {
      this.logger.warn(`[metrics-importer] Directorio de métricas no encontrado: ${METRICS_DIR}`);
      return results;
    }

    const limit = config.limit;
    let processed = 0;

    for (const filename of periodFiles) {
      if (limit !== null && processed >= limit) break;
      const relativePath = path.posix.join(METRICS_DIR, filename);

      const rawData = readJsonFile<RawMetricsPeriod[]>(config.dataRoot, relativePath);
      if (!rawData) {
        this.logger.warn(`[metrics-importer] No se pudo leer: ${relativePath}`);
        continue;
      }

      // Ensure it's an array
      const periods: RawMetricsPeriod[] = Array.isArray(rawData) ? rawData : [rawData];

      for (const period of periods) {
        if (limit !== null && processed >= limit) break;

        // Secret scan per source entry
        const secretScan = detectSecrets(period);
        if (secretScan.hasSecrets) {
          this.logger.warn(`[metrics-importer] Secretos detectados en ${relativePath} — excluido`, {
            fields: secretScan.detectedFields,
          });
          results.push(
            this.makeResult(
              runId,
              organizationId,
              relativePath,
              `${filename}#secret`,
              null,
              'excluded-secret',
              'SECRET_DETECTED',
              'Secretos detectados',
            ),
          );
          continue;
        }

        for (const source of period.sources ?? []) {
          if (limit !== null && processed >= limit) break;

          // Derive client from accountId or platform metadata
          const clientId = this.resolveClientId(source, clientMap);
          if (!clientId) {
            this.logger.debug(
              `[metrics-importer] No se pudo resolver cliente para account ${source.accountId}`,
            );
            continue;
          }

          const sourceKey = `${filename}#${source.platform}#${source.accountId}`;
          const start = Date.now();
          const sourceHash = computeHash({
            period: period.period,
            platform: source.platform,
            accountId: source.accountId,
            metrics: source.metrics,
          });

          try {
            const r = await this.upsertMetric(
              client,
              runId,
              organizationId,
              relativePath,
              sourceKey,
              sourceHash,
              clientId,
              period,
              source,
              config.mode,
            );
            results.push({ record: r, durationMs: Date.now() - start });
            processed++;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`[metrics-importer] Error en ${sourceKey}`, { message });
            results.push(
              this.makeResult(
                runId,
                organizationId,
                relativePath,
                sourceKey,
                sourceHash,
                'error',
                'IMPORT_ERROR',
                message,
              ),
            );
            processed++;
          }
        }
      }
    }

    return results;
  }

  private resolveClientId(source: RawMetricSource, clientMap: Map<string, string>): string | null {
    // Try to match via accountName hints or platform metadata
    for (const [slug, id] of clientMap.entries()) {
      if (
        source.accountName?.toLowerCase().includes(slug.replace(/-/g, '')) ||
        source.accountId?.toLowerCase().includes(slug.replace(/-/g, ''))
      ) {
        return id;
      }
    }
    // If only one client, assign to it (single-tenant heuristic)
    if (clientMap.size === 1) {
      return [...clientMap.values()][0] ?? null;
    }
    return null;
  }

  private async upsertMetric(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    clientId: string,
    period: RawMetricsPeriod,
    source: RawMetricSource,
    mode: string,
  ): Promise<MigrationResult['record']> {
    // Check idempotency
    const { data: existing } = await client
      .from('migration_records')
      .select('source_hash, target_id')
      .eq('organization_id', organizationId)
      .eq('source_key', sourceKey)
      .eq('target_table', 'client_metrics')
      .eq('action', 'insert')
      .maybeSingle();

    if (existing && (existing as { source_hash: string }).source_hash === sourceHash) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'client_metrics',
        (existing as { target_id: string }).target_id,
        'skip-preexisting',
        null,
        null,
      );
    }

    if (mode === 'dry_run') {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'client_metrics',
        null,
        'insert',
        null,
        null,
      );
    }

    const { data: inserted, error } = await client
      .from('client_metrics')
      .upsert(
        {
          client_id: clientId,
          organization_id: organizationId,
          platform: source.platform,
          account_id: source.accountId,
          account_name: source.accountName ?? null,
          period_start: period.periodStart,
          period_end: period.periodEnd,
          currency: period.currency ?? 'COP',
          metrics: source.metrics as Record<string, unknown>,
          campaigns: (source.campaigns ?? []) as unknown[],
          data_quality: (source.dataQuality ?? null) as Record<string, unknown> | null,
          legacy_path: sourcePath,
          migrated_at: new Date().toISOString(),
          migration_version: '4.0.0',
          source_hash: sourceHash,
        },
        {
          onConflict: 'client_id,platform,account_id,period_start,period_end',
        },
      )
      .select('id')
      .single();

    if (error) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'client_metrics',
        null,
        'error',
        'UPSERT_FAILED',
        error.message,
      );
    }

    return this.makeRecord(
      runId,
      organizationId,
      sourcePath,
      sourceKey,
      sourceHash,
      'client_metrics',
      (inserted as { id: string }).id,
      'insert',
      null,
      null,
    );
  }

  private makeRecord(
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string | null,
    targetTable: string,
    targetId: string | null,
    action: MigrationAction,
    errorCode: string | null,
    errorMessage: string | null,
  ): MigrationResult['record'] {
    return {
      runId,
      organizationId,
      entityType: 'metric',
      sourcePath,
      sourceKey,
      sourceHash,
      targetTable,
      targetId,
      action,
      errorCode,
      errorMessage,
    };
  }

  private makeResult(
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string | null,
    action: MigrationAction,
    errorCode: string | null,
    errorMessage: string | null,
  ): MigrationResult {
    return {
      record: this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'client_metrics',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}
