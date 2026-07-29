/**
 * Danger Day: the single most honest number a paycheck-to-paycheck budget can
 * show — the exact day between now and the next paycheck when total money on
 * hand bottoms out, and what bill drives it there. Replays the current cycle
 * the same way safe-to-spend does, then walks today → payday looking for the
 * low-water mark.
 */
import { addDays, parseISO, toISO } from "./dates";
import { UNALLOCATED_KEY, generateOccurrences, runProjection } from "./projection";
import { currentPayCycle } from "./safeToSpend";
import type { Bucket, Expense, IncomeEntry, IncomeSource, Transfer } from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface DangerDayInfo {
  /** The lowest-total day between today and the day before the next payday. */
  date: string;
  /** Total money across all buckets on that day. */
  low: number;
  /** The low point dips below zero — spending money that isn't there. */
  negative: boolean;
  /** Whole days from today (0 = today is the low point). */
  daysAway: number;
  nextPayday: string;
  /** Bills landing on the danger day, largest first. */
  causes: { name: string; amount: number }[];
}

export function dangerDay(
  sources: IncomeSource[],
  buckets: Bucket[],
  expenses: Expense[],
  todayISO: string,
  incomeEntries: IncomeEntry[] = [],
  transfers: Transfer[] = [],
  /**
   * Money already in savings at the cycle's start. Without it the replay
   * assumes you began the cycle at $0, which makes any big bill look like a
   * catastrophe even when the money is sitting in the bank.
   */
  startingSavings = 0,
): DangerDayInfo | null {
  const cycle = currentPayCycle(sources, todayISO);
  if (!cycle) return null;

  const savingsBucket = buckets.find((b) => b.isSavings);
  const replay = runProjection({
    startDate: cycle.lastPayday,
    months: 1,
    incomeSources: sources,
    buckets,
    expenses,
    incomeEntries,
    transfers,
    startingBalances: {
      [savingsBucket ? savingsBucket.id : UNALLOCATED_KEY]: startingSavings,
    },
  });

  // Watch today through the day before payday (payday morning refills).
  const lastWatchISO = toISO(addDays(parseISO(cycle.nextPayday), -1));
  const window = replay.points.filter(
    (p) => p.date >= todayISO && p.date <= lastWatchISO,
  );
  if (window.length === 0) return null;

  const lowest = window.reduce((min, p) => (p.total < min.total ? p : min));

  const causes: { name: string; amount: number }[] = [];
  const day = parseISO(lowest.date);
  for (const e of expenses) {
    if (e.isPaused) continue;
    if (generateOccurrences(e.dueDate, e.cadence, day, day).length > 0) {
      causes.push({ name: e.name, amount: e.amount });
    }
  }
  causes.sort((a, b) => b.amount - a.amount);

  return {
    date: lowest.date,
    low: round2(lowest.total),
    negative: lowest.total < -0.005,
    daysAway: Math.max(
      0,
      Math.round((Date.parse(lowest.date) - Date.parse(todayISO)) / 86400000),
    ),
    nextPayday: cycle.nextPayday,
    causes,
  };
}
