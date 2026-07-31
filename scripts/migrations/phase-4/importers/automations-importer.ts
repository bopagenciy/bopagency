/**
 * Phase 4 — Automations Importer
 *
 * Source:  shared-data/automations/automations-registry.json
 * Target:  public.automations
 * Key:     organization_id + legacy_id
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeHash } from '../hash';
import { Logger } from '../logger';
import { readJsonFile } from '../adapters/filesystem';
import { detectSecrets } from '../adapters/secret-detector';
import { getSupabaseClient } from '../adapters/supabase';
import { resolveMigrationClient } from '../adapters/client-resolver';
import { extractPostgrestExtra } from '../adapters/postgrest-error';
import type {
  Importer,
  ImporterContext,
  MigrationAction,
  MigrationResult,
  RawAutomation,
} from '../types';

const AUTOMATIONS_SOURCE = 'shared-data/automations/automations-registry.json';

type AutomationsFile = RawAutomation[] | { automations: RawAutomation[] };

interface ClientRow {
  id: string;
  slug: string;
}

export class AutomationsImporter implements Importer {
  readonly entityType = 'automation' as const;
  private readonly logger: Logger;

  constructor(verbose: boolean) {
    this.logger = new Logger(verbose);
  }

  async run(ctx: ImporterContext): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { runId, organizationId, config } = ctx;
    const client = getSupabaseClient(config);

    const rawData = readJsonFile<AutomationsFile>(config.repositoryRoot, AUTOMATIONS_SOURCE);
    if (!rawData) {
      this.logger.warn(`[automations-importer] ${AUTOMATIONS_SOURCE} no encontrado`);
      return results;
    }

    const secretScan = detectSecrets(rawData);
    if (secretScan.hasSecrets) {
      this.logger.warn('[automations-importer] Secretos detectados — excluido', {
        fields: secretScan.detectedFields,
      });
      results.push(
        this.makeResult(
          runId,
          organizationId,
          AUTOMATIONS_SOURCE,
          'automations-registry',
          null,
          'excluded-secret',
          'SECRET_DETECTED',
          'Secretos detectados',
        ),
      );
      return results;
    }

    const entries: RawAutomation[] = Array.isArray(rawData)
      ? rawData
      : ((rawData as { automations: RawAutomation[] }).automations ?? []);

    // In execute mode, build a live DB client map for any automations that reference a client slug.
    // In dry_run, use MigrationContext to avoid unnecessary DB queries.
    let clientMap = new Map<string, string>();
    if (config.mode === 'execute') {
      const { data: clientRows } = await client
        .from('clients')
        .select('id, slug')
        .eq('organization_id', organizationId)
        .is('deleted_at', null);
      clientMap = new Map<string, string>(
        ((clientRows ?? []) as ClientRow[]).map((c) => [c.slug, c.id]),
      );
    }

    const limit = config.limit;
    let processed = 0;

    for (const entry of entries) {
      if (limit !== null && processed >= limit) break;

      const sourceKey = entry.id;
      const sourcePath = `${AUTOMATIONS_SOURCE}#${sourceKey}`;
      const sourceHash = computeHash(entry);
      const start = Date.now();

      // Resolve clientId: prefer MigrationContext in dry_run, DB map in execute
      let clientId: string | null = null;
      if (entry.clientSlug) {
        if (config.mode === 'dry_run') {
          const resolution = resolveMigrationClient(entry.clientSlug, ctx.migrationContext);
          if (resolution.kind === 'existing' || resolution.kind === 'projected') {
            clientId = resolution.clientId;
          }
        } else {
          clientId = clientMap.get(entry.clientSlug) ?? null;
        }
      }

      try {
        const r = await this.upsertAutomation(
          client,
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          clientId,
          entry,
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

  private async upsertAutomation(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    clientId: string | null,
    entry: RawAutomation,
    mode: string,
  ): Promise<MigrationResult['record']> {
    const { data: existing } = await client
      .from('migration_records')
      .select('source_hash, target_id')
      .eq('organization_id', organizationId)
      .eq('source_key', sourceKey)
      .eq('target_table', 'automations')
      .eq('action', 'insert')
      .maybeSingle();

    if (existing && (existing as { source_hash: string }).source_hash === sourceHash) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'automations',
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
        'automations',
        null,
        'insert',
        null,
        null,
      );
    }

    const { data: inserted, error } = await client
      .from('automations')
      .upsert(
        {
          organization_id: organizationId,
          client_id: clientId,
          legacy_id: entry.id,
          name: entry.name,
          description: entry.description ?? null,
          category: entry.category ?? null,
          provider: entry.provider ?? 'n8n',
          workflow_id: entry.workflowId ?? null,
          status: entry.status ?? 'inactive',
          schedule: (entry.schedule ?? {}) as Record<string, unknown>,
          health: (entry.health ?? null) as Record<string, unknown> | null,
          links: (entry.links ?? null) as Record<string, unknown> | null,
          legacy_path: sourcePath,
          migrated_at: new Date().toISOString(),
          migration_version: '4.0.0',
          source_hash: sourceHash,
        },
        { onConflict: 'organization_id,legacy_id' },
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
          'automations',
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
      'automations',
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
      entityType: 'automation',
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
        'automations',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}
