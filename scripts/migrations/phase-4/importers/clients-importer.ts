/**
 * Phase 4 — Clients Importer
 *
 * Source:  shared-data/clients-index.json (schemaVersion: "1.0.0")
 *          Per-client details: .agencia-ai/clients/{id}/client.json
 * Target:  public.clients
 * Key:     organization_id + slug (unique)
 *
 * NOTE: The index uses `id` as the slug (e.g. "legalink-col").
 *
 * APPROVED clients: legalink-col, magic-bungalow
 * EXCLUDED: _template-client, bop-soluciones, the-industrial-depot,
 *           cliente-prueba-automatizacion-marketing-digital
 *
 * IMPORTANT: public.clients has NO legacy_id column.
 * Identity is established via organization_id + slug only.
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeHash } from '../hash';
import { Logger } from '../logger';
import { readJsonFile } from '../adapters/filesystem';
import { detectSecrets } from '../adapters/secret-detector';
import { getSupabaseClient } from '../adapters/supabase';
import { resolveSharedDataPath, sanitizeLogPath } from '../adapters/repository-root';
import { extractPostgrestExtra } from '../adapters/postgrest-error';
import type {
  Importer,
  ImporterContext,
  MigrationAction,
  MigrationResult,
  RawClientEntry,
  RawClientIndex,
} from '../types';

/** Relative path (from repo root) logged in output — never absolute. */
const CLIENTS_INDEX_REL = 'shared-data/clients-index.json';

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

function mapClientStatus(
  raw: string | undefined,
): 'active' | 'inactive' | 'onboarding' | 'churned' {
  const map: Record<string, 'active' | 'inactive' | 'onboarding' | 'churned'> = {
    active: 'active',
    inactive: 'inactive',
    paused: 'inactive', // nearest equivalent in client_status enum
    archived: 'churned', // nearest equivalent in client_status enum
    onboarding: 'onboarding',
    churned: 'churned',
  };
  return map[raw ?? 'active'] ?? 'active';
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

    // En modo execute, actorUserId es obligatorio para crear/actualizar clientes.
    // La RPC create_migrated_client / update_migrated_client lo usa para asignar
    // created_by/updated_by cuando auth.uid() es NULL (service_role).
    if (config.mode === 'execute' && !config.actorUserId) {
      this.logger.error(
        '[clients-importer] MIGRATION_ACTOR_USER_ID no configurado — ' +
          'requerido en execute para insertar clientes (created_by/updated_by).',
      );
      results.push(
        this.makeResult(
          runId,
          organizationId,
          CLIENTS_INDEX_REL,
          'clients-index',
          null,
          'error',
          'ACTOR_MISSING',
          'MIGRATION_ACTOR_USER_ID es obligatorio en modo execute. ' +
            'Proporcionar --actor-user-id=<UUID> o env MIGRATION_ACTOR_USER_ID. ' +
            'El actor debe ser miembro admin/owner de la organización.',
        ),
      );
      return results;
    }

    // Determine which clients to migrate
    const approvedSlugs =
      config.clients.length > 0
        ? config.clients.filter((c) => APPROVED_CLIENTS.has(c))
        : [...APPROVED_CLIENTS];

    // Read source — file lives at shared-data/clients-index.json
    const indexAbsPath = resolveSharedDataPath(config.repositoryRoot, 'clients-index.json');
    const indexRelPath = sanitizeLogPath(indexAbsPath, config.repositoryRoot);
    const indexData = readJsonFile<RawClientIndex>(config.repositoryRoot, CLIENTS_INDEX_REL);

    if (!indexData) {
      this.logger.warn(`[clients-importer] ${indexRelPath} no encontrado — fuente bloqueante`);
      results.push(
        this.makeResult(
          runId,
          organizationId,
          CLIENTS_INDEX_REL,
          'clients-index',
          null,
          'error',
          'SOURCE_NOT_FOUND',
          `${CLIENTS_INDEX_REL} no encontrado`,
        ),
      );
      return results;
    }

    this.logger.info(`[clients-importer] Leyendo ${indexRelPath}`, {
      entries: indexData.clients?.length ?? 0,
    });

    // Secret scan on the entire index
    const secretScan = detectSecrets(indexData);
    if (secretScan.hasSecrets) {
      this.logger.warn(
        `[clients-importer] Secretos detectados en ${indexRelPath} — archivo excluido`,
        {
          fields: secretScan.detectedFields,
        },
      );
      results.push(
        this.makeResult(
          runId,
          organizationId,
          CLIENTS_INDEX_REL,
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

      // `id` is the slug in the real schema
      const sourceKey = entry.id;
      const sourcePath = `${CLIENTS_INDEX_REL}#${sourceKey}`;

      // Skip non-approved
      if (!approvedSlugs.includes(entry.id)) {
        ctx.migrationContext.excludedSlugs.add(entry.id);
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
            `Client id "${entry.id}" no está en la lista de aprobados`,
          ),
        );
        continue;
      }

      const start = Date.now();
      const sourceHash = computeHash(entry);

      try {
        const result = await this.persistClient(
          client,
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          entry,
          config.mode,
          config.actorUserId,
        );
        results.push({ record: result, durationMs: Date.now() - start });
        processed++;

        // Populate migrationContext so dependent importers can resolve this client
        // without hitting the DB (critical for dry_run correctness).
        const action = result.action;
        if (action === 'insert' || action === 'update' || action === 'skip-preexisting') {
          const projectedId = result.targetId ?? randomUUID();
          ctx.migrationContext.projectedClients.set(entry.id, {
            projectedId,
            realId: result.targetId,
            organizationId,
            slug: entry.id,
            name: entry.name,
            action,
            sourceHash: result.sourceHash ?? sourceHash,
            existsInDatabase: result.targetId !== null,
          });
        }
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

  /**
   * Persiste un cliente usando flujo manual insert/update/skip.
   *
   * Flujo:
   *  1. Buscar en public.clients por organization_id + slug.
   *  2. No existe → insert (sin legacy_id).
   *  3. Existe → comparar hash via migration_records.
   *     - mismo hash  → skip-preexisting
   *     - hash distinto → update por id
   */
  private async persistClient(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    entry: RawClientEntry,
    mode: string,
    actorUserId: string | undefined,
  ): Promise<MigrationResult['record']> {
    // 1. Verificar en la tabla destino primero por clave natural
    const { data: existingClient, error: selectError } = await client
      .from('clients')
      .select('id, deleted_at')
      .eq('organization_id', organizationId)
      .eq('slug', entry.id)
      .maybeSingle();

    if (selectError) {
      return {
        ...this.makeRecord(
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          'clients',
          null,
          'error',
          'SELECT_FAILED',
          selectError.message,
        ),
        ...extractPostgrestExtra(selectError),
      };
    }

    // 2. Cliente no existe → insert
    if (!existingClient) {
      if (mode === 'dry_run') {
        this.logger.action('insert', 'client', sourceKey);
        return this.makeRecord(
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          'clients',
          null,
          'insert',
          null,
          null,
        );
      }

      // INSERT via RPC create_migrated_client.
      // La RPC valida el actor, inyecta auth.uid() vía set_config para que
      // manage_client_write asigne created_by/updated_by correctamente,
      // y retorna el UUID del nuevo cliente.
      // actorUserId está garantizado non-null en execute (verificado en run()).
      const { data: newClientId, error: insertError } = await client.rpc('create_migrated_client', {
        p_organization_id: organizationId,
        p_actor_user_id: actorUserId ?? null,
        p_slug: entry.id,
        p_name: entry.name,
        p_status: mapClientStatus(entry.status),
        p_industry: mapIndustry(entry.industry) || null,
        p_currency: entry.currency ?? 'COP',
        p_timezone: entry.timezone ?? 'America/Bogota',
        p_website: entry.website ?? null,
        p_notes: entry.notes ?? null,
      });

      if (insertError) {
        return {
          ...this.makeRecord(
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
          ),
          ...extractPostgrestExtra(insertError),
        };
      }

      this.logger.action('insert', 'client', sourceKey);
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'clients',
        newClientId as string,
        'insert',
        null,
        null,
      );
    }

    // 3. Cliente existe → comparar hash via migration_records
    const ec = existingClient as { id: string; deleted_at: string | null };

    const { data: migRecord } = await client
      .from('migration_records')
      .select('source_hash')
      .eq('organization_id', organizationId)
      .eq('source_key', sourceKey)
      .eq('target_table', 'clients')
      .maybeSingle();

    const storedHash = migRecord ? (migRecord as { source_hash: string }).source_hash : null;

    if (storedHash === sourceHash) {
      this.logger.action('skip', 'client', sourceKey);
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'clients',
        ec.id,
        'skip-preexisting',
        null,
        null,
      );
    }

    // Hash diferente → update
    if (mode === 'dry_run') {
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

    // UPDATE via RPC update_migrated_client para que manage_client_write vea
    // auth.uid() = actorUserId y asigne updated_by correctamente.
    const { error: updateError } = await client.rpc('update_migrated_client', {
      p_client_id: ec.id,
      p_actor_user_id: actorUserId ?? null,
      p_name: entry.name,
      p_status: mapClientStatus(entry.status),
      p_industry: mapIndustry(entry.industry) || null,
      p_currency: entry.currency ?? 'COP',
      p_timezone: entry.timezone ?? 'America/Bogota',
      p_website: entry.website ?? null,
      p_notes: entry.notes ?? null,
    });

    if (updateError) {
      return {
        ...this.makeRecord(
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          'clients',
          ec.id,
          'error',
          'UPDATE_FAILED',
          updateError.message,
        ),
        ...extractPostgrestExtra(updateError),
      };
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
