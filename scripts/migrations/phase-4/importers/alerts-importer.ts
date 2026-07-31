/**
 * Phase 4 — Alerts Importer
 *
 * Source:  shared-data/alerts/alert-state.json
 * Target:  public.alerts
 * Key:     organization_id + alert_key (unique)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeHash } from '../hash';
import { Logger } from '../logger';
import { readJsonFile } from '../adapters/filesystem';
import { detectSecrets } from '../adapters/secret-detector';
import { getSupabaseClient } from '../adapters/supabase';
import type {
  Importer,
  ImporterContext,
  MigrationAction,
  MigrationResult,
  RawAlertEntry,
} from '../types';

const ALERTS_SOURCE = 'shared-data/alerts/alert-state.json';

type AlertState = RawAlertEntry[] | { alerts: RawAlertEntry[] };

export class AlertsImporter implements Importer {
  readonly entityType = 'alert' as const;
  private readonly logger: Logger;

  constructor(verbose: boolean) {
    this.logger = new Logger(verbose);
  }

  async run(ctx: ImporterContext): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { runId, organizationId, config } = ctx;
    const client = getSupabaseClient(config);

    const rawData = readJsonFile<AlertState>(config.dataRoot, ALERTS_SOURCE);
    if (!rawData) {
      this.logger.warn(`[alerts-importer] ${ALERTS_SOURCE} no encontrado`);
      return results;
    }

    const secretScan = detectSecrets(rawData);
    if (secretScan.hasSecrets) {
      this.logger.warn('[alerts-importer] Secretos detectados — excluido', {
        fields: secretScan.detectedFields,
      });
      results.push(
        this.makeResult(
          runId,
          organizationId,
          ALERTS_SOURCE,
          'alert-state',
          null,
          'excluded-secret',
          'SECRET_DETECTED',
          'Secretos detectados',
        ),
      );
      return results;
    }

    const entries: RawAlertEntry[] = Array.isArray(rawData)
      ? rawData
      : ((rawData as { alerts: RawAlertEntry[] }).alerts ?? []);

    const limit = config.limit;
    let processed = 0;

    for (const entry of entries) {
      if (limit !== null && processed >= limit) break;

      const sourceKey = entry.alertKey;
      const sourcePath = `${ALERTS_SOURCE}#${sourceKey}`;
      const start = Date.now();
      const sourceHash = computeHash(entry);

      try {
        const r = await this.upsertAlert(
          client,
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          entry,
          config.mode,
        );
        results.push({ record: r, durationMs: Date.now() - start });
        processed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[alerts-importer] Error en ${sourceKey}`, { message });
        results.push(
          this.makeResult(
            runId,
            organizationId,
            sourcePath,
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

    return results;
  }

  private async upsertAlert(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    entry: RawAlertEntry,
    mode: string,
  ): Promise<MigrationResult['record']> {
    const { data: existing } = await client
      .from('migration_records')
      .select('source_hash, target_id')
      .eq('organization_id', organizationId)
      .eq('source_key', sourceKey)
      .eq('target_table', 'alerts')
      .eq('action', 'insert')
      .maybeSingle();

    if (existing && (existing as { source_hash: string }).source_hash === sourceHash) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'alerts',
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
        'alerts',
        null,
        'insert',
        null,
        null,
      );
    }

    const { data: inserted, error } = await client
      .from('alerts')
      .upsert(
        {
          organization_id: organizationId,
          alert_key: entry.alertKey,
          alert_type: entry.alertType,
          severity: entry.severity ?? 'info',
          status: entry.status ?? 'active',
          title: entry.title ?? null,
          description: entry.description ?? null,
          platform: entry.platform ?? null,
          account_id: entry.accountId ?? null,
          detected_at: entry.detectedAt ?? null,
          acknowledged_at: entry.acknowledgedAt ?? null,
          snoozed_until: entry.snoozedUntil ?? null,
          resolved_at: entry.resolvedAt ?? null,
          metadata: entry.metadata ?? {},
          legacy_path: sourcePath,
          migrated_at: new Date().toISOString(),
          migration_version: '4.0.0',
          source_hash: sourceHash,
        },
        { onConflict: 'organization_id,alert_key' },
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
        'alerts',
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
      'alerts',
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
      entityType: 'alert',
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
        'alerts',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}
