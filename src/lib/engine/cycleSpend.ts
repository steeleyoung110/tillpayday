/**
 * What's actually been spent this pay cycle (phase: actuals vs plan).
 * "Spent" = expenses that came due between the last payday and today,
 * grouped by the bucket they drew from. Pure and unit-tested.
 */
import { parseISO } from "./dates";
import { generateOccurrences } from "./projection";
import { currentPayCycle } from "./safeToSpend";
import type { Expense, IncomeSource } from "./types";

export interface CycleSpend {
  /** The cycle started here (last payday, ISO). */
  since: string;
  nextPayday: string;
  daysUntilPayday: number;
  /** Total spent so far this cycle. */
  total: number;
  /** Per-bucket totals (bucketId null = savings/leftover). */
  byBucket: { bucketId: string | null; amount: number }[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function cycleSpending(
  sources: IncomeSource[],
  expenses: Expense[],
  todayISO: string,
): CycleSpend | null {
  const cycle = currentPayCycle(sources, todayISO);
  if (!cycle) return null;

  const start = parseISO(cycle.lastPayday);
  const today = parseISO(todayISO);
  const sums = new Map<string | null, number>();
  let total = 0;

  for (const e of expenses) {
    if (e.isPaused) continue;
    const hits = generateOccurrences(e.dueDate, e.cadence, start, today).length;
    if (hits === 0) continue;
    const amount = round2(hits * e.amount);
    total = round2(total + amount);
    sums.set(e.bucketId, round2((sums.get(e.bucketId) ?? 0) + amount));
  }

  return {
    since: cycle.lastPayday,
    nextPayday: cycle.nextPayday,
    daysUntilPayday: cycle.daysUntilPayday,
    total,
    byBucket: [...sums.entries()]
      .map(([bucketId, amount]) => ({ bucketId, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}
