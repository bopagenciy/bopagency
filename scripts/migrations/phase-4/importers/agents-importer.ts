/**
 * Phase 4 — Agents Importer
 *
 * Source:  .agencia-ai/.claude/agents/*.md
 * Target:  public.agents
 * Key:     organization_id + slug
 *
 * Markdown files treated as untrusted text data only.
 * No secret detection on Markdown content.
 *
 * IMPORTANT: No .upsert() / onConflict — el esquema usa índices únicos parciales.
 * Se usa persistScopedContentEntity para el flujo insert/update/skip.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import { computeTextHash } from '../hash';
import { Logger } from '../logger';
import { listDirectory, pathExists, readTextFile, safeResolvePath } from '../adapters/filesystem';
import { getSupabaseClient } from '../adapters/supabase';
import { persistScopedContentEntity } from '../adapters/scoped-content-persistence';
import type { Importer, ImporterContext, MigrationAction, MigrationResult } from '../types';

const AGENTS_DIR = '.agencia-ai/.claude/agents';

function slugFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}

function nameFromContent(content: string, slug: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  if (firstLine.startsWith('# ')) return firstLine.slice(2).trim();
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function descriptionFromContent(content: string): string | null {
  const lines = content.split('\n');
  for (let i = 1; i < Math.min(lines.length, 10); i++) {
    const line = (lines[i] ?? '').trim();
    if (line && !line.startsWith('#') && !line.startsWith('---')) {
      return line.slice(0, 500);
    }
  }
  return null;
}

function agentTypeFromContent(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes('estrateg')) return 'strategist';
  if (lower.includes('analista') || lower.includes('analyst')) return 'analyst';
  if (lower.includes('creativ')) return 'creative';
  if (lower.includes('manager') || lower.includes('gerente')) return 'manager';
  return 'specialist';
}

export class AgentsImporter implements Importer {
  readonly entityType = 'agent' as const;
  private readonly logger: Logger;

  constructor(verbose: boolean) {
    this.logger = new Logger(verbose);
  }

  async run(ctx: ImporterContext): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { runId, organizationId, config } = ctx;
    const client = getSupabaseClient(config);

    if (!pathExists(config.dataRoot, AGENTS_DIR)) {
      this.logger.warn(`[agents-importer] Directorio no encontrado: ${AGENTS_DIR}`);
      return results;
    }

    let files: string[];
    try {
      safeResolvePath(config.dataRoot, AGENTS_DIR);
      files = listDirectory(config.dataRoot, AGENTS_DIR).filter((f) => f.endsWith('.md'));
    } catch {
      return results;
    }

    const limit = config.limit;
    let processed = 0;

    for (const filename of files) {
      if (limit !== null && processed >= limit) break;

      const relativePath = path.posix.join(AGENTS_DIR, filename);

      let resolvedOk = true;
      try {
        safeResolvePath(config.dataRoot, relativePath);
      } catch {
        resolvedOk = false;
      }

      if (!resolvedOk) {
        results.push(
          this.makeResult(
            runId,
            organizationId,
            relativePath,
            filename,
            null,
            'excluded-contaminated',
            'PATH_BLOCKED',
            'Ruta bloqueada',
          ),
        );
        continue;
      }

      const content = readTextFile(config.dataRoot, relativePath);
      if (content === null) continue;

      const slug = slugFromFilename(filename);
      const sourceKey = slug;
      const sourceHash = computeTextHash(content);
      const start = Date.now();

      try {
        const r = await this.persistAgent(
          client,
          runId,
          organizationId,
          relativePath,
          sourceKey,
          sourceHash,
          slug,
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
   * Persiste un agent usando persistScopedContentEntity.
   * - INSERT incluye legacy_path (inmutable por trigger).
   * - UPDATE excluye legacy_path, organization_id, slug, id, created_at.
   */
  private async persistAgent(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    slug: string,
    content: string,
    mode: string,
  ): Promise<MigrationResult['record']> {
    const now = new Date().toISOString();

    const insertPayload: Record<string, unknown> = {
      organization_id: organizationId,
      slug,
      name: nameFromContent(content, slug),
      agent_type: agentTypeFromContent(content),
      description: descriptionFromContent(content),
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
      agent_type: agentTypeFromContent(content),
      description: descriptionFromContent(content),
      content,
      is_active: true,
      migrated_at: now,
      migration_version: '4.0.0',
      source_hash: sourceHash,
    };

    const result = await persistScopedContentEntity({
      client,
      table: 'agents',
      organizationId,
      slug,
      sourceHash,
      insertPayload,
      updatePayload,
      mode,
    });

    if (result.action === 'conflict') {
      this.logger.action('conflict', 'agent', sourceKey);
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'agents',
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
          'agents',
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

    this.logger.action(result.action, 'agent', sourceKey);
    return this.makeRecord(
      runId,
      organizationId,
      sourcePath,
      sourceKey,
      sourceHash,
      'agents',
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
      entityType: 'agent',
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
        'agents',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}
