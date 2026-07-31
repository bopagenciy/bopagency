/**
 * Phase 4 Migration — Repository root resolver
 *
 * Provides a single, robust entry-point for all path resolution.
 * Does NOT depend solely on process.cwd().
 *
 * Strategy (CommonJS equivalent of import.meta.url):
 *  - __dirname always resolves to *this file's* directory regardless of cwd.
 *  - Walk upward until we find a directory that contains:
 *      package.json  (root package)
 *      shared-data/
 *      .agencia-ai/
 *      scripts/migrations/phase-4/
 *  - Accept an optional --repository-root override from the caller.
 *
 * SECURITY: Never logs absolute paths; callers should use sanitizeLogPath().
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Directories that must exist at the repository root. */
const REQUIRED_DIRS = ['shared-data', '.agencia-ai', 'scripts/migrations/phase-4'] as const;

const MAX_WALK_DEPTH = 12;

// ─── Error class ──────────────────────────────────────────────────────────────

export class RepositoryRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryRootError';
  }
}

// ─── Root resolution ──────────────────────────────────────────────────────────

/**
 * Returns the absolute path to the repository root.
 *
 * Resolution order:
 *  1. `override` parameter (e.g. --repository-root CLI arg)
 *  2. Walk upward from this file's __dirname until all REQUIRED_DIRS are found
 *
 * Throws RepositoryRootError if neither strategy succeeds or if the found
 * root is missing any required directory.
 */
export function resolveRepositoryRoot(override?: string): string {
  if (override !== undefined && override.trim() !== '') {
    const abs = path.resolve(override);
    validateRoot(abs);
    return abs;
  }

  // Walk upward from this file's own directory (CommonJS __dirname is the
  // equivalent of path.dirname(fileURLToPath(import.meta.url)) in ESM).
  let dir = __dirname;

  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    if (isRepositoryRoot(dir)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  throw new RepositoryRootError(
    `[REPO-ROOT] No se encontró la raíz del repositorio caminando hacia arriba desde ` +
      `scripts/migrations/phase-4. Usa --repository-root para especificarla.`,
  );
}

/** Returns true when dir looks like the repo root. */
function isRepositoryRoot(dir: string): boolean {
  // Must have package.json
  if (!fs.existsSync(path.join(dir, 'package.json'))) return false;

  // Must have all required directories
  return REQUIRED_DIRS.every((rel) => fs.existsSync(path.join(dir, rel)));
}

/** Throws if `dir` is missing any required directory. */
function validateRoot(dir: string): void {
  if (!fs.existsSync(dir)) {
    throw new RepositoryRootError(`[REPO-ROOT] Directorio raíz no existe: ${dir}`);
  }

  const missing = REQUIRED_DIRS.filter((rel) => !fs.existsSync(path.join(dir, rel)));

  if (missing.length > 0) {
    throw new RepositoryRootError(
      `[REPO-ROOT] Directorios requeridos no encontrados en la raíz: ${missing.join(', ')}`,
    );
  }
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves a path inside shared-data/.
 * Example: resolveSharedDataPath(root, 'clients-index.json')
 *          → /abs/path/to/repo/shared-data/clients-index.json
 */
export function resolveSharedDataPath(root: string, ...parts: string[]): string {
  return path.join(root, 'shared-data', ...parts);
}

/**
 * Resolves a path inside .agencia-ai/.
 * Example: resolveAgencyAiPath(root, 'clients', 'legalink-col', 'client.json')
 */
export function resolveAgencyAiPath(root: string, ...parts: string[]): string {
  return path.join(root, '.agencia-ai', ...parts);
}

/**
 * Resolves a path inside migration-output/.
 * Creates the directory if it does not exist.
 */
export function resolveMigrationOutputPath(root: string, ...parts: string[]): string {
  const base = path.join(root, 'migration-output');
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, ...parts);
}

// ─── Log safety ───────────────────────────────────────────────────────────────

/**
 * Converts an absolute path to a repo-relative path for safe logging.
 * If the path is outside the repo root, returns just the basename.
 *
 * Examples:
 *   /abs/repo/shared-data/foo.json → shared-data/foo.json
 *   /abs/repo/.agencia-ai/clients/legalink-col → .agencia-ai/clients/legalink-col
 */
export function sanitizeLogPath(absolute: string, root: string): string {
  const rel = path.relative(root, absolute);
  return rel.startsWith('..') ? path.basename(absolute) : rel;
}
