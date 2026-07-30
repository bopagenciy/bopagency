export type DateRange = {
  readonly from: Date;
  readonly to: Date;
};

export function dateRange(from: Date, to: Date): DateRange {
  if (from > to) throw new Error('DateRange: from must be before to');
  return { from, to };
}

export function dateRangeFromStrings(from: string, to: string): DateRange {
  return dateRange(new Date(from), new Date(to));
}

export function isDateInRange(date: Date, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

export function daysInRange(range: DateRange): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((range.to.getTime() - range.from.getTime()) / msPerDay);
}
