/**
 * Honest-mirror insights: the runway number ("if your paycheck stopped today,
 * how long would you last?") and spending anomalies measured against your own
 * history — never someone else's idea of normal. Pure functions.
 */
import { diffDays, parseISO } from "./dates";
import type { CycleRecord } from "./cycleHistory";
import type { CycleSpend } from "./cycleSpend";

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
