/**
 * Phase 4 — Templates Importer
 *
 * Source:  .agencia-ai/templates/*.md
 * Target:  public.templates
 * Key:     organization_id + slug
 *
 * IMPORTANT: No .upsert() / onConflict — el esquema usa índices únicos parciales.
 * Se usa persistScopedContentEntity para el flujo insert/update/skip.
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
import { persistScopedContentEntity } from '../adapters/scoped-content-persistence';
import type { Importer, ImporterContext, MigrationAction, MigrationResult } from '../types';

const TEMPLATES_DIR = '.agencia-ai/templates';

function slugFromFilename(f: string): string {
  return f
    .replace(/\.md$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}

function nameFromContent(content: string, slug: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  if (firstLine.startsWith('# ')) return firstLine.slice(2).trim();
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function typeFromFilename(filename: string): string {
  if (filename.includes('report')) return 'report';
  if (filename.includes('email')) return 'email';
  if (filename.includes('brief')) return 'brief';
  if (filename.includes('prompt')) return 'prompt';
  return 'custom';
}

export class TemplatesImporter implements Importer {
  readonly entityType = 'template' as const;
  private readonly logger: Logger;

  constructor(verbose: boolean) {
    this.logger = new Logger(verbose);
  }

  async run(ctx: ImporterContext): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { runId, organizationId, config } = ctx;
    const client = getSupabaseClient(config);

    if (!pathExists(config.dataRoot, TEMPLATES_DIR)) {
      this.logger.warn(`[templates-importer] Directorio no encontrado: ${TEMPLATES_DIR}`);
      return results;
    }

    const files = listMarkdownFiles(config.dataRoot, TEMPLATES_DIR);
    const limit = config.limit;
    let processed = 0;

    for (const filename of files) {
      if (limit !== null && processed >= limit) break;

      const relativePath = path.posix.join(TEMPLATES_DIR, filename);
      let safe = true;
      try {
        safeResolvePath(config.dataRoot, relativePath);
      } catch {
        safe = false;
      }
      if (!safe) continue;

      const content = readTextFile(config.dataRoot, relativePath);
      if (content === null) continue;

      const slug = slugFromFilename(filename);
      const sourceKey = slug;
      const sourceHash = computeTextHash(content);
      const start = Date.now();

      try {
        const r = await this.persistTemplate(
          client,
          runId,
          organizationId,
          relativePath,
          sourceKey,
          sourceHash,
          slug,
          filename,
          content,
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

    return results;
  }

  /**
   * Persiste un template usando persistScopedContentEntity.
   * - INSERT incluye legacy_path (inmutable por trigger).
   * - UPDATE excluye legacy_path, organization_id, slug, id, created_at.
   */
  private async persistTemplate(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    slug: string,
    filename: string,
    content: string,
    mode: string,
  ): Promise<MigrationResult['record']> {
    const now = new Date().toISOString();

    const insertPayload: Record<string, unknown> = {
      organization_id: organizationId,
      slug,
      name: nameFromContent(content, slug),
      template_type: typeFromFilename(filename),
      content,
      is_global: false,
      is_active: true,
      legacy_path: sourcePath,
      migrated_at: now,
      migration_version: '4.0.0',
      source_hash: sourceHash,
    };

    // UPDATE: no enviar organization_id, slug, is_global, legacy_path, id, created_at
    const updatePayload: Record<string, unknown> = {
      name: nameFromContent(content, slug),
      template_type: typeFromFilename(filename),
      content,
      is_active: true,
      migrated_at: now,
      migration_version: '4.0.0',
      source_hash: sourceHash,
    };

    const result = await persistScopedContentEntity({
      client,
      table: 'templates',
      organizationId,
      slug,
      sourceHash,
      insertPayload,
      updatePayload,
      mode,
    });

    if (result.action === 'conflict') {
      this.logger.action('conflict', 'template', sourceKey);
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'templates',
        null,
        'conflict',
        'CONFLICT_MULTI_ROW',
        result.message,
      );
    }

    if (result.action === 'error') {
      return {
        ...this.makeRecord(
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          'templates',
          null,
          'error',
          result.errorCode,
          result.errorMessage,
        ),
        supabaseCode: result.supabaseCode,
        supabaseDetails: result.supabaseDetails,
        supabaseHint: result.supabaseHint,
      };
    }

    this.logger.action(result.action, 'template', sourceKey);
    return this.makeRecord(
      runId,
      organizationId,
      sourcePath,
      sourceKey,
      sourceHash,
      'templates',
      result.targetId,
      result.action,
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
      entityType: 'template',
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
        'templates',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}
