/**
 * Phase 4 Migration — Filesystem adapter
 *
 * SECURITY:
 * - safeResolvePath() blocks path traversal, quarantine paths, and backups.
 * - All file reads go through this adapter; never use fs.readFile directly.
 * - No secrets are read or logged from file contents.
 */

import * as fs from 'fs';
import * as path from 'path';

const BLOCKED_SEGMENTS = ['quarantine', 'QUARANTINE', 'backups', 'BACKUPS', '.git'];

/**
 * Resolves a path relative to base and verifies it's safe.
 * Throws if path traversal or blocked segments are detected.
 */
export function safeResolvePath(base: string, relative: string): string {
  const resolved = path.resolve(base, relative);
  const resolvedBase = path.resolve(base);

  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`[SECURITY] Path traversal detectado: ${relative}`);
  }

  const segments = resolved.split(path.sep);
  for (const blocked of BLOCKED_SEGMENTS) {
    if (segments.includes(blocked)) {
      throw new Error(`[SECURITY] Segmento de ruta bloqueado (${blocked}): ${resolved}`);
    }
  }

  // Check for CONTAMINATED anywhere in the path
  if (resolved.includes('CONTAMINATED')) {
    throw new Error(`[SECURITY] Archivo contaminado bloqueado: ${resolved}`);
  }

  return resolved;
}

/** Returns true if path is safe (no throws) */
export function isPathSafe(base: string, relative: string): boolean {
  try {
    safeResolvePath(base, relative);
    return true;
  } catch {
    return false;
  }
}

/** Reads JSON file safely. Returns null if file doesn't exist. */
export function readJsonFile<T>(base: string, relative: string): T | null {
  const resolved = safeResolvePath(base, relative);

  if (!fs.existsSync(resolved)) return null;

  const raw = fs.readFileSync(resolved, 'utf-8');
  return JSON.parse(raw) as T;
}

/** Reads text file safely. Returns null if file doesn't exist. */
export function readTextFile(base: string, relative: string): string | null {
  const resolved = safeResolvePath(base, relative);
  if (!fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved, 'utf-8');
}

/** Returns an array of filenames in a directory (non-recursive). */
export function listDirectory(base: string, relative: string): string[] {
  const resolved = safeResolvePath(base, relative);
  if (!fs.existsSync(resolved)) return [];
  return fs.readdirSync(resolved);
}

/** Returns true if a file or directory exists at the resolved path. */
export function pathExists(base: string, relative: string): boolean {
  try {
    const resolved = safeResolvePath(base, relative);
    return fs.existsSync(resolved);
  } catch {
    return false;
  }
}

/** Returns all .md files in a directory (non-recursive). */
export function listMarkdownFiles(base: string, relative: string): string[] {
  const entries = listDirectory(base, relative);
  return entries.filter((f) => f.endsWith('.md'));
}
