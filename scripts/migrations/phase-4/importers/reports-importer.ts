/**
 * Phase 4 — Reports Importer
 *
 * Source:  shared-data/reports/clients/{client-slug}/*.json
 * Target:  public.reports
 * Key:     client_id + report_type + period_start + period_end
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import { computeHash } from '../hash';
import { Logger } from '../logger';
import { listDirectory, pathExists, readJsonFile } from '../adapters/filesystem';
import { detectSecrets } from '../adapters/secret-detector';
import { getSupabaseClient } from '../adapters/supabase';
import type {
  Importer,
  ImporterContext,
  MigrationAction,
  MigrationResult,
  RawReport,
} from '../types';

const APPROVED_CLIENTS = ['legalink-col', 'magic-bungalow'];
const REPORTS_BASE = 'shared-data/reports/clients';

interface ClientRow {
  id: string;
  slug: string;
}

function deriveReportType(filename: string, raw: RawReport): string {
  if (raw.reportType) return String(raw.reportType);
  if (filename.includes('weekly')) return 'weekly';
  if (filename.includes('monthly')) return 'monthly';
  return 'custom';
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

    const { data: clientRows } = await client
      .from('clients')
      .select('id, slug')
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    const clientMap = new Map<string, string>(
      ((clientRows ?? []) as ClientRow[]).map((c) => [c.slug, c.id]),
    );

    const slugsToProcess =
      config.clients.length > 0
        ? config.clients.filter((c) => APPROVED_CLIENTS.includes(c))
        : APPROVED_CLIENTS;

    const limit = config.limit;
    let processed = 0;

    for (const slug of slugsToProcess) {
      if (limit !== null && processed >= limit) break;

      const clientId = clientMap.get(slug);
      if (!clientId) {
        this.logger.warn(`[reports-importer] Cliente "${slug}" no en BD`);
        continue;
      }

      const clientDir = path.posix.join(REPORTS_BASE, slug);
      if (!pathExists(config.dataRoot, clientDir)) continue;

      const files = listDirectory(config.dataRoot, clientDir).filter((f) => f.endsWith('.json'));

      for (const filename of files) {
        if (limit !== null && processed >= limit) break;

        const relativePath = path.posix.join(clientDir, filename);
        const rawReport = readJsonFile<RawReport>(config.dataRoot, relativePath);
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
              filename,
              null,
              'excluded-secret',
              'SECRET_DETECTED',
              'Secretos detectados',
            ),
          );
          continue;
        }

        const sourceKey = `${slug}#${filename}`;
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

    const reportType = deriveReportType(filename, raw);
    const {
      reportId,
      periodLabel,
      periodStart,
      periodEnd,
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
          period_start: String(periodStart),
          period_end: String(periodEnd),
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
      return this.makeRecord(
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
      );
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
