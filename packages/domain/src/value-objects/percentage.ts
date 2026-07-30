/** A percentage value from 0 to 100 */
export type Percentage = number & { readonly _brand: 'Percentage' };

export function percentage(value: number): Percentage {
  if (value < 0 || value > 100) {
    throw new Error(`Percentage must be between 0 and 100, got ${value}`);
  }
  return value as Percentage;
}

export function percentageFromDecimal(decimal: number): Percentage {
  return percentage(decimal * 100);
}

export function formatPercentage(p: Percentage, decimals = 1): string {
  return `${p.toFixed(decimals)}%`;
}
