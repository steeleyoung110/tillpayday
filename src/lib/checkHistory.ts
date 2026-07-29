/**
 * Check-size history: the longitudinal view for hourly workers. The
 * short-check detector catches one bad check; this catches the slow slide.
 * Last N non-windfall logged checks, average, and a first-half vs
 * second-half trend expressed in $/month.
 */
import type { IncomeEntry } from "@/lib/engine";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface CheckHistory {
  /** Oldest → newest, capped at `limit`. */
  checks: { amount: number; date: string }[];
  average: number;
  min: number;
  max: number;
  /** $/month drift, from first-half vs second-half averages (null = flat-ish
   * or not enough span to say). */
  trendPerMonth: number | null;
}

export function checkHistory(
  entries: IncomeEntry[],
  limit = 12,
): CheckHistory | null {
  const checks = entries
    .filter((e) => !e.isWindfall && e.amount > 0)
    .sort((a, b) => (a.receivedDate < b.receivedDate ? -1 : 1))
    .slice(-limit)
    .map((e) => ({ amount: e.amount, date: e.receivedDate }));
  if (checks.length < 4) return null;

  const avg = (xs: { amount: number }[]) =>
    xs.reduce((s, x) => s + x.amount, 0) / xs.length;
  const average = round2(avg(checks));
  const amounts = checks.map((c) => c.amount);

  const half = Math.floor(checks.length / 2);
  const firstHalf = checks.slice(0, half);
  const secondHalf = checks.slice(-half);
  const midFirst = firstHalf[Math.floor(firstHalf.length / 2)];
  const midSecond = secondHalf[Math.floor(secondHalf.length / 2)];
  const monthsApart =
    (Date.parse(midSecond.date) - Date.parse(midFirst.date)) / (30.44 * 86400000);

  let trendPerMonth: number | null = null;
  if (monthsApart >= 1) {
    const drift = round2((avg(secondHalf) - avg(firstHalf)) / monthsApart);
    // Under 1% of the average per month is noise, not a trend.
    if (Math.abs(drift) >= average * 0.01) trendPerMonth = drift;
  }

  return {
    checks,
    average,
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    trendPerMonth,
  };
}
