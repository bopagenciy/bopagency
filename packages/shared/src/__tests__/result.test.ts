import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, mapResult } from '../types/result';

describe('Result', () => {
  describe('ok()', () => {
    it('creates a successful result', () => {
      const result = ok(42);
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('isOk returns true for Ok', () => {
      expect(isOk(ok('hello'))).toBe(true);
    });

    it('isErr returns false for Ok', () => {
      expect(isErr(ok('hello'))).toBe(false);
    });
  });

  describe('err()', () => {
    it('creates a failed result', () => {
      const result = err('something went wrong');
      expect(result.success).toBe(false);
      expect(result.error).toBe('something went wrong');
    });

    it('isErr returns true for Err', () => {
      expect(isErr(err('oops'))).toBe(true);
    });

    it('isOk returns false for Err', () => {
      expect(isOk(err('oops'))).toBe(false);
    });
  });

  describe('mapResult()', () => {
    it('maps over a successful result', () => {
      const result = mapResult(ok(2), (n) => n * 3);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(6);
    });

    it('passes through an error result unchanged', () => {
      const original = err('fail');
      const mapped = mapResult(original, () => 99);
      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) expect(mapped.error).toBe('fail');
    });
  });
});
