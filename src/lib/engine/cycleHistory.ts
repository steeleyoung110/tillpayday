/**
 * Cycle recap history: for each of the last several COMPLETED pay cycles
 * (last payday to today doesn't count — that's "this cycle so far"), what
 * did each bucket plan to get vs what actually left it. Evidence over time,
 * not just a single snapshot — "Fun Money over plan 4 cycles straight" is a
 * pattern you can only see by keeping the receipts.
 */
import { addDays, parseISO, toISO } from "./dates";
import { generateOccurrences, generatePayDates, splitPaycheck } from "./projection";
import type { Bucket, Expense, IncomeSource } from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface CycleBucketActual {
  bucketId: string | null;
  bucketName: string;
  planned: number;
  actual: number;
  /** How much over the plan this bucket ran (0 if it stayed within plan). */
  overBy: number;
}

export interface CycleRecord {
  /** Payday that started this cycle. */
  cycleStart: string;
  /** Payday that ended it (the next cycle's start). */
  cycleEnd: string;
  /** Paycheck-kind income that landed on cycleStart. */
  paycheckTotal: number;
  buckets: CycleBucketActual[];
  totalPlanned: number;
  totalActual: number;
  /** True when no bucket ran over its planned share this cycle. */
  keptPlan: boolean;
}

export interface BucketStreak {
  bucketId: string | null;
  bucketName: string;
  /** Consecutive most-recent cycles this bucket ran over plan. */
  overCycles: number;
}

export interface CycleHistoryResult {
  /** Most recent completed cycle first. */
  cycles: CycleRecord[];
  /** Buckets currently on an over-plan streak, longest first. */
  streaks: BucketStreak[];
}

/**
 * Recap the last `cyclesBack` completed pay cycles. Returns an empty history
 * before at least two paydays have passed (no completed cycle exists yet).
 */
export function cycleHistory(
  sources: IncomeSource[],
  buckets: Bucket[],
  expenses: Expense[],
  todayISO: string,
  cyclesBack = 6,
): CycleHistoryResult {
  const today = parseISO(todayISO);
  const paychecks = sources.filter((s) => s.kind === "paycheck");
  if (paychecks.length === 0) return { cycles: [], streaks: [] };

  // Look back far enough to gather cyclesBack+1 boundaries for any frequency,
  // including monthly/semimonthly (30–31 day cycles): ~40 days per cycle is
  // generous headroom.
  const lookbackStart = addDays(today, -40 * (cyclesBack + 1));
  const boundarySet = new Set<string>();
  for (const s of paychecks) {
    for (const d of generatePayDates(s, lookbackStart, today)) {
      boundarySet.add(toISO(d));
    }
  }
  const boundaries = [...boundarySet].sort();
  if (boundaries.length < 2) return { cycles: [], streaks: [] };

  // Consecutive boundaries form completed cycles; the last boundary starts
  // the still-open current cycle, so it never becomes a cycleStart itself.
  const windows: { start: string; end: string }[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    windows.push({ start: boundaries[i], end: boundaries[i + 1] });
  }
  const recentWindows = windows.slice(-cyclesBack).reverse();

  const nameById = new Map(buckets.map((b) => [b.id, b.name]));
  const bucketName = (id: string | null) =>
    id === null ? "Savings / leftover" : nameById.get(id) ?? "Unknown";

  const cycles: CycleRecord[] = recentWindows.map(({ start, end }) => {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    const inclusiveEnd = addDays(endDate, -1); // the window is half-open [start, end)

    const paycheckTotal = round2(
      paychecks
        .filter((s) => generatePayDates(s, startDate, startDate).length > 0)
        .reduce((sum, s) => sum + s.amount, 0),
    );
    const plannedSlices = splitPaycheck(buckets, paycheckTotal);
    const plannedByBucket = new Map(
      plannedSlices.map((s) => [s.bucketId, s.amount]),
    );

    const actualByBucket = new Map<string | null, number>();
    for (const e of expenses) {
      const hits = generateOccurrences(e.dueDate, e.cadence, startDate, inclusiveEnd).length;
      if (hits === 0) continue;
      const amount = round2(hits * e.amount);
      actualByBucket.set(e.bucketId, round2((actualByBucket.get(e.bucketId) ?? 0) + amount));
    }

    const ids = new Set([...plannedByBucket.keys(), ...actualByBucket.keys()]);
    const rows: CycleBucketActual[] = [...ids].map((id) => {
      const planned = plannedByBucket.get(id) ?? 0;
      const actual = actualByBucket.get(id) ?? 0;
      return {
        bucketId: id,
        bucketName: bucketName(id),
        planned,
        actual,
        overBy: round2(Math.max(0, actual - planned)),
      };
    });
    rows.sort((a, b) => b.actual - a.actual);

    const totalPlanned = round2(rows.reduce((s, r) => s + r.planned, 0));
    const totalActual = round2(rows.reduce((s, r) => s + r.actual, 0));

    return {
      cycleStart: start,
      cycleEnd: end,
      paycheckTotal,
      buckets: rows,
      totalPlanned,
      totalActual,
      keptPlan: rows.every((r) => r.overBy === 0),
    };
  });

  // Streaks: for each bucket seen at all, walk cycles most-recent-first and
  // count how many in a row ran over plan, stopping at the first that didn't
  // (a bucket absent from a cycle's rows counts as "not over" that cycle).
  const allBucketIds = new Set<string | null>();
  for (const c of cycles) for (const row of c.buckets) allBucketIds.add(row.bucketId);

  const streaks: BucketStreak[] = [];
  for (const bucketId of allBucketIds) {
    let count = 0;
    let name = bucketName(bucketId);
    for (const c of cycles) {
      const row = c.buckets.find((r) => r.bucketId === bucketId);
      if (row && row.overBy > 0) {
        count += 1;
        name = row.bucketName;
      } else {
        break;
      }
    }
    if (count > 0) streaks.push({ bucketId, bucketName: name, overCycles: count });
  }
  streaks.sort((a, b) => b.overCycles - a.overCycles);

  return { cycles, streaks };
}
