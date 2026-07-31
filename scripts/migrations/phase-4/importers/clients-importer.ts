/**
 * Phase 4 — Clients Importer
 *
 * Source:  .agencia-ai/clients/clients-index.json (schemaVersion: "1.0")
 * Target:  public.clients
 * Key:     organization_id + slug (unique)
 *
 * APPROVED clients: legalink-col, magic-bungalow
 * EXCLUDED: _template-client, bop-soluciones, the-industrial-depot,
 *           cliente-prueba-automatizacion-marketing-digital
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
  RawClientEntry,
  RawClientIndex,
} from '../types';

// Clients approved for automatic migration in Phase 4
const APPROVED_CLIENTS = new Set(['legalink-col', 'magic-bungalow']);

// Industry mapping per CLIENT_CLASSIFICATION.md
const INDUSTRY_MAP: Record<string, string> = {
  'Marketing Digital / Agencia': 'other',
  'Servicios legales digitales': 'legal',
  'Hotelería / Turismo / Glamping': 'hospitality',
};

function mapIndustry(raw: string | undefined): string {
  if (!raw) return 'other';
  return INDUSTRY_MAP[raw] ?? 'other';
}

function mapClientStatus(raw: string | undefined): string {
  const map: Record<string, string> = {
    active: 'active',
    inactive: 'inactive',
    paused: 'paused',
    archived: 'archived',
  };
  return map[raw ?? 'active'] ?? 'active';
}

interface ClientRow {
  id?: string;
  organization_id: string;
  slug: string;
  name: string;
  status: string;
  industry: string;
  currency: string;
  timezone: string;
  website: string | null;
  notes: string | null;
  legacy_id: string | null;
  migrated_at: string;
  migration_version: string;
}

export class ClientsImporter implements Importer {
  readonly entityType = 'client' as const;
  private readonly logger: Logger;

  constructor(verbose: boolean) {
    this.logger = new Logger(verbose);
  }

  async run(ctx: ImporterContext): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { runId, organizationId, config } = ctx;
    const client = getSupabaseClient(config);

    // Determine which clients to migrate
    const approvedSlugs =
      config.clients.length > 0
        ? config.clients.filter((c) => APPROVED_CLIENTS.has(c))
        : [...APPROVED_CLIENTS];

    // Read source
    const indexData = readJsonFile<RawClientIndex>(
      config.dataRoot,
      '.agencia-ai/clients/clients-index.json',
    );

    if (!indexData) {
      this.logger.warn('[clients-importer] clients-index.json no encontrado');
      return results;
    }

    // Secret scan on the entire index
    const secretScan = detectSecrets(indexData);
    if (secretScan.hasSecrets) {
      this.logger.warn(
        '[clients-importer] Secretos detectados en clients-index.json — archivo excluido',
        {
          fields: secretScan.detectedFields,
        },
      );
      results.push(
        this.makeResult(
          runId,
          organizationId,
          '.agencia-ai/clients/clients-index.json',
          'clients-index',
          null,
          'excluded-secret',
          'SECRET_DETECTED',
          'Secretos detectados en archivo fuente',
        ),
      );
      return results;
    }

    const allClients = indexData.clients ?? [];
    const limit = config.limit;
    let processed = 0;

    for (const entry of allClients) {
      if (limit !== null && processed >= limit) break;

      const sourceKey = entry.slug;
      const sourcePath = `.agencia-ai/clients/clients-index.json#${sourceKey}`;

      // Skip non-approved
      if (!approvedSlugs.includes(entry.slug)) {
        this.logger.action('excluded', 'client', sourceKey, {
          reason: 'not in approved list',
        });
        results.push(
          this.makeResult(
            runId,
            organizationId,
            sourcePath,
            sourceKey,
            null,
            'excluded',
            'NOT_APPROVED',
            `Client slug "${entry.slug}" no está en la lista de aprobados`,
          ),
        );
        continue;
      }

      const start = Date.now();
      const sourceHash = computeHash(entry);

      try {
        const result = await this.upsertClient(
          client,
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          entry,
          config.mode,
        );
        results.push({ record: result, durationMs: Date.now() - start });
        processed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[clients-importer] Error procesando cliente ${sourceKey}`, { message });
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

  private async upsertClient(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    entry: RawClientEntry,
    mode: string,
  ): Promise<MigrationResult['record']> {
    // Check if record already migrated with same hash
    const { data: existing } = await client
      .from('migration_records')
      .select('id, source_hash, target_id, action')
      .eq('organization_id', organizationId)
      .eq('source_key', sourceKey)
      .eq('target_table', 'clients')
      .eq('action', 'insert')
      .maybeSingle();

    if (existing && (existing as { source_hash: string }).source_hash === sourceHash) {
      this.logger.action('skip', 'client', sourceKey);
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'clients',
        (existing as { target_id: string }).target_id,
        'skip-preexisting',
        null,
        null,
      );
    }

    // Check if client exists by slug in target table
    const { data: existingClient } = await client
      .from('clients')
      .select('id, deleted_at')
      .eq('organization_id', organizationId)
      .eq('slug', entry.slug)
      .maybeSingle();

    if (mode === 'dry_run') {
      const action: MigrationAction = existingClient ? 'update' : 'insert';
      this.logger.action(action, 'client', sourceKey);
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'clients',
        existingClient ? (existingClient as { id: string }).id : null,
        action,
        null,
        null,
      );
    }

    const row: ClientRow = {
      organization_id: organizationId,
      slug: entry.slug,
      name: entry.name,
      status: mapClientStatus(entry.status),
      industry: mapIndustry(entry.industry),
      currency: entry.currency ?? 'COP',
      timezone: entry.timezone ?? 'America/Bogota',
      website: entry.website ?? null,
      notes: entry.notes ?? null,
      legacy_id: entry.id ?? null,
      migrated_at: new Date().toISOString(),
      migration_version: '4.0.0',
    };

    if (existingClient) {
      const ec = existingClient as { id: string; deleted_at: string | null };
      const { error } = await client
        .from('clients')
        .update({ ...row, deleted_at: ec.deleted_at })
        .eq('id', ec.id);

      if (error) {
        return this.makeRecord(
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          'clients',
          ec.id,
          'error',
          'UPDATE_FAILED',
          error.message,
        );
      }

      this.logger.action('update', 'client', sourceKey);
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'clients',
        ec.id,
        'update',
        null,
        null,
      );
    }

    const { data: inserted, error: insertError } = await client
      .from('clients')
      .insert(row)
      .select('id')
      .single();

    if (insertError) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'clients',
        null,
        'error',
        'INSERT_FAILED',
        insertError.message,
      );
    }

    this.logger.action('insert', 'client', sourceKey);
    return this.makeRecord(
      runId,
      organizationId,
      sourcePath,
      sourceKey,
      sourceHash,
      'clients',
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
      entityType: 'client',
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
        'clients',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}
