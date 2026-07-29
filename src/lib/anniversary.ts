/**
 * Anniversary report: the zoomed-out proof the grind is working. Shows for
 * 14 days after crossing a milestone month-count (3, 6, 12, 18, 24, 36…).
 */

export const MILESTONE_MONTHS = [3, 6, 12, 18, 24, 36, 48, 60];

export interface AnniversaryWindow {
  months: number;
  /** The date the milestone was crossed. */
  crossedISO: string;
}

/** Whole months between two ISO dates (calendar-aware enough: 30.44d). */
function monthsBetween(fromISO: string, toISO: string): number {
  return Math.floor(
    (Date.parse(toISO) - Date.parse(fromISO)) / (30.44 * 86400000),
  );
}

/**
 * The milestone to celebrate right now, or null. `signupISO` is the account
 * creation date; the card shows for 14 days after each crossing.
 */
export function anniversaryWindow(
  signupISO: string,
  todayISO: string,
): AnniversaryWindow | null {
  const months = monthsBetween(signupISO, todayISO);
  const milestone = [...MILESTONE_MONTHS].reverse().find((m) => months >= m);
  if (!milestone) return null;
  const crossedMs = Date.parse(signupISO) + milestone * 30.44 * 86400000;
  const daysSinceCrossing = (Date.parse(todayISO) - crossedMs) / 86400000;
  if (daysSinceCrossing < 0 || daysSinceCrossing > 14) return null;
  return {
    months: milestone,
    crossedISO: new Date(crossedMs).toISOString().slice(0, 10),
  };
}
