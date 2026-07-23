/**
 * Safe-to-spend: the dashboard's hero number.
 *
 * "How much can I spend today without wrecking the plan?" = the money currently
 * sitting in *flexible* buckets (fun, groceries — not earmarked bills), divided
 * by the days remaining until the next payday. Recomputed for whatever "today"
 * is passed in: spend nothing and tomorrow's number is higher, because the same
 * balance stretches over one less day.
 *
 * The current flexible balance is simulated, not stored: we run the projection
 * from the most recent payday (when buckets were swept and refilled) through
 * today, so planned expenses that already came due are subtracted.
 */
import { addDays, diffDays, parseISO, toISO } from "./dates";
import { generatePayDates, runProjection } from "./projection";
import type { Bucket, Expense, IncomeEntry, IncomeSource } from "./types";

export interface PayCycle {
  /** Most recent payday on or before today (ISO). */
  lastPayday: string;
  /** First payday strictly after today (ISO). */
  nextPayday: string;
  /** Whole days from today until the next payday (≥ 1). */
  daysUntilPayday: number;
}

export interface SafeToSpend {
  /** Dollars per day, floored to the cent. 0 when the flexible pot is empty. */
  perDay: number;
  /** What is left across flexible buckets right now. */
  flexibleBalance: number;
  daysUntilPayday: number;
  nextPayday: string;
  /** False when no bucket is marked flexible — the UI should prompt instead. */
  hasFlexibleBuckets: boolean;
}

function floorCent(n: number): number {
  return Math.floor((n + Number.EPSILON) * 100) / 100;
}

/**
 * Find the pay cycle bracketing `today` across all paycheck sources.
 * Weekly/biweekly anchors may be in the future ("next payday"), so we step the
 * anchor backwards too rather than only projecting forward.
 */
export function currentPayCycle(
  sources: IncomeSource[],
  todayISO: string,
): PayCycle | null {
  const today = parseISO(todayISO);
  const paychecks = sources.filter((s) => s.kind === "paycheck");
  if (paychecks.length === 0) return null;

  const candidates: Date[] = [];
  for (const s of paychecks) {
    if (s.frequency === "weekly" || s.frequency === "biweekly") {
      const step = s.frequency === "weekly" ? 7 : 14;
      const anchor = parseISO(s.anchorDate);
      // k such that anchor + k*step is the last occurrence on or before today,
      // then take a neighborhood of occurrences around it.
      const k = Math.floor(diffDays(anchor, today) / step);
      for (let i = k - 1; i <= k + 2; i += 1) {
        candidates.push(addDays(anchor, i * step));
      }
    } else {
      // monthly walks backwards from its anchor already; semimonthly ignores it.
      candidates.push(
        ...generatePayDates(s, addDays(today, -45), addDays(today, 45)),
      );
    }
  }

  const past = candidates.filter((d) => d <= today);
  const future = candidates.filter((d) => d > today);
  if (past.length === 0 || future.length === 0) return null;

  const last = past.reduce((a, b) => (b > a ? b : a));
  const next = future.reduce((a, b) => (b < a ? b : a));
  return {
    lastPayday: toISO(last),
    nextPayday: toISO(next),
    daysUntilPayday: diffDays(today, next),
  };
}

/** Compute today's safe-to-spend number. Null when there is no pay cycle yet. */
export function safeToSpend(
  sources: IncomeSource[],
  buckets: Bucket[],
  expenses: Expense[],
  todayISO: string,
  incomeEntries: IncomeEntry[] = [],
): SafeToSpend | null {
  const cycle = currentPayCycle(sources, todayISO);
  if (!cycle) return null;

  const flexible = buckets.filter((b) => b.isFlexible && !b.isSavings);
  if (flexible.length === 0) {
    return {
      perDay: 0,
      flexibleBalance: 0,
      daysUntilPayday: cycle.daysUntilPayday,
      nextPayday: cycle.nextPayday,
      hasFlexibleBuckets: false,
    };
  }

  // Replay the cycle: sweep + refill on the last payday, then expenses through
  // today. One month of horizon comfortably covers any pay frequency.
  const replay = runProjection({
    startDate: cycle.lastPayday,
    months: 1,
    incomeSources: sources,
    buckets,
    expenses,
    incomeEntries, // windfalls logged this cycle count toward today's balances
  });
  const todayPoint =
    replay.points.find((p) => p.date === todayISO) ?? replay.points[0];

  const flexibleBalance = flexible.reduce(
    (sum, b) => Math.round((sum + (todayPoint.buckets[b.id] ?? 0)) * 100) / 100,
    0,
  );

  return {
    perDay:
      flexibleBalance > 0
        ? floorCent(flexibleBalance / cycle.daysUntilPayday)
        : 0,
    flexibleBalance,
    daysUntilPayday: cycle.daysUntilPayday,
    nextPayday: cycle.nextPayday,
    hasFlexibleBuckets: true,
  };
}
