/**
 * Phase 4 — Reports Importer
 *
 * Source:  shared-data/reports/clients/{slug}/monthly/{YYYY-MM}.json
 *          shared-data/reports/clients/{slug}/weekly/{YYYY-WNN}.json
 * Target:  public.reports
 * Key:     client_id + report_type + period_start + period_end
 *
 * NOTE: Client resolution uses MigrationContext (populated by ClientsImporter)
 * rather than a live DB query, so dry_run works correctly even before clients
 * are actually inserted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import { computeHash } from '../hash';
import { Logger } from '../logger';
import { listDirectory, pathExists, readJsonFile } from '../adapters/filesystem';
import { detectSecrets } from '../adapters/secret-detector';
import { getSupabaseClient } from '../adapters/supabase';
import { resolveMigrationClient } from '../adapters/client-resolver';
import { extractPostgrestExtra } from '../adapters/postgrest-error';
import type {
  Importer,
  ImporterContext,
  MigrationAction,
  MigrationResult,
  RawReport,
} from '../types';

const APPROVED_CLIENTS = ['legalink-col', 'magic-bungalow'];
const REPORTS_BASE = path.posix.join('shared-data', 'reports', 'clients');
/** Subdirectories that contain report JSON files. */
const REPORT_SUBDIRS = ['monthly', 'weekly'] as const;

function deriveReportType(subdir: string, filename: string, raw: RawReport): string {
  if (raw.reportType) return String(raw.reportType);
  // Use the subdir name as the report type (monthly / weekly)
  if (subdir === 'monthly' || subdir === 'weekly') return subdir;
  if (filename.includes('weekly')) return 'weekly';
  if (filename.includes('monthly')) return 'monthly';
  return 'custom';
}

/** Formatea una Date UTC como string "YYYY-MM-DD". */
function toDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Último día del mes (UTC). month es 1-indexado. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Obtiene el lunes de la semana ISO dada o null si la semana no existe en ese año.
 * Validado: isoWeekToMonday(2026, 25) => 2026-06-15 (lunes).
 */
export function isoWeekToMonday(year: number, week: number): Date | null {
  if (week < 1 || week > 53) return null;
  // Jan 4 siempre cae en la semana ISO 1 del año
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay(); // 0=Dom, 1=Lun, ...
  const offsetToMonday = (dow + 6) % 7; // días desde el lunes de esa semana
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - offsetToMonday);

  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);

  // Verificar que el lunes resultante pertenece al mismo año ISO
  // (semana 53: el lunes puede caer ya en el año siguiente = semana inválida)
  const isoYear = getISOYear(targetMonday);
  if (isoYear !== year) return null;

  return targetMonday;
}

/** Devuelve el año ISO de una fecha. */
function getISOYear(d: Date): number {
  const year = d.getUTCFullYear();
  // Lunes de semana 1 del año siguiente
  const jan4Next = new Date(Date.UTC(year + 1, 0, 4));
  const dowNext = jan4Next.getUTCDay();
  const week1NextMonday = new Date(jan4Next);
  week1NextMonday.setUTCDate(jan4Next.getUTCDate() - ((dowNext + 6) % 7));
  if (d >= week1NextMonday) return year + 1;

  // Lunes de semana 1 del año actual
  const jan4Curr = new Date(Date.UTC(year, 0, 4));
  const dowCurr = jan4Curr.getUTCDay();
  const week1CurrMonday = new Date(jan4Curr);
  week1CurrMonday.setUTCDate(jan4Curr.getUTCDate() - ((dowCurr + 6) % 7));
  if (d < week1CurrMonday) return year - 1;

  return year;
}

/**
 * Deriva period_start/period_end para un reporte mensual.
 *
 * Prioridad:
 *  1. raw.periodStart / raw.periodEnd (top-level, legacy)
 *  2. raw.period?.startDate / raw.period?.endDate (formato actual)
 *  3. Parse filename YYYY-MM.json → primer y último día del mes
 *
 * Retorna null si no puede derivarse.
 */
export function deriveMonthlyReportPeriod(
  filename: string,
  raw: RawReport,
): { periodStart: string; periodEnd: string } | null {
  // 1. Top-level legacy
  if (raw.periodStart && raw.periodEnd) {
    return { periodStart: raw.periodStart, periodEnd: raw.periodEnd };
  }

  // 2. Objeto period anidado
  const p = raw.period;
  if (p && typeof p.startDate === 'string' && typeof p.endDate === 'string') {
    return { periodStart: p.startDate, periodEnd: p.endDate };
  }

  // 3. Filename YYYY-MM.json
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

/**
 * Deriva period_start/period_end para un reporte semanal.
 *
 * Prioridad:
 *  1. raw.periodStart / raw.periodEnd (top-level, legacy)
 *  2. raw.period?.startDate / raw.period?.endDate (formato actual)
 *  3. Parse filename YYYY-WXX.json → lunes y domingo ISO de esa semana
 *
 * Retorna null si la semana no existe en ese año o no puede derivarse.
 */
export function deriveIsoWeekPeriod(
  filename: string,
  raw: RawReport,
): { periodStart: string; periodEnd: string } | null {
  // 1. Top-level legacy
  if (raw.periodStart && raw.periodEnd) {
    return { periodStart: raw.periodStart, periodEnd: raw.periodEnd };
  }

  // 2. Objeto period anidado
  const p = raw.period;
  if (p && typeof p.startDate === 'string' && typeof p.endDate === 'string') {
    return { periodStart: p.startDate, periodEnd: p.endDate };
  }

  // 3. Filename YYYY-WXX.json
  const match = filename.match(/^(\d{4})-W(\d{2})\.json$/);
  if (match) {
    const year = parseInt(match[1] as string, 10);
    const week = parseInt(match[2] as string, 10);
    const monday = isoWeekToMonday(year, week);
    if (!monday) return null; // semana inexistente en este año
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { periodStart: toDateString(monday), periodEnd: toDateString(sunday) };
  }

  return null;
}

export class ReportsImporter implements Importer {
  readonly entityType = 'report' as const;
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
        ? config.clients.filter((c) => APPROVED_CLIENTS.includes(c))
        : APPROVED_CLIENTS;

    const limit = config.limit;
    let processed = 0;

    for (const slug of slugsToProcess) {
      if (limit !== null && processed >= limit) break;

      // Resolve client via MigrationContext (no DB query — ClientsImporter ran first)
      const resolution = resolveMigrationClient(slug, ctx.migrationContext);
      if (resolution.kind === 'excluded') {
        this.logger.debug(`[reports-importer] Cliente "${slug}" excluido — saltando`);
        continue;
      }
      if (resolution.kind === 'missing') {
        this.logger.warn(`[reports-importer] Cliente "${slug}" no resuelto en contexto — saltando`);
        continue;
      }

      const clientId = resolution.clientId;
      const clientBase = path.posix.join(REPORTS_BASE, slug);

      if (!pathExists(config.repositoryRoot, clientBase)) {
        this.logger.warn(`[reports-importer] Directorio no encontrado: ${clientBase}`);
        continue;
      }

      // Iterate monthly/ and weekly/ subdirs
      for (const subdir of REPORT_SUBDIRS) {
        if (limit !== null && processed >= limit) break;

        const subdirPath = path.posix.join(clientBase, subdir);
        if (!pathExists(config.repositoryRoot, subdirPath)) continue;

        const files = listDirectory(config.repositoryRoot, subdirPath).filter((f) =>
          f.endsWith('.json'),
        );

        for (const filename of files) {
          if (limit !== null && processed >= limit) break;

          const relativePath = path.posix.join(subdirPath, filename);
          const rawReport = readJsonFile<RawReport>(config.repositoryRoot, relativePath);
          if (!rawReport) continue;

          const secretScan = detectSecrets(rawReport);
          if (secretScan.hasSecrets) {
            this.logger.warn(`[reports-importer] Secretos en ${relativePath}`, {
              fields: secretScan.detectedFields,
            });
            results.push(
              this.makeResult(
                runId,
                organizationId,
                relativePath,
                `${slug}#${subdir}#${filename}`,
                null,
                'excluded-secret',
                'SECRET_DETECTED',
                'Secretos detectados',
              ),
            );
            continue;
          }

          const sourceKey = `${slug}#${subdir}#${filename}`;
          const sourceHash = computeHash(rawReport);
          const start = Date.now();

          try {
            const r = await this.upsertReport(
              client,
              runId,
              organizationId,
              relativePath,
              sourceKey,
              sourceHash,
              clientId,
              subdir,
              filename,
              rawReport,
              config.mode,
            );
            results.push({ record: r, durationMs: Date.now() - start });
            processed++;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
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

  private async upsertReport(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    clientId: string,
    subdir: string,
    filename: string,
    raw: RawReport,
    mode: string,
  ): Promise<MigrationResult['record']> {
    const { data: existing } = await client
      .from('migration_records')
      .select('source_hash, target_id')
      .eq('organization_id', organizationId)
      .eq('source_key', sourceKey)
      .eq('target_table', 'reports')
      .eq('action', 'insert')
      .maybeSingle();

    if (existing && (existing as { source_hash: string }).source_hash === sourceHash) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'reports',
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
        'reports',
        null,
        'insert',
        null,
        null,
      );
    }

    const reportType = deriveReportType(subdir, filename, raw);

    // Derivar período: nunca enviar String(undefined) = "undefined"
    const derivedPeriod =
      subdir === 'weekly'
        ? deriveIsoWeekPeriod(filename, raw)
        : deriveMonthlyReportPeriod(filename, raw);

    if (!derivedPeriod) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'reports',
        null,
        'error',
        'REPORT_PERIOD_MISSING',
        `No se pudo derivar period_start/period_end desde "${filename}" ni desde el payload.`,
      );
    }

    const {
      reportId,
      periodLabel,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      periodStart: _ps,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      periodEnd: _pe,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      period: _period,
      currency,
      generatedAt,
      summary,
      ...restPayload
    } = raw;

    const { data: inserted, error } = await client
      .from('reports')
      .upsert(
        {
          client_id: clientId,
          organization_id: organizationId,
          report_type: reportType,
          status: 'generated',
          period_label: periodLabel ?? null,
          period_start: derivedPeriod.periodStart,
          period_end: derivedPeriod.periodEnd,
          currency: String(currency ?? 'COP'),
          generated_at: generatedAt ? String(generatedAt) : null,
          summary: (summary ?? {}) as Record<string, unknown>,
          payload: restPayload as Record<string, unknown>,
          legacy_id: reportId ? String(reportId) : null,
          legacy_path: sourcePath,
          migrated_at: new Date().toISOString(),
          migration_version: '4.0.0',
          source_hash: sourceHash,
        },
        { onConflict: 'client_id,report_type,period_start,period_end' },
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
          'reports',
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
      'reports',
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
      entityType: 'report',
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
        'reports',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}
