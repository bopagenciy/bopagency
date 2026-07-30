import { describe, it, expect } from 'vitest';
import { money, addMoney, formatMoney } from '../value-objects/money';

describe('money value object', () => {
  it('creates a money value', () => {
    const m = money(100, 'USD');
    expect(m.amount).toBe(100);
    expect(m.currency).toBe('USD');
  });

  it('throws for negative amounts', () => {
    expect(() => money(-1, 'USD')).toThrow('negative');
  });

  it('adds two money values with same currency', () => {
    const result = addMoney(money(10, 'USD'), money(20, 'USD'));
    expect(result.amount).toBe(30);
    expect(result.currency).toBe('USD');
  });

  it('throws when adding different currencies', () => {
    expect(() => addMoney(money(10, 'USD'), money(10, 'COP'))).toThrow();
  });

  it('formats money as currency string', () => {
    const formatted = formatMoney(money(1234.56, 'USD'));
    expect(formatted).toContain('1,234.56');
  });
});
