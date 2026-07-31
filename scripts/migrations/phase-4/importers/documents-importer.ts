/**
 * Phase 4 — Documents Importer
 *
 * Source:  .agencia-ai/clients/{slug}/*.md (Markdown)
 * Target:  public.client_documents (via upsert_client_document RPC)
 * Key:     client_id + document_key
 *
 * Only imports for approved clients that exist in target DB.
 * Quarantine files are blocked at path level.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import { computeTextHash } from '../hash';
import { Logger } from '../logger';
import {
  listMarkdownFiles,
  pathExists,
  readTextFile,
  safeResolvePath,
} from '../adapters/filesystem';
import { getSupabaseClient } from '../adapters/supabase';
import { resolveMigrationClient } from '../adapters/client-resolver';
import { extractPostgrestExtra } from '../adapters/postgrest-error';
import type { Importer, ImporterContext, MigrationAction, MigrationResult } from '../types';

const APPROVED_CLIENTS = ['legalink-col', 'magic-bungalow'];

// Files to skip even if not in quarantine path
const EXCLUDED_FILENAMES = new Set(['README.md', 'TEMPLATE.md']);

export class DocumentsImporter implements Importer {
  readonly entityType = 'document' as const;
  private readonly logger: Logger;

  constructor(verbose: boolean) {
    this.logger = new Logger(verbose);
  }

  async run(ctx: ImporterContext): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { runId, organizationId, config } = ctx;
    const client = getSupabaseClient(config);

    // En execute, actorUserId es obligatorio: la RPC upsert_migrated_client_document
    // necesita un actor válido para asignar created_by/updated_by.
    if (config.mode === 'execute' && !config.actorUserId) {
      this.logger.error(
        '[documents-importer] MIGRATION_ACTOR_USER_ID no configurado — ' +
          'requerido en execute para insertar documentos (created_by/updated_by).',
      );
      results.push(
        this.makeResult(
          runId,
          organizationId,
          'shared-data',
          'documents-index',
          '', // clientId no disponible en este punto
          null,
          'error',
          'ACTOR_MISSING',
          'MIGRATION_ACTOR_USER_ID es obligatorio en modo execute. ' +
            'Proporcionar --actor-user-id=<UUID> o env MIGRATION_ACTOR_USER_ID.',
        ),
      );
      return results;
    }

    const slugsToProcess =
      config.clients.length > 0
        ? config.clients.filter((c) => APPROVED_CLIENTS.includes(c))
        : APPROVED_CLIENTS;

    const limit = config.limit;
    let processed = 0;

    for (const clientSlug of slugsToProcess) {
      if (limit !== null && processed >= limit) break;

      // Resolve client via MigrationContext (no DB query needed — ClientsImporter ran first)
      const resolution = resolveMigrationClient(clientSlug, ctx.migrationContext);
      if (resolution.kind === 'excluded') {
        this.logger.debug(`[documents-importer] Cliente "${clientSlug}" excluido — saltando`);
        continue;
      }
      if (resolution.kind === 'missing') {
        this.logger.warn(
          `[documents-importer] Cliente "${clientSlug}" no resuelto en contexto — saltando`,
        );
        continue;
      }

      const clientId = resolution.clientId;
      const clientDir = `.agencia-ai/clients/${clientSlug}`;

      if (!pathExists(config.repositoryRoot, clientDir)) {
        this.logger.warn(`[documents-importer] Directorio no encontrado: ${clientDir}`);
        continue;
      }

      const mdFiles = listMarkdownFiles(config.repositoryRoot, clientDir);

      for (const filename of mdFiles) {
        if (limit !== null && processed >= limit) break;
        if (EXCLUDED_FILENAMES.has(filename)) {
          this.logger.debug(`[documents-importer] Saltando archivo excluido: ${filename}`);
          continue;
        }

        const relativePath = path.posix.join(clientDir, filename);
        const sourceKey = filename.replace(/\.md$/, '');

        // SECURITY: verify path is safe before reading
        let resolvedPath: string;
        try {
          resolvedPath = safeResolvePath(config.repositoryRoot, relativePath);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[documents-importer] Ruta bloqueada: ${relativePath}`, { message });
          results.push(
            this.makeResult(
              runId,
              organizationId,
              relativePath,
              sourceKey,
              clientId,
              null,
              'excluded-contaminated',
              'PATH_BLOCKED',
              message,
            ),
          );
          continue;
        }

        // Check quarantine in resolved path
        if (
          resolvedPath.toLowerCase().includes('quarantine') ||
          resolvedPath.includes('CONTAMINATED')
        ) {
          results.push(
            this.makeResult(
              runId,
              organizationId,
              relativePath,
              sourceKey,
              clientId,
              null,
              'excluded-contaminated',
              'QUARANTINE',
              'Archivo en cuarentena',
            ),
          );
          continue;
        }

        const content = readTextFile(config.repositoryRoot, relativePath);
        if (content === null) {
          this.logger.warn(`[documents-importer] No se pudo leer: ${relativePath}`);
          results.push(
            this.makeResult(
              runId,
              organizationId,
              relativePath,
              sourceKey,
              clientId,
              null,
              'error',
              'READ_ERROR',
              'Archivo no encontrado o ilegible',
            ),
          );
          continue;
        }

        const start = Date.now();
        const sourceHash = computeTextHash(content);
        const documentKey = sourceKey;
        const title = deriveTitle(filename, content);

        try {
          const result = await this.upsertDocument(
            client,
            runId,
            organizationId,
            relativePath,
            documentKey,
            sourceHash,
            clientId,
            documentKey,
            title,
            content,
            config.mode,
            config.actorUserId,
          );
          results.push({ record: result, durationMs: Date.now() - start });
          processed++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`[documents-importer] Error procesando ${relativePath}`, { message });
          results.push(
            this.makeResult(
              runId,
              organizationId,
              relativePath,
              sourceKey,
              clientId,
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

  private async upsertDocument(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    clientId: string,
    documentKey: string,
    title: string,
    content: string,
    mode: string,
    actorUserId: string | undefined,
  ): Promise<MigrationResult['record']> {
    // Check if already migrated with same hash
    const { data: existing } = await client
      .from('migration_records')
      .select('source_hash, target_id, action')
      .eq('organization_id', organizationId)
      .eq('source_key', sourceKey)
      .eq('target_table', 'client_documents')
      .eq('action', 'insert')
      .maybeSingle();

    if (existing && (existing as { source_hash: string }).source_hash === sourceHash) {
      this.logger.action('skip', 'document', sourceKey);
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'client_documents',
        (existing as { target_id: string }).target_id,
        'skip-preexisting',
        null,
        null,
      );
    }

    if (mode === 'dry_run') {
      this.logger.action('insert', 'document', sourceKey);
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'client_documents',
        null,
        'insert',
        null,
        null,
      );
    }

    // Use migration-specific RPC that bypasses auth.uid() requirement.
    // upsert_migrated_client_document: SECURITY DEFINER, solo service_role,
    // inyecta actor vía set_config para que set_document_audit asigne created_by/updated_by.
    // actorUserId garantizado non-null en execute (verificado en run()).
    const { data: docId, error } = await client.rpc('upsert_migrated_client_document', {
      p_client_id: clientId,
      p_actor_user_id: actorUserId ?? null,
      p_document_key: documentKey,
      p_title: title,
      p_content: content,
    });

    if (error) {
      return {
        ...this.makeRecord(
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          'client_documents',
          null,
          'error',
          'RPC_ERROR',
          error.message,
        ),
        ...extractPostgrestExtra(error),
      };
    }

    this.logger.action('insert', 'document', sourceKey);
    return this.makeRecord(
      runId,
      organizationId,
      sourcePath,
      sourceKey,
      sourceHash,
      'client_documents',
      typeof docId === 'string' ? docId : null,
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
      entityType: 'document',
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
    _clientId: string,
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
        'client_documents',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}

function deriveTitle(filename: string, content: string): string {
  // Try to extract H1 from first line
  const firstLine = content.split('\n')[0] ?? '';
  if (firstLine.startsWith('# ')) {
    return firstLine.slice(2).trim();
  }
  // Fallback: filename without extension, replacing hyphens/underscores
  return filename
    .replace(/\.md$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
