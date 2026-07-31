/**
 * Phase 4 Migration — Runner
 *
 * Orchestrates:
 * 1. Verifying Supabase connection and organization
 * 2. Creating a migration_run record
 * 3. Running each importer in sequence
 * 4. Persisting migration_records (dry_run: only in memory; execute: to DB)
 * 5. Updating migration_run with final status and summary
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ImporterContext,
  ImporterSummary,
  MigrationConfig,
  MigrationContext,
  MigrationRecord,
  MigrationResult,
  MigrationRunStatus,
  RunSummary,
} from './types';
import type { Importer } from './types';
import { Logger } from './logger';

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface MigrationRunRow {
  id: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildImporterSummary(results: MigrationResult[], entityType: string): ImporterSummary {
  const summary: ImporterSummary = {
    entityType: entityType as ImporterSummary['entityType'],
    total: results.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    excluded: 0,
  };

  for (const r of results) {
    switch (r.record.action) {
      case 'insert':
        summary.inserted++;
        break;
      case 'update':
        summary.updated++;
        break;
      case 'skip':
      case 'skip-preexisting':
        summary.skipped++;
        break;
      case 'error':
      case 'conflict':
        summary.errors++;
        break;
      case 'excluded':
      case 'excluded-secret':
      case 'excluded-contaminated':
        summary.excluded++;
        break;
    }
  }

  return summary;
}

function buildTotals(summaries: ImporterSummary[]): RunSummary['totals'] {
  const totals: RunSummary['totals'] = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    excluded: 0,
  };
  for (const s of summaries) {
    totals.total += s.total;
    totals.inserted += s.inserted;
    totals.updated += s.updated;
    totals.skipped += s.skipped;
    totals.errors += s.errors;
    totals.excluded += s.excluded;
  }
  return totals;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export class MigrationRunner {
  private readonly logger: Logger;

  constructor(private readonly config: MigrationConfig) {
    this.logger = new Logger(config.verbose);
  }

  async run(client: SupabaseClient, importers: Importer[]): Promise<RunSummary> {
    const startedAt = new Date().toISOString();
    this.logger.info(`[RUNNER] Iniciando migración`, {
      mode: this.config.mode,
      organizationId: this.config.organizationId,
      importers: importers.map((i) => i.entityType),
    });

    // 1. Create migration_run record
    const runId = await this.createRun(client, startedAt);
    this.logger.info(`[RUNNER] migration_run creado`, { runId });

    // Shared in-memory state for cross-importer dependency resolution
    const migrationContext: MigrationContext = {
      mode: this.config.mode,
      organizationId: this.config.organizationId,
      runId,
      repositoryRoot: this.config.repositoryRoot,
      projectedClients: new Map(),
      excludedSlugs: new Set(),
    };

    const ctx: ImporterContext = {
      runId,
      organizationId: this.config.organizationId,
      config: this.config,
      migrationContext,
    };

    // 2. Update run status → running
    await this.updateRunStatus(client, runId, 'running');

    const allResults: MigrationResult[] = [];
    const importerSummaries: ImporterSummary[] = [];

    // 3. Run importers in sequence
    for (const importer of importers) {
      this.logger.info(`[RUNNER] Ejecutando importer: ${importer.entityType}`);
      try {
        const results = await importer.run(ctx);
        const summary = buildImporterSummary(results, importer.entityType);
        importerSummaries.push(summary);
        allResults.push(...results);

        this.logger.info(`[RUNNER] ${importer.entityType} completado`, {
          inserted: summary.inserted,
          updated: summary.updated,
          skipped: summary.skipped,
          errors: summary.errors,
          excluded: summary.excluded,
        });

        // 4. Persist records to DB (only in execute mode)
        if (this.config.mode === 'execute') {
          await this.persistRecords(
            client,
            results.map((r) => r.record),
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[RUNNER] Importer ${importer.entityType} falló fatalmente`, { message });
        await this.updateRunStatus(client, runId, 'failed', {
          errorMessage: message,
        });
        throw err;
      }
    }

    // 5. Finalize run
    const totals = buildTotals(importerSummaries);
    const completedAt = new Date().toISOString();

    // Determine final status.
    // 'partial_failure' is local-only — it is mapped to 'failed' before any DB write.
    let finalStatus: MigrationRunStatus;
    if (totals.errors === 0) {
      finalStatus = 'completed';
    } else if (totals.inserted + totals.updated > 0) {
      // Some records succeeded, some failed — partial outcome
      finalStatus = 'partial_failure';
    } else {
      finalStatus = 'failed';
    }

    // Collect individual error records for the report (not written to DB)
    const errorRecords = allResults
      .filter((r) => r.record.action === 'error' || r.record.action === 'conflict')
      .map((r) => r.record);

    await this.finalizeRun(client, runId, finalStatus, completedAt, {
      importers: importerSummaries,
      totals,
      hasPartialWrites: finalStatus === 'partial_failure',
    });

    this.logger.info(`[RUNNER] Migración finalizada`, {
      runId,
      mode: this.config.mode,
      status: finalStatus,
      ...totals,
    });

    return {
      runId,
      organizationId: this.config.organizationId,
      mode: this.config.mode,
      status: finalStatus,
      startedAt,
      completedAt,
      importers: importerSummaries,
      totals,
      errorRecords,
    };
  }

  // ─── Private DB methods ─────────────────────────────────────────────────────

  private async createRun(_client: SupabaseClient, _startedAt: string): Promise<string> {
    if (this.config.mode === 'dry_run') {
      // Dry run: generate a local run ID without any DB write.
      // migration_runs is a control table — writes only happen in execute mode.
      const { randomUUID } = await import('crypto');
      const localRunId = randomUUID();
      this.logger.info('[RUNNER] dry_run: run ID local generado (sin escritura en DB)', {
        runId: localRunId,
      });
      return localRunId;
    }

    const { data, error } = await _client
      .from('migration_runs')
      .insert({
        migration_name: 'phase-4-data-migration',
        migration_version: '1.0.0',
        organization_id: this.config.organizationId,
        mode: 'execute',
        status: 'pending',
        started_at: _startedAt,
        source_summary: {},
        result_summary: {},
        error_summary: {},
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`[RUNNER] Error creando migration_run: ${error.message}`);
    }

    return (data as MigrationRunRow).id;
  }

  private async updateRunStatus(
    client: SupabaseClient,
    runId: string,
    status: MigrationRunStatus,
    extra?: { errorMessage?: string },
  ): Promise<void> {
    if (this.config.mode === 'dry_run') {
      this.logger.info(`[RUNNER] dry_run: updateRunStatus omitido (sin escritura en DB)`, {
        status,
      });
      return;
    }

    const updateData: Record<string, unknown> = { status };
    if (extra?.errorMessage) {
      updateData['error_summary'] = { message: extra.errorMessage };
    }

    const { error } = await client.from('migration_runs').update(updateData).eq('id', runId);

    if (error) {
      this.logger.warn(`[RUNNER] No se pudo actualizar status del run`, {
        runId,
        status,
      });
    }
  }

  private async finalizeRun(
    client: SupabaseClient,
    runId: string,
    status: MigrationRunStatus,
    completedAt: string,
    summary: {
      importers: ImporterSummary[];
      totals: RunSummary['totals'];
      hasPartialWrites?: boolean;
    },
  ): Promise<void> {
    if (this.config.mode === 'dry_run') {
      this.logger.info(`[RUNNER] dry_run: finalizeRun omitido (sin escritura en DB)`, {
        runId,
        status,
        completedAt,
        importers: summary.importers.length,
      });
      return;
    }

    // 'partial_failure' is not a valid DB enum value — map to 'failed'
    const dbStatus: Exclude<MigrationRunStatus, 'partial_failure'> =
      status === 'partial_failure' ? 'failed' : status;

    const resultSummary: Record<string, unknown> = { ...summary.totals };
    if (summary.hasPartialWrites) {
      resultSummary['partial_writes'] = true;
    }

    const { error } = await client
      .from('migration_runs')
      .update({
        status: dbStatus,
        completed_at: completedAt,
        result_summary: resultSummary,
        source_summary: { importers: summary.importers.length },
      })
      .eq('id', runId);

    if (error) {
      this.logger.warn(`[RUNNER] No se pudo finalizar migration_run`, {
        runId,
      });
    }
  }

  private async persistRecords(client: SupabaseClient, records: MigrationRecord[]): Promise<void> {
    if (records.length === 0) return;

    // Batch in groups of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const rows = batch.map((r) => ({
        run_id: r.runId,
        organization_id: r.organizationId,
        entity_type: r.entityType,
        source_path: r.sourcePath,
        source_key: r.sourceKey,
        source_hash: r.sourceHash,
        target_table: r.targetTable,
        target_id: r.targetId,
        action: r.action,
        error_code: r.errorCode,
        error_message: r.errorMessage,
      }));

      const { error } = await client.from('migration_records').insert(rows);

      if (error) {
        this.logger.warn(
          `[RUNNER] Error insertando migration_records (batch ${i / BATCH_SIZE + 1})`,
          {
            message: error.message,
          },
        );
      }
    }
  }
}
