/**
 * Phase 4 — Metrics Importer
 *
 * Source:  shared-data/metrics/clients/{slug}/periods/{YYYY-MM}.json
 *          Each file is a single RawMetricsPeriod (or an array for legacy compat).
 * Target:  public.client_metrics
 * Key:     client_id + platform + account_id + period_start + period_end
 *
 * NOTE: Client resolution uses MigrationContext (populated by ClientsImporter)
 * rather than a live DB query, so dry_run works correctly even before clients
 * are actually inserted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import { computeHash } from '../hash';
import { Logger } from '../logger';
import { listDirectory, readJsonFile, safeResolvePath } from '../adapters/filesystem';
import { detectSecrets } from '../adapters/secret-detector';
import { getSupabaseClient } from '../adapters/supabase';
import { resolveMigrationClient } from '../adapters/client-resolver';
import { extractPostgrestExtra } from '../adapters/postgrest-error';
import type {
  Importer,
  ImporterContext,
  MigrationAction,
  MigrationResult,
  RawMetricsPeriod,
  RawMetricSource,
} from '../types';

const APPROVED_CLIENTS = ['legalink-col', 'magic-bungalow'];
/** Base directory under repositoryRoot that contains per-client metrics. */
const METRICS_CLIENTS_BASE = path.posix.join('shared-data', 'metrics', 'clients');

/**
 * Mapeo de plataformas en los archivos fuente al enum de client_metrics.platform.
 * CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin', 'twitter', 'other'))
 */
const PLATFORM_MAP: Record<string, string> = {
  meta_ads: 'meta',
  meta: 'meta',
  google_ads: 'google',
  google: 'google',
  tiktok_ads: 'tiktok',
  tiktok: 'tiktok',
  linkedin_ads: 'linkedin',
  linkedin: 'linkedin',
  twitter_ads: 'twitter',
  twitter: 'twitter',
};

/**
 * Normaliza el nombre de plataforma al valor esperado por el CHECK de la DB.
 * Si no está en el mapa, devuelve 'other'.
 */
export function normalizePlatform(raw: string): string {
  return PLATFORM_MAP[raw.toLowerCase()] ?? 'other';
}

/**
 * Último día del mes (UTC). month es 1-indexado (1=enero, 12=diciembre).
 * Maneja correctamente años bisiestos: lastDayOfMonth(2028, 2) === 29.
 */
function lastDayOfMonth(year: number, month: number): number {
  // Date.UTC(year, month, 0) = último día del mes anterior al mes `month`
  // Con month 1-indexado: Date.UTC(y, m, 0) = último día del mes m
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Formatea una Date UTC como string "YYYY-MM-DD". */
function toDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Deriva period_start y period_end para un período mensual de métricas.
 *
 * Prioridad:
 *  1. period.periodStart / periodEnd (legacy camelCase top-level)
 *  2. period.period.start / period.period.end (objeto anidado, formato actual)
 *  3. year + month del filename YYYY-MM.json
 *
 * Retorna null si no puede derivarse ningún período válido.
 */
export function deriveMonthlyPeriod(
  filename: string,
  period: { periodStart?: string; periodEnd?: string; period?: unknown },
): { periodStart: string; periodEnd: string } | null {
  // 1. Campos explícitos camelCase top-level
  if (period.periodStart && period.periodEnd) {
    return { periodStart: period.periodStart, periodEnd: period.periodEnd };
  }

  // 2. Objeto period anidado {start, end}
  const periodObj =
    period.period !== null && typeof period.period === 'object' && !Array.isArray(period.period)
      ? (period.period as Record<string, unknown>)
      : null;

  if (periodObj) {
    const start = typeof periodObj['start'] === 'string' ? periodObj['start'] : null;
    const end = typeof periodObj['end'] === 'string' ? periodObj['end'] : null;
    if (start && end) return { periodStart: start, periodEnd: end };
  }

  // 3. Derivar desde filename YYYY-MM.json
  const match = filename.match(/^(\d{4})-(\d{2})\.json$/);
  if (match) {
    const year = parseInt(match[1] as string, 10);
    const month = parseInt(match[2] as string, 10);
    if (year >= 2000 && month >= 1 && month <= 12) {
      const firstDay = toDateString(new Date(Date.UTC(year, month - 1, 1)));
      const lastDay = toDateString(
        new Date(Date.UTC(year, month - 1, lastDayOfMonth(year, month))),
      );
      return { periodStart: firstDay, periodEnd: lastDay };
    }
  }

  return null;
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

    const slugsToProcess =
      config.clients.length > 0
        ? config.clients.filter((s) => APPROVED_CLIENTS.includes(s))
        : APPROVED_CLIENTS;

    const limit = config.limit;
    let processed = 0;

    for (const slug of slugsToProcess) {
      if (limit !== null && processed >= limit) break;

      // Resolve client via MigrationContext (no DB query — ClientsImporter ran first)
      const resolution = resolveMigrationClient(slug, ctx.migrationContext);
      if (resolution.kind === 'excluded') {
        this.logger.debug(`[metrics-importer] Cliente "${slug}" excluido — saltando`);
        continue;
      }
      if (resolution.kind === 'missing') {
        this.logger.warn(`[metrics-importer] Cliente "${slug}" no resuelto en contexto — saltando`);
        continue;
      }

      const clientId = resolution.clientId;
      const periodsDir = path.posix.join(METRICS_CLIENTS_BASE, slug, 'periods');

      let periodFiles: string[];
      try {
        safeResolvePath(config.repositoryRoot, periodsDir);
        periodFiles = listDirectory(config.repositoryRoot, periodsDir).filter((f) =>
          f.endsWith('.json'),
        );
      } catch {
        this.logger.warn(`[metrics-importer] Directorio de métricas no encontrado: ${periodsDir}`);
        continue;
      }

      for (const filename of periodFiles) {
        if (limit !== null && processed >= limit) break;

        const relativePath = path.posix.join(periodsDir, filename);
        const rawData = readJsonFile<RawMetricsPeriod | RawMetricsPeriod[]>(
          config.repositoryRoot,
          relativePath,
        );

        if (!rawData) {
          this.logger.warn(`[metrics-importer] No se pudo leer: ${relativePath}`);
          continue;
        }

        // Accept both a single period object and an array (legacy compat)
        const periods: RawMetricsPeriod[] = Array.isArray(rawData) ? rawData : [rawData];

        for (const period of periods) {
          if (limit !== null && processed >= limit) break;

          // Secret scan per period
          const secretScan = detectSecrets(period);
          if (secretScan.hasSecrets) {
            this.logger.warn(
              `[metrics-importer] Secretos detectados en ${relativePath} — excluido`,
              { fields: secretScan.detectedFields },
            );
            results.push(
              this.makeResult(
                runId,
                organizationId,
                relativePath,
                `${slug}#${filename}#secret`,
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

            const sourceKey = `${slug}#${filename}#${source.platform}#${source.accountId}`;
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
                filename,
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
    }

    return results;
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
    filename: string,
    mode: string,
  ): Promise<MigrationResult['record']> {
    // Derivar período antes de cualquier operación de DB
    const derivedPeriod = deriveMonthlyPeriod(filename, period);
    if (!derivedPeriod) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'client_metrics',
        null,
        'error',
        'PERIOD_MISSING',
        `No se pudo derivar period_start/period_end desde "${filename}" ni desde el payload.`,
      );
    }

    // Normalizar plataforma al enum de la DB
    const normalizedPlatform = normalizePlatform(source.platform);

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
          platform: normalizedPlatform,
          account_id: source.accountId,
          account_name: source.accountName ?? null,
          period_start: derivedPeriod.periodStart,
          period_end: derivedPeriod.periodEnd,
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
      return {
        ...this.makeRecord(
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
        ),
        ...extractPostgrestExtra(error),
      };
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
