/**
 * Phase 4 — repository-root adapter tests
 *
 * Tests resolveRepositoryRoot() from different simulated locations,
 * path helpers, and safety checks.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  resolveRepositoryRoot,
  resolveSharedDataPath,
  resolveAgencyAiPath,
  resolveMigrationOutputPath,
  sanitizeLogPath,
  RepositoryRootError,
} from '../adapters/repository-root';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal fake repo root in a temp dir. */
function makeFakeRoot(
  opts: {
    hasPackageJson?: boolean;
    hasSharedData?: boolean;
    hasAgenciaAi?: boolean;
    hasMigrationsDir?: boolean;
  } = {},
): string {
  const {
    hasPackageJson = true,
    hasSharedData = true,
    hasAgenciaAi = true,
    hasMigrationsDir = true,
  } = opts;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bop-repo-'));

  if (hasPackageJson) fs.writeFileSync(path.join(root, 'package.json'), '{"name":"test"}');
  if (hasSharedData) fs.mkdirSync(path.join(root, 'shared-data'), { recursive: true });
  if (hasAgenciaAi) fs.mkdirSync(path.join(root, '.agencia-ai'), { recursive: true });
  if (hasMigrationsDir)
    fs.mkdirSync(path.join(root, 'scripts', 'migrations', 'phase-4'), { recursive: true });

  return root;
}

// ── resolveRepositoryRoot() ───────────────────────────────────────────────────

describe('resolveRepositoryRoot()', () => {
  it('resolves from the real BopIAgency root using the override param', () => {
    // The real BopIAgency root contains shared-data/, .agencia-ai/, etc.
    // We can find it by walking up from __dirname in this test file:
    //   __dirname = BopIAgency/scripts/migrations/phase-4/__tests__
    const realRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const resolved = resolveRepositoryRoot(realRoot);
    expect(resolved).toBe(path.resolve(realRoot));
  });

  it('auto-discovers the repo root when called with no override', () => {
    // resolveRepositoryRoot() walks up from adapters/repository-root.ts location
    const discovered = resolveRepositoryRoot();
    expect(fs.existsSync(path.join(discovered, 'shared-data'))).toBe(true);
    expect(fs.existsSync(path.join(discovered, '.agencia-ai'))).toBe(true);
    expect(fs.existsSync(path.join(discovered, 'scripts', 'migrations', 'phase-4'))).toBe(true);
  });

  it('accepts --repository-root override pointing to a valid root', () => {
    const fakeRoot = makeFakeRoot();
    try {
      const resolved = resolveRepositoryRoot(fakeRoot);
      expect(resolved).toBe(fakeRoot);
    } finally {
      fs.rmSync(fakeRoot, { recursive: true, force: true });
    }
  });

  it('throws RepositoryRootError when shared-data is missing', () => {
    const fakeRoot = makeFakeRoot({ hasSharedData: false });
    try {
      expect(() => resolveRepositoryRoot(fakeRoot)).toThrow(RepositoryRootError);
    } finally {
      fs.rmSync(fakeRoot, { recursive: true, force: true });
    }
  });

  it('throws RepositoryRootError when .agencia-ai is missing', () => {
    const fakeRoot = makeFakeRoot({ hasAgenciaAi: false });
    try {
      expect(() => resolveRepositoryRoot(fakeRoot)).toThrow(RepositoryRootError);
    } finally {
      fs.rmSync(fakeRoot, { recursive: true, force: true });
    }
  });

  it('throws RepositoryRootError when override path does not exist', () => {
    expect(() => resolveRepositoryRoot('/nonexistent/path/that/cant/exist')).toThrow(
      RepositoryRootError,
    );
  });

  it('clients-index.json is found in the resolved shared-data dir', () => {
    const root = resolveRepositoryRoot();
    const indexPath = path.join(root, 'shared-data', 'clients-index.json');
    expect(fs.existsSync(indexPath)).toBe(true);
  });
});

// ── Path helpers ──────────────────────────────────────────────────────────────

describe('resolveSharedDataPath()', () => {
  it('joins root + shared-data + parts', () => {
    const result = resolveSharedDataPath('/repo', 'clients-index.json');
    expect(result).toBe(path.join('/repo', 'shared-data', 'clients-index.json'));
  });

  it('handles nested parts', () => {
    const result = resolveSharedDataPath('/repo', 'alerts', 'alert-state.json');
    expect(result).toBe(path.join('/repo', 'shared-data', 'alerts', 'alert-state.json'));
  });
});

describe('resolveAgencyAiPath()', () => {
  it('joins root + .agencia-ai + parts', () => {
    const result = resolveAgencyAiPath('/repo', 'clients', 'legalink-col', 'client.json');
    expect(result).toBe(
      path.join('/repo', '.agencia-ai', 'clients', 'legalink-col', 'client.json'),
    );
  });
});

describe('resolveMigrationOutputPath()', () => {
  it('creates migration-output dir and joins parts', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bop-output-'));
    try {
      const result = resolveMigrationOutputPath(tmp, 'report.json');
      expect(result).toBe(path.join(tmp, 'migration-output', 'report.json'));
      expect(fs.existsSync(path.join(tmp, 'migration-output'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── sanitizeLogPath() ─────────────────────────────────────────────────────────

describe('sanitizeLogPath()', () => {
  it('returns repo-relative path for paths inside root', () => {
    const root = '/home/user/repo';
    const abs = '/home/user/repo/shared-data/clients-index.json';
    expect(sanitizeLogPath(abs, root)).toBe(path.join('shared-data', 'clients-index.json'));
  });

  it('returns basename for paths outside root', () => {
    const root = '/home/user/repo';
    const abs = '/etc/passwd';
    expect(sanitizeLogPath(abs, root)).toBe('passwd');
  });

  it('handles .agencia-ai paths correctly', () => {
    const root = '/repo';
    const abs = '/repo/.agencia-ai/clients/legalink-col';
    const result = sanitizeLogPath(abs, root);
    expect(result).toContain('legalink-col');
    expect(result.startsWith('..')).toBe(false);
  });
});
