/**
 * Payday recap: the numbers behind the celebration screen (and, later, the
 * recap email). Pure — same inputs, same answer.
 *
 * For the most recent payday we report:
 *   - `swept`: what was left in spending buckets the night before, i.e. the
 *     money you didn't spend last cycle, which the payday sweep moved into
 *     savings ("You didn't spend $147 last cycle — it's in savings now").
 *   - `savingsTotal`: the savings balance as of `today`, after that payday's
 *     sweep and leftover landed.
 */
import { addDays, parseISO, toISO } from "./dates";
import { runProjection } from "./projection";
import { currentPayCycle } from "./safeToSpend";
import type { Bucket, Expense, IncomeEntry, IncomeSource } from "./types";

export interface PaydayRecap {
  /** The payday being celebrated (ISO). */
  payday: string;
  /** Net amount the sweep moved to savings (can be ≤ 0 after an overdraft). */
  swept: number;
  /** Savings balance as of `today`. */
  savingsTotal: number;
}

/** Recap of the most recent payday, or null when there is no pay cycle. */
export function paydayRecap(
  sources: IncomeSource[],
  buckets: Bucket[],
  expenses: Expense[],
  startingSavings: number,
  todayISO: string,
  incomeEntries: IncomeEntry[] = [],
): PaydayRecap | null {
  const cycle = currentPayCycle(sources, todayISO);
  if (!cycle) return null;
  const payday = cycle.lastPayday;

  // The cycle that ENDED on that payday started at the payday before it.
  const prior = currentPayCycle(sources, toISO(addDays(parseISO(payday), -1)));
  if (!prior) return null;

  const savings = buckets.find((b) => b.isSavings);
  const replay = runProjection({
    startDate: prior.lastPayday,
    months: 3, // comfortably covers two cycles of any frequency
    startingBalances: savings ? { [savings.id]: startingSavings } : undefined,
    incomeSources: sources,
    buckets,
    expenses,
    incomeEntries,
  });

  // Balances at the end of the night before the payday = what the sweep moved.
  // Sinking funds don't sweep, so they don't count toward "you didn't spend".
  const eveISO = toISO(addDays(parseISO(payday), -1));
  const eve = replay.points.find((p) => p.date === eveISO);
  const spending = buckets.filter((b) => !b.isSavings && !b.rollsOver);
  const swept = eve
    ? spending.reduce(
        (sum, b) => Math.round((sum + (eve.buckets[b.id] ?? 0)) * 100) / 100,
        0,
      )
    : 0;

  const todayPoint =
    replay.points.find((p) => p.date === todayISO) ??
    replay.points[replay.points.length - 1];

  return { payday, swept, savingsTotal: todayPoint.savings };
}
