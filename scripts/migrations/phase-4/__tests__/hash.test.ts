import { describe, it, expect } from 'vitest';
import { computeHash, computeTextHash } from '../hash';

describe('computeHash', () => {
  it('produces the same hash for identical objects regardless of key order', () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(computeHash(a)).toBe(computeHash(b));
  });

  it('produces different hashes for different content', () => {
    expect(computeHash({ a: 1 })).not.toBe(computeHash({ a: 2 }));
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    const h = computeHash({ foo: 'bar' });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles nested objects deterministically', () => {
    const a = { x: { b: 2, a: 1 } };
    const b = { x: { a: 1, b: 2 } };
    expect(computeHash(a)).toBe(computeHash(b));
  });

  it('handles arrays', () => {
    expect(computeHash([1, 2, 3])).toBe(computeHash([1, 2, 3]));
    expect(computeHash([1, 2, 3])).not.toBe(computeHash([3, 2, 1]));
  });
});

describe('computeTextHash', () => {
  it('normalizes CRLF to LF', () => {
    const unix = 'hello\nworld';
    const windows = 'hello\r\nworld';
    expect(computeTextHash(unix)).toBe(computeTextHash(windows));
  });

  it('trims leading/trailing whitespace', () => {
    expect(computeTextHash('  hello  ')).toBe(computeTextHash('hello'));
  });

  it('returns a 64-char hex string', () => {
    expect(computeTextHash('test content')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different content → different hash', () => {
    expect(computeTextHash('a')).not.toBe(computeTextHash('b'));
  });
});
