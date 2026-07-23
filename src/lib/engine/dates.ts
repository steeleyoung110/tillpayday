/**
 * Date helpers for the projection engine.
 *
 * We represent every date as an ISO "YYYY-MM-DD" string on the outside, and as a
 * UTC `Date` internally. Working in UTC keeps the math free of timezone and
 * daylight-saving surprises (a "day" is always exactly 24h).
 */

/** Parse a "YYYY-MM-DD" string into a UTC Date at midnight. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a UTC Date back to a "YYYY-MM-DD" string. */
export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Days in a given month (month is 0-indexed, matching Date.getUTCMonth). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Return a new Date `n` days after `date`. */
export function addDays(date: Date, n: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/**
 * Return a new Date `n` months after `date`, clamping the day-of-month to the
 * last valid day of the target month (so Jan 31 + 1 month => Feb 28/29).
 */
export function addMonths(date: Date, n: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + n;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

/** Whole number of days from `a` to `b` (b - a). Negative if b is before a. */
export function diffDays(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** True if two dates fall on the same UTC calendar day. */
export function sameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
}
