/**
 * Dates as time, not as calendar coordinates. "2026-08-15" makes you count on
 * your fingers; "in 6 days" is the thing you actually wanted to know. Used
 * everywhere the user reads about paydays and due dates.
 */

const MS_DAY = 86400000;

/** Whole days from today to `iso` (negative = past). */
export function daysFromToday(iso: string, todayISO: string): number {
  return Math.round((Date.parse(iso) - Date.parse(todayISO)) / MS_DAY);
}

/**
 * "today", "tomorrow", "in 6 days", "yesterday", "6 days ago".
 * Past a month it switches to weeks, then months, so nobody reads "in 84 days".
 */
export function relativeDay(iso: string, todayISO: string): string {
  const d = daysFromToday(iso, todayISO);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";

  const ahead = d > 0;
  const n = Math.abs(d);
  const phrase = (value: number, unit: string) =>
    `${ahead ? "in " : ""}${value} ${unit}${value === 1 ? "" : "s"}${ahead ? "" : " ago"}`;

  if (n < 28) return phrase(n, "day");
  if (n < 60) return phrase(Math.round(n / 7), "week");
  return phrase(Math.round(n / 30.44), "month");
}

/**
 * Relative phrase with the calendar date kept as a quiet aside, for places
 * where someone genuinely needs to look it up on a statement:
 * "in 6 days (Aug 15)".
 */
export function relativeDayWithDate(iso: string, todayISO: string): string {
  return `${relativeDay(iso, todayISO)} (${prettyDate(iso)})`;
}

/** "Aug 15" — short, unambiguous, no year unless it isn't this year. */
export function prettyDate(iso: string, todayISO?: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const sameYear = todayISO ? iso.slice(0, 4) === todayISO.slice(0, 4) : true;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}
