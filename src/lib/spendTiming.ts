/**
 * Spend timing: WHEN the money leaves, not just where. Two honest lenses:
 *  - payday proximity: what share of your spending happens in the first
 *    72 hours after a check lands (that's where budgets die)
 *  - weekday pattern: which day of the week does the damage
 * Uses one-time spends against the real payday lattice.
 */
import {
  addDays,
  generatePayDates,
  parseISO,
  toISO,
  type IncomeSource,
} from "@/lib/engine";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface SpendTiming {
  /** Share (0–100) of spend dollars in days 0–2 after a payday. */
  first72Pct: number;
  first72Total: number;
  total: number;
  spendCount: number;
  /** Sunday-first totals by weekday. */
  byWeekday: number[];
  /** Heaviest weekday (0=Sun) — null if nothing spent. */
  heaviestWeekday: number | null;
}

export function spendTiming(
  sources: IncomeSource[],
  spends: { amount: number; due_date: string; cadence: string; is_paused?: boolean }[],
  todayISO: string,
  windowDays = 90,
): SpendTiming | null {
  const cutoffISO = toISO(addDays(parseISO(todayISO), -windowDays));
  const rows = spends.filter(
    (s) =>
      s.cadence === "one_time" &&
      !s.is_paused &&
      Number(s.amount) > 0 &&
      s.due_date > cutoffISO &&
      s.due_date <= todayISO,
  );
  if (rows.length < 5) return null;

  // Payday lattice covering the window (with margin for "days since").
  const paydays = new Set<string>();
  for (const src of sources) {
    if (src.kind !== "paycheck" || src.frequency === "irregular") continue;
    for (const d of generatePayDates(
      src,
      addDays(parseISO(cutoffISO), -45),
      parseISO(todayISO),
    )) {
      paydays.add(toISO(d));
    }
  }
  if (paydays.size === 0) return null;
  const paydayList = [...paydays].sort();

  let total = 0;
  let first72 = 0;
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const s of rows) {
    const amount = Number(s.amount);
    total += amount;
    byWeekday[parseISO(s.due_date).getUTCDay()] += amount;
    const lastPayday = [...paydayList].reverse().find((p) => p <= s.due_date);
    if (lastPayday) {
      const offset = Math.round(
        (Date.parse(s.due_date) - Date.parse(lastPayday)) / 86400000,
      );
      if (offset <= 2) first72 += amount;
    }
  }
  if (!(total > 0)) return null;

  const max = Math.max(...byWeekday);
  return {
    first72Pct: Math.round((first72 / total) * 100),
    first72Total: round2(first72),
    total: round2(total),
    spendCount: rows.length,
    byWeekday: byWeekday.map(round2),
    heaviestWeekday: max > 0 ? byWeekday.indexOf(max) : null,
  };
}
