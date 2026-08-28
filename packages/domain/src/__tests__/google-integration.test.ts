import { describe, it, expect } from 'vitest';
import { normalizeCustomerId, formatCustomerIdForDisplay } from '../entities/google-integration';

describe('Google Integration Domain Invariants', () => {
  describe('normalizeCustomerId', () => {
    it('normalizes formatted customer ID to 10 digits', () => {
      expect(normalizeCustomerId('123-456-7890')).toBe('1234567890');
      expect(normalizeCustomerId('123 456 7890')).toBe('1234567890');
      expect(normalizeCustomerId('1234567890')).toBe('1234567890');
    });

    it('throws error if customer ID is not 10 digits', () => {
      expect(() => normalizeCustomerId('12345')).toThrow('Invalid Google Customer ID format');
      expect(() => normalizeCustomerId('123456789012')).toThrow('Invalid Google Customer ID format');
    });
  });

  describe('formatCustomerIdForDisplay', () => {
    it('formats 10-digit customer ID with standard hyphens', () => {
      expect(formatCustomerIdForDisplay('1234567890')).toBe('123-456-7890');
    });
  });
});
