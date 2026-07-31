/**
 * Phase 4 — Skills Importer
 *
 * Source:  .agencia-ai/.claude/skills/{slug}/SKILL.md (or *.md)
 * Target:  public.skills
 * Key:     organization_id + slug
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import { computeTextHash } from '../hash';
import { Logger } from '../logger';
import { listDirectory, pathExists, readTextFile, safeResolvePath } from '../adapters/filesystem';
import { getSupabaseClient } from '../adapters/supabase';
import type { Importer, ImporterContext, MigrationAction, MigrationResult } from '../types';

const SKILLS_DIR = '.agencia-ai/.claude/skills';

function slugFromDir(dirname: string): string {
  return dirname.toLowerCase().replace(/[^a-z0-9-]/g, '-');
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
    if (line && !line.startsWith('#') && !line.startsWith('---')) return line.slice(0, 500);
  }
  return null;
}

export class SkillsImporter implements Importer {
  readonly entityType = 'skill' as const;
  private readonly logger: Logger;

  constructor(verbose: boolean) {
    this.logger = new Logger(verbose);
  }

  async run(ctx: ImporterContext): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { runId, organizationId, config } = ctx;
    const client = getSupabaseClient(config);

    if (!pathExists(config.dataRoot, SKILLS_DIR)) {
      this.logger.warn(`[skills-importer] Directorio no encontrado: ${SKILLS_DIR}`);
      return results;
    }

    const subdirs = listDirectory(config.dataRoot, SKILLS_DIR);
    const limit = config.limit;
    let processed = 0;

    for (const subdir of subdirs) {
      if (limit !== null && processed >= limit) break;

      const skillDir = path.posix.join(SKILLS_DIR, subdir);

      let dirSafe = true;
      try {
        safeResolvePath(config.dataRoot, skillDir);
      } catch {
        dirSafe = false;
      }
      if (!dirSafe) continue;

      // Try SKILL.md first, then any .md file
      const candidates = ['SKILL.md', `${subdir}.md`, 'README.md'];
      let content: string | null = null;
      let usedFile = '';

      for (const candidate of candidates) {
        const candidatePath = path.posix.join(skillDir, candidate);
        if (pathExists(config.dataRoot, candidatePath)) {
          content = readTextFile(config.dataRoot, candidatePath);
          usedFile = candidate;
          break;
        }
      }

      // If subdir is actually a file (flat structure)
      if (content === null && subdir.endsWith('.md')) {
        const flatPath = path.posix.join(SKILLS_DIR, subdir);
        content = readTextFile(config.dataRoot, flatPath);
        usedFile = subdir;
      }

      if (content === null) {
        this.logger.debug(`[skills-importer] No se encontró contenido para: ${subdir}`);
        continue;
      }

      const slug = slugFromDir(subdir.replace(/\.md$/, ''));
      const sourceKey = slug;
      const sourcePath = path.posix.join(skillDir, usedFile);
      const sourceHash = computeTextHash(content);
      const start = Date.now();

      try {
        const r = await this.upsertSkill(
          client,
          runId,
          organizationId,
          sourcePath,
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

  private async upsertSkill(
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
    const { data: existing } = await client
      .from('migration_records')
      .select('source_hash, target_id')
      .eq('organization_id', organizationId)
      .eq('source_key', sourceKey)
      .eq('target_table', 'skills')
      .eq('action', 'insert')
      .maybeSingle();

    if (existing && (existing as { source_hash: string }).source_hash === sourceHash) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'skills',
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
        'skills',
        null,
        'insert',
        null,
        null,
      );
    }

    const { data: inserted, error } = await client
      .from('skills')
      .upsert(
        {
          organization_id: organizationId,
          slug,
          name: nameFromContent(content, slug),
          description: descriptionFromContent(content),
          content,
          is_global: false,
          is_active: true,
          legacy_path: sourcePath,
          migrated_at: new Date().toISOString(),
          migration_version: '4.0.0',
          source_hash: sourceHash,
        },
        { onConflict: 'organization_id,slug' },
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
        'skills',
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
      'skills',
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
      entityType: 'skill',
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
        'skills',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}
