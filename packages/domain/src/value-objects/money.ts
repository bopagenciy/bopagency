export type Currency = 'USD' | 'COP' | 'MXN' | 'EUR';

export type Money = {
  readonly amount: number;
  readonly currency: Currency;
};

export function money(amount: number, currency: Currency): Money {
  if (amount < 0) throw new Error('Money amount cannot be negative');
  return { amount, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add different currencies: ${a.currency} and ${b.currency}`);
  }
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function formatMoney(m: Money): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: m.currency,
  }).format(m.amount);
}
