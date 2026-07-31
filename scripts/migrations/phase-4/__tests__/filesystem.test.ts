import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { safeResolvePath, isPathSafe } from '../adapters/filesystem';

describe('safeResolvePath', () => {
  const base = os.tmpdir();

  it('resolves a safe relative path', () => {
    const resolved = safeResolvePath(base, 'some/safe/file.json');
    expect(resolved).toBe(path.resolve(base, 'some/safe/file.json'));
  });

  it('throws on path traversal attempt', () => {
    expect(() => safeResolvePath(base, '../etc/passwd')).toThrow(/traversal/i);
  });

  it('throws on quarantine segment', () => {
    expect(() => safeResolvePath(base, 'clients/quarantine/data.json')).toThrow(/quarantine/i);
  });

  it('throws on CONTAMINATED in path', () => {
    expect(() => safeResolvePath(base, 'clients/CONTAMINATED-file.json')).toThrow(/contaminado/i);
  });

  it('throws on backups segment', () => {
    expect(() => safeResolvePath(base, 'backups/old.json')).toThrow(/backup/i);
  });
});

describe('isPathSafe', () => {
  const base = os.tmpdir();

  it('returns true for safe paths', () => {
    expect(isPathSafe(base, 'safe/path.json')).toBe(true);
  });

  it('returns false for traversal', () => {
    expect(isPathSafe(base, '../../etc/passwd')).toBe(false);
  });

  it('returns false for quarantine', () => {
    expect(isPathSafe(base, 'clients/quarantine/x.json')).toBe(false);
  });
});
