/**
 * Honest-mirror insights: the runway number ("if your paycheck stopped today,
 * how long would you last?") and spending anomalies measured against your own
 * history — never someone else's idea of normal. Pure functions.
 */
import { addDays, diffDays, parseISO, toISO } from "./dates";
import { generateOccurrences, generatePayDates } from "./projection";
import type { CycleRecord } from "./cycleHistory";
import type { CycleSpend } from "./cycleSpend";
import type { Expense, IncomeEntry, IncomeSource } from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface Runway {
  /** Whole days the money on hand lasts at your real spending pace. */
  days: number;
  /** Dollars per day you actually spend (across completed cycles). */
  avgDailySpend: number;
  /** Total money on hand used for the math. */
  liquid: number;
}

/**
 * Runway from completed cycle history: total actually spent ÷ total days
 * gives the real daily burn; liquid ÷ burn is how long you'd last with no
 * income. Null when there's no spending history to measure against (a $0
 * burn isn't "infinite runway", it's "no data yet").
 */
export function runway(
  liquid: number,
  cycles: CycleRecord[],
): Runway | null {
  const totalSpent = cycles.reduce((s, c) => s + c.totalActual, 0);
  const totalDays = cycles.reduce(
    (s, c) => s + diffDays(parseISO(c.cycleStart), parseISO(c.cycleEnd)),
    0,
  );
  if (totalDays <= 0 || totalSpent <= 0) return null;
  const avgDailySpend = round2(totalSpent / totalDays);
  return {
    days: liquid > 0 ? Math.floor(liquid / avgDailySpend) : 0,
    avgDailySpend,
    liquid: round2(liquid),
  };
}

export interface AgeOfMoney {
  /** Average age, in days, of the dollars your recent spending consumed. */
  days: number;
  /** How many outflows the average is built on (≤ 10). */
  sampleSize: number;
}

/**
 * Age of Money (the YNAB signature, honest edition): line up every dollar
 * that arrived (paychecks on the schedule + logged income) and every dollar
 * that left (expense occurrences), consume income FIFO, and report the
 * average age of the dollars consumed by the last up-to-10 outflows. A young
 * number means you're spending money the day it lands — paycheck to
 * paycheck. Watching it grow IS breaking the cycle. Null until there are at
 * least 3 outflows to measure.
 */
export function ageOfMoney(
  income: IncomeSource[],
  entries: IncomeEntry[],
  expenses: Expense[],
  todayISO: string,
  lookbackDays = 180,
): AgeOfMoney | null {
  const end = parseISO(todayISO);
  const start = addDays(end, -lookbackDays);

  const inflows: { date: string; amount: number }[] = [];
  for (const src of income) {
    if (src.kind !== "paycheck") continue;
    for (const d of generatePayDates(src, start, end)) {
      inflows.push({ date: toISO(d), amount: src.amount });
    }
  }
  for (const e of entries) {
    if (e.receivedDate >= toISO(start) && e.receivedDate <= todayISO) {
      inflows.push({ date: e.receivedDate, amount: e.amount });
    }
  }
  inflows.sort((a, b) => a.date.localeCompare(b.date));

  const outflows: { date: string; amount: number }[] = [];
  for (const e of expenses) {
    if (e.isPaused) continue;
    for (const d of generateOccurrences(e.dueDate, e.cadence, start, end)) {
      outflows.push({ date: toISO(d), amount: e.amount });
    }
  }
  outflows.sort((a, b) => a.date.localeCompare(b.date));
  if (outflows.length < 3 || inflows.length === 0) return null;

  // FIFO: each outflow consumes the oldest income dollars still unspent.
  // Track the dollar-weighted age per outflow.
  let idx = 0;
  let remainingInCurrent = inflows[0]?.amount ?? 0;
  const perOutflowAge: number[] = [];
  for (const out of outflows) {
    let need = out.amount;
    let weighted = 0;
    let consumed = 0;
    while (need > 0 && idx < inflows.length) {
      const take = Math.min(need, remainingInCurrent);
      if (take > 0) {
        const age = Math.max(
          0,
          diffDays(parseISO(inflows[idx].date), parseISO(out.date)),
        );
        weighted += age * take;
        consumed += take;
        need -= take;
        remainingInCurrent -= take;
      }
      if (remainingInCurrent <= 0) {
        idx += 1;
        remainingInCurrent = inflows[idx]?.amount ?? 0;
      }
      if (idx >= inflows.length) break;
    }
    if (consumed > 0) perOutflowAge.push(weighted / consumed);
  }
  if (perOutflowAge.length < 3) return null;

  const sample = perOutflowAge.slice(-10);
  return {
    days: Math.round(sample.reduce((s, a) => s + a, 0) / sample.length),
    sampleSize: sample.length,
  };
}

export interface NoSpendStreak {
  /** Consecutive days (ending yesterday) with zero fun-money spending. */
  current: number;
  /** Longest such run in the lookback window. */
  best: number;
  /** True when there was a fun spend today — the streak is dead, say so. */
  brokeToday: boolean;
}

/**
 * Days without touching fun money. The current streak counts back from
 * yesterday (today only kills it, it can't extend it until it's over), and
 * a spend TODAY is reported bluntly. Null when there are no flexible buckets
 * or no history window to judge.
 */
export function noSpendStreak(
  expenses: Expense[],
  funBucketIds: Set<string>,
  todayISO: string,
  lookbackDays = 90,
): NoSpendStreak | null {
  if (funBucketIds.size === 0) return null;
  const end = parseISO(todayISO);
  const start = addDays(end, -lookbackDays);

  const spendDays = new Set<string>();
  for (const e of expenses) {
    if (e.isPaused || !e.bucketId || !funBucketIds.has(e.bucketId)) continue;
    for (const d of generateOccurrences(e.dueDate, e.cadence, start, end)) {
      spendDays.add(toISO(d));
    }
  }

  const brokeToday = spendDays.has(todayISO);
  let current = 0;
  for (let d = addDays(end, -1); d >= start; d = addDays(d, -1)) {
    if (spendDays.has(toISO(d))) break;
    current += 1;
  }

  let best = 0;
  let run = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (spendDays.has(toISO(d))) {
      best = Math.max(best, run);
      run = 0;
    } else {
      run += 1;
    }
  }
  best = Math.max(best, run, current);

  return { current, best, brokeToday };
}

export interface BucketPace {
  /** Percent of this bucket's plan already spent (can exceed 100). */
  spentPct: number;
  /** Percent of the pay cycle already elapsed. */
  elapsedPct: number;
  status: "hot" | "cool" | "steady" | "spent";
}

/**
 * Is a bucket burning faster than the calendar? Spending 68% of the plan
 * when only 40% of the cycle has passed is "hot" — the honest early warning
 * before the overdraft popup ever fires. ±15 points of the elapsed line
 * counts as steady. Null when the bucket has no plan to pace against.
 */
export function bucketPace(
  spent: number,
  planned: number,
  elapsedFraction: number,
): BucketPace | null {
  if (planned <= 0) return null;
  const spentPct = Math.round((spent / planned) * 100);
  const elapsedPct = Math.round(Math.min(Math.max(elapsedFraction, 0), 1) * 100);
  const status =
    spentPct >= 100
      ? "spent"
      : spentPct > elapsedPct + 15
        ? "hot"
        : spentPct < elapsedPct - 15
          ? "cool"
          : "steady";
  return { spentPct, elapsedPct, status };
}

export interface SpendAnomaly {
  bucketId: string | null;
  bucketName: string;
  /** Spent so far THIS cycle. */
  current: number;
  /** Your own average per completed cycle. */
  average: number;
  /** How far above your average, in percent (e.g. 42). */
  pctAbove: number;
}

/**
 * Buckets already running ≥`thresholdPct`% above your own per-cycle average
 * — mid-cycle. Comparing a partial cycle against full-cycle averages is
 * deliberately conservative: if you've already beaten your usual FULL cycle
 * with days to go, that's a real pattern, not noise. Requires ≥2 completed
 * cycles of history for a bucket and a gap of at least $25.
 */
export function spendAnomalies(
  current: CycleSpend | null,
  history: CycleRecord[],
  thresholdPct = 30,
): SpendAnomaly[] {
  if (!current || history.length === 0) return [];

  const seen = new Map<string | null, { name: string; total: number; count: number }>();
  for (const c of history) {
    for (const b of c.buckets) {
      const e = seen.get(b.bucketId) ?? { name: b.bucketName, total: 0, count: 0 };
      e.total += b.actual;
      e.count += 1;
      seen.set(b.bucketId, e);
    }
  }

  const out: SpendAnomaly[] = [];
  for (const spent of current.byBucket) {
    const hist = seen.get(spent.bucketId);
    if (!hist || hist.count < 2) continue;
    const average = round2(hist.total / hist.count);
    if (average <= 0) continue;
    const pctAbove = Math.round(((spent.amount - average) / average) * 100);
    if (pctAbove >= thresholdPct && spent.amount - average >= 25) {
      out.push({
        bucketId: spent.bucketId,
        bucketName: hist.name,
        current: round2(spent.amount),
        average,
        pctAbove,
      });
    }
  }
  return out.sort((a, b) => b.pctAbove - a.pctAbove);
}
