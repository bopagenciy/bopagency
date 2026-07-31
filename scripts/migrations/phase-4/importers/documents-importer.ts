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
import type { Importer, ImporterContext, MigrationAction, MigrationResult } from '../types';

const APPROVED_CLIENTS = ['legalink-col', 'magic-bungalow'];

// Files to skip even if not in quarantine path
const EXCLUDED_FILENAMES = new Set(['README.md', 'TEMPLATE.md']);

interface ClientRow {
  id: string;
}

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

    const slugsToProcess =
      config.clients.length > 0
        ? config.clients.filter((c) => APPROVED_CLIENTS.includes(c))
        : APPROVED_CLIENTS;

    const limit = config.limit;
    let processed = 0;

    for (const clientSlug of slugsToProcess) {
      if (limit !== null && processed >= limit) break;

      // Look up client in DB
      const { data: clientRow } = await client
        .from('clients')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('slug', clientSlug)
        .is('deleted_at', null)
        .maybeSingle();

      if (!clientRow) {
        this.logger.warn(
          `[documents-importer] Cliente "${clientSlug}" no encontrado en BD — saltando`,
        );
        continue;
      }

      const clientId = (clientRow as ClientRow).id;
      const clientDir = `.agencia-ai/clients/${clientSlug}`;

      if (!pathExists(config.dataRoot, clientDir)) {
        this.logger.warn(`[documents-importer] Directorio no encontrado: ${clientDir}`);
        continue;
      }

      const mdFiles = listMarkdownFiles(config.dataRoot, clientDir);

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
          resolvedPath = safeResolvePath(config.dataRoot, relativePath);
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

        const content = readTextFile(config.dataRoot, relativePath);
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

    // Use RPC for upsert with optimistic concurrency
    const { data, error } = await client.rpc('upsert_client_document', {
      p_client_id: clientId,
      p_document_key: documentKey,
      p_title: title,
      p_content: content,
      p_expected_version: null, // migration bypasses version check
    });

    if (error) {
      return this.makeRecord(
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
      );
    }

    const docId = (data as { document_id?: string })?.document_id ?? null;
    this.logger.action('insert', 'document', sourceKey);
    return this.makeRecord(
      runId,
      organizationId,
      sourcePath,
      sourceKey,
      sourceHash,
      'client_documents',
      docId,
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
