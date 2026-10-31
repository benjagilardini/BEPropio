export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function subtractMonths(date: Date, months: number): Date {
  return addMonths(date, -months);
}

export function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

export function daysBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function formatPeriod(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatDateBcra(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function getRequiredPeriods(
  indexType: 'IPC' | 'ICL' | 'UVA',
  from: Date,
  to: Date,
): string[] {
  if (indexType === 'IPC') {
    return [formatPeriod(from), formatPeriod(subtractMonths(to, 1))];
  }
  return [formatDateISO(from), formatDateISO(to)];
}
