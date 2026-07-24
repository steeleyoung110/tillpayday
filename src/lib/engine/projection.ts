/**
 * Till Payday projection engine (v1.1 payday semantics).
 *
 * A pure, deterministic simulation: given income, buckets and expenses, it plays
 * money forward day by day and returns a balance for every day plus warnings.
 * No dates, randomness or I/O are read from the environment — everything comes
 * from the input, so it is fully testable.
 *
 * Payday rules, in order, on every payday:
 *   1. Sweep every spending bucket's leftover balance into savings — spending
 *      buckets reset each cycle; only savings accumulates.
 *   2. Refill fixed-amount buckets in priority order (lower priority first).
 *   3. Percent buckets take their percent of what remains after fixed buckets,
 *      floored to the cent.
 *   4. Any unallocated remainder (including rounding crumbs) goes to savings,
 *      so every paycheck satisfies income = allocated + savings to the penny.
 * If a paycheck can't cover a bucket's rule, it gets whatever is left and an
 * "underfunded" warning is raised. Expenses deduct from their bucket on their
 * due date; an expense a bucket can't cover sends it negative and raises a
 * "shortfall" warning naming the month and the missing amount.
 */

import { addDays, addMonths, diffDays, parseISO, toISO } from "./dates";
import type {
  Bucket,
  Expense,
  IncomeSource,
  ProjectionInput,
  ProjectionPoint,
  ProjectionResult,
  Warning,
  WhatIfItem,
  WhatIfVerdict,
} from "./types";

/** Key for the implicit pool that holds leftovers when no savings bucket exists. */
export const UNALLOCATED_KEY = "__unallocated__";

/** Round to whole cents to keep floating-point drift out of the results. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Floor to whole cents (percent allocations round DOWN; crumbs go to savings). */
function floorCent(n: number): number {
  return Math.floor((n + Number.EPSILON) * 100) / 100;
}

/** Ceil to whole cents (fix amounts round UP so the fix always suffices). */
function ceilCent(n: number): number {
  return Math.ceil((n - Number.EPSILON) * 100) / 100;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "March 2027" for a simulation date. */
function monthLabel(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Generate every pay date for one income source within [start, end] (inclusive).
 * - weekly / biweekly: anchored to the user's chosen next-payday date.
 * - semimonthly: the 1st and the 15th of every month.
 * - monthly: the anchor's day-of-month (clamped to short months).
 * Paydays land literally — no weekend or holiday shifting.
 */
export function generatePayDates(
  source: IncomeSource,
  start: Date,
  end: Date,
): Date[] {
  // Irregular income has no schedule — the projection injects a weekly
  // baseline stream for it instead (see irregularWeeklyBaseline).
  if (source.frequency === "irregular") return [];

  const anchor = parseISO(source.anchorDate);
  const dates: Date[] = [];

  if (source.frequency === "weekly" || source.frequency === "biweekly") {
    const step = source.frequency === "weekly" ? 7 : 14;
    // The anchor defines a lattice in BOTH directions: step to the first
    // occurrence on or after `start`, even when the anchor (the user's chosen
    // *next* payday) lies beyond it.
    const gap = diffDays(anchor, start);
    let d = addDays(anchor, Math.ceil(gap / step) * step);
    while (d <= end) {
      if (d >= start) dates.push(d);
      d = addDays(d, step);
    }
  } else if (source.frequency === "monthly") {
    // Same day-of-month as the anchor, every month.
    let k =
      (start.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      (start.getUTCMonth() - anchor.getUTCMonth()) -
      1;
    let d = addMonths(anchor, k);
    while (d < start) {
      k += 1;
      d = addMonths(anchor, k);
    }
    while (d <= end) {
      dates.push(d);
      k += 1;
      d = addMonths(anchor, k);
    }
  } else {
    // semimonthly: the 1st and the 15th of every month, always.
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const lastMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cursor <= lastMonth) {
      for (const day of [1, 15]) {
        const d = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), day));
        if (d >= start && d <= end) dates.push(d);
      }
      cursor = addMonths(cursor, 1);
    }
  }

  return dates.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * The conservative baseline for irregular income: the trailing 8-week average
 * of logged (non-windfall) entries, taken at 85%. Deliberately cautious — a
 * projection built on a typical-but-humble week beats one built on a great
 * week. Returns dollars per week, rounded to the cent.
 */
export function irregularWeeklyBaseline(
  entries: { amount: number; receivedDate: string; isWindfall?: boolean }[],
  startDateISO: string,
): number {
  const start = parseISO(startDateISO);
  const windowStart = addDays(start, -56);
  const total = entries
    .filter((e) => !e.isWindfall)
    .filter((e) => {
      const d = parseISO(e.receivedDate);
      return d >= windowStart && d < start;
    })
    .reduce((sum, e) => sum + e.amount, 0);
  return round2((total / 8) * 0.85);
}

/** Generate every occurrence of an expense within [start, end] (inclusive). */
export function generateOccurrences(
  dueDate: string,
  cadence: Expense["cadence"],
  start: Date,
  end: Date,
): Date[] {
  const first = parseISO(dueDate);
  const out: Date[] = [];

  if (cadence === "one_time") {
    if (first >= start && first <= end) out.push(first);
    return out;
  }

  const stepMonths = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
  let k = 0;
  let d = first;
  while (d < start) {
    k += 1;
    d = addMonths(first, k * stepMonths);
  }
  while (d <= end) {
    out.push(d);
    k += 1;
    d = addMonths(first, k * stepMonths);
  }
  return out;
}

/** Run the 12-month (or `months`-long) projection. */
export function runProjection(input: ProjectionInput): ProjectionResult {
  const months = input.months > 0 ? input.months : 12;
  const start = parseISO(input.startDate);
  const end = addMonths(start, months);

  const savings = input.buckets.find((b) => b.isSavings);
  const savingsKey = savings ? savings.id : UNALLOCATED_KEY;

  // Spending buckets in funding priority order (lower first, ties by position).
  // Paused buckets are frozen out of the waterfall entirely: no refill, no
  // sweep — their balance just carries.
  const spending = input.buckets
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !b.isSavings)
    .sort((x, y) => (x.b.priority ?? x.i) - (y.b.priority ?? y.i) || x.i - y.i)
    .map(({ b }) => b);
  const active = spending.filter((b) => !b.isPaused);
  const fixed = active.filter((b) => b.allocationType === "fixed");
  const percent = active.filter((b) => b.allocationType === "percent");

  // Seed starting balances (mid-cycle start).
  const balances: Record<string, number> = {};
  for (const b of input.buckets) {
    balances[b.id] = round2(input.startingBalances?.[b.id] ?? 0);
  }
  if (!savings) {
    balances[UNALLOCATED_KEY] = round2(
      input.startingBalances?.[UNALLOCATED_KEY] ?? 0,
    );
  }

  // Pre-index events by ISO date so the day loop is a simple lookup.
  const incomeByDate = new Map<string, { amount: number; kind: IncomeSource["kind"] }[]>();
  for (const src of input.incomeSources) {
    for (const d of generatePayDates(src, start, end)) {
      const key = toISO(d);
      (incomeByDate.get(key) ?? incomeByDate.set(key, []).get(key)!).push({
        amount: src.amount,
        kind: src.kind,
      });
    }
  }

  // Irregular income: one conservative weekly stream, refreshed from logged
  // entries. First projected payday is a week out — money already received
  // this week lives in the starting balances, not the future.
  const entries = input.incomeEntries ?? [];
  const hasIrregular = input.incomeSources.some(
    (s) => s.frequency === "irregular" && s.kind === "paycheck",
  );
  const irregularWeekly = hasIrregular
    ? irregularWeeklyBaseline(entries, input.startDate)
    : null;
  if (irregularWeekly && irregularWeekly > 0) {
    for (let d = addDays(start, 7); d <= end; d = addDays(d, 7)) {
      const key = toISO(d);
      (incomeByDate.get(key) ?? incomeByDate.set(key, []).get(key)!).push({
        amount: irregularWeekly,
        kind: "paycheck",
      });
    }
  }

  // Windfalls inject on their date, split per their allocation.
  const windfallByDate = new Map<
    string,
    { amount: number; allocation: { bucketId: string | null; amount: number }[] }[]
  >();
  for (const e of entries) {
    if (!e.isWindfall) continue;
    const d = parseISO(e.receivedDate);
    if (d < start || d > end) continue;
    const key = toISO(d);
    (windfallByDate.get(key) ?? windfallByDate.set(key, []).get(key)!).push({
      amount: e.amount,
      allocation: e.allocation ?? [],
    });
  }

  const expenseByDate = new Map<string, { amount: number; bucketId: string | null }[]>();
  for (const e of input.expenses) {
    if (e.isPaused) continue; // paused expenses don't deduct while paused
    for (const d of generateOccurrences(e.dueDate, e.cadence, start, end)) {
      const key = toISO(d);
      (expenseByDate.get(key) ?? expenseByDate.set(key, []).get(key)!).push({
        amount: e.amount,
        bucketId: e.bucketId,
      });
    }
  }

  const nameById = new Map(input.buckets.map((b) => [b.id, b.name]));
  const bucketName = (id: string) =>
    id === UNALLOCATED_KEY ? "Unallocated" : nameById.get(id) ?? "Unknown";

  // Interest: convert each bucket's APY (an *effective* annual yield) into the
  // equivalent daily rate, accrue on positive balances daily without rounding,
  // and credit the accrued cents at each month boundary.
  const dailyRate = new Map<string, number>();
  for (const b of input.buckets) {
    const apy = b.apy ?? 0;
    if (apy > 0) dailyRate.set(b.id, Math.pow(1 + apy / 100, 1 / 365) - 1);
  }
  const accrued: Record<string, number> = {};
  let totalInterest = 0;
  const creditInterest = () => {
    for (const id of Object.keys(accrued)) {
      if (accrued[id] !== 0) {
        const credit = round2(accrued[id]);
        balances[id] = round2((balances[id] ?? 0) + credit);
        totalInterest = round2(totalInterest + credit);
        accrued[id] = 0;
      }
    }
  };

  const warnings: Warning[] = [];
  const underfundedOnce = new Set<string>();
  const shortfallOnce = new Set<string>();
  let totalIncome = 0;
  let paydaysSoFar = 0;

  /** Rules 2–4 & 6: fixed by priority, then percents (floored) of the rest. */
  const allocatePaycheck = (amount: number, dateKey: string) => {
    let available = round2(amount);

    for (const b of fixed) {
      const requested = round2(b.allocationValue);
      const give = Math.min(requested, available);
      balances[b.id] = round2(balances[b.id] + give);
      available = round2(available - give);
      if (give < requested && !underfundedOnce.has(b.id)) {
        underfundedOnce.add(b.id);
        warnings.push({
          type: "underfunded",
          bucketId: b.id,
          bucketName: b.name,
          date: dateKey,
          requested,
          funded: give,
        });
      }
    }

    // All percents are taken from the same base: what remained after fixed.
    const base = available;
    for (const b of percent) {
      const requested = floorCent(base * (b.allocationValue / 100));
      const give = Math.min(requested, available);
      balances[b.id] = round2(balances[b.id] + give);
      available = round2(available - give);
      if (give < requested && !underfundedOnce.has(b.id)) {
        underfundedOnce.add(b.id);
        warnings.push({
          type: "underfunded",
          bucketId: b.id,
          bucketName: b.name,
          date: dateKey,
          requested,
          funded: give,
        });
      }
    }

    // Rule 4/6: unallocated remainder — including rounding crumbs — to savings.
    balances[savingsKey] = round2(balances[savingsKey] + available);
  };

  const points: ProjectionPoint[] = [];

  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const key = toISO(d);

    // A new month starts: credit last month's accrued interest first.
    if (d.getUTCDate() === 1) creditInterest();

    const paychecks = incomeByDate.get(key);
    if (paychecks && paychecks.length > 0) {
      if (paychecks.some((p) => p.kind === "paycheck")) paydaysSoFar += 1;
      // Rule 1/3: payday sweep — spending buckets reset into savings.
      // Sinking funds (rollsOver) are exempt: they accumulate cycle over
      // cycle. Paused buckets are frozen and don't sweep either.
      for (const b of active) {
        if (!b.rollsOver && balances[b.id] !== 0) {
          balances[savingsKey] = round2(balances[savingsKey] + balances[b.id]);
          balances[b.id] = 0;
        }
      }
      for (const inc of paychecks) {
        totalIncome = round2(totalIncome + inc.amount);
        if (inc.kind === "side") {
          // Side income is unallocated — straight to savings.
          balances[savingsKey] = round2(balances[savingsKey] + inc.amount);
        } else {
          allocatePaycheck(inc.amount, key);
        }
      }
    }

    // Windfalls: explicit portions to their buckets, the rest to savings.
    for (const wf of windfallByDate.get(key) ?? []) {
      totalIncome = round2(totalIncome + wf.amount);
      let allocated = 0;
      for (const part of wf.allocation) {
        const target =
          part.bucketId && part.bucketId in balances ? part.bucketId : savingsKey;
        balances[target] = round2((balances[target] ?? 0) + part.amount);
        allocated = round2(allocated + part.amount);
      }
      balances[savingsKey] = round2(balances[savingsKey] + (wf.amount - allocated));
    }

    for (const ex of expenseByDate.get(key) ?? []) {
      const target = ex.bucketId ?? savingsKey;
      const before = balances[target] ?? 0;

      // Only savings may ever go red. The bill's own bucket pays what it can
      // (down to $0); the overflow then raids the other buckets —
      // least-important first, fun money before bills — and whatever nothing
      // else can cover lands on savings, which alone absorbs the negative.
      // There is no "it's fine, I have $100 over there": that $100 is next.
      let need = ex.amount;
      const fromTarget = Math.min(Math.max(before, 0), need);
      balances[target] = round2(before - fromTarget);
      need = round2(need - fromTarget);

      if (need > 0) {
        const warnKey = `${target}:${monthLabel(d)}`;
        if (!shortfallOnce.has(warnKey)) {
          shortfallOnce.add(warnKey);
          warnings.push({
            type: "shortfall",
            bucketId: target,
            bucketName: bucketName(target),
            date: key,
            month: monthLabel(d),
            amount: need,
            // The fix: spread the missing amount across every paycheck that
            // lands on or before the due date (paydays process first, so a
            // same-day paycheck still helps). Round up so the fix suffices.
            paydaysUntil: paydaysSoFar,
            fixPerPaycheck:
              paydaysSoFar > 0 ? ceilCent(need / paydaysSoFar) : null,
          });
        }

        // Raid order: active spending buckets (never paused ones — they're
        // frozen), lowest funding priority first, skipping the bill's own.
        for (const b of [...active].reverse()) {
          if (b.id === target) continue;
          const avail = Math.max(balances[b.id] ?? 0, 0);
          if (avail <= 0) continue;
          const take = Math.min(avail, need);
          balances[b.id] = round2(balances[b.id] - take);
          need = round2(need - take);
          if (need <= 0) break;
        }
        if (need > 0) {
          balances[savingsKey] = round2(balances[savingsKey] - need);
        }
      }
    }

    for (const [id, rate] of dailyRate) {
      const bal = balances[id] ?? 0;
      if (bal > 0) accrued[id] = (accrued[id] ?? 0) + bal * rate;
    }
    // Make the horizon's final day include everything earned so far.
    if (d.getTime() === end.getTime()) creditInterest();

    let total = 0;
    for (const id of Object.keys(balances)) {
      total = round2(total + balances[id]);
    }

    points.push({
      date: key,
      total,
      savings: savings ? balances[savings.id] : balances[UNALLOCATED_KEY],
      buckets: { ...balances },
    });
  }

  const last = points[points.length - 1];
  return {
    points,
    warnings,
    endingTotal: last?.total ?? 0,
    endingSavings: last?.savings ?? 0,
    totalIncome,
    totalInterest,
    irregularWeekly,
  };
}

export interface PaycheckSlice {
  /** null = the leftover that flows to savings when no savings bucket exists. */
  bucketId: string | null;
  name: string;
  amount: number;
  /** Share of the paycheck, 0–100. */
  percent: number;
}

/**
 * How one paycheck splits across buckets — the same waterfall the projection
 * runs (fixed by priority, then percents of the remainder floored to the
 * cent, leftover to savings; paused buckets sit out), for a single check.
 * Slices always sum to the full paycheck.
 */
export function splitPaycheck(buckets: Bucket[], amount: number): PaycheckSlice[] {
  if (amount <= 0) return [];
  const savings = buckets.find((b) => b.isSavings);
  const spending = buckets
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !b.isSavings && !b.isPaused)
    .sort((x, y) => (x.b.priority ?? x.i) - (y.b.priority ?? y.i) || x.i - y.i)
    .map(({ b }) => b);

  const slices: PaycheckSlice[] = [];
  let available = round2(amount);

  for (const b of spending.filter((x) => x.allocationType === "fixed")) {
    const give = Math.min(round2(b.allocationValue), available);
    available = round2(available - give);
    if (give > 0) slices.push({ bucketId: b.id, name: b.name, amount: give, percent: 0 });
  }
  const base = available;
  for (const b of spending.filter((x) => x.allocationType === "percent")) {
    const give = Math.min(floorCent(base * (b.allocationValue / 100)), available);
    available = round2(available - give);
    if (give > 0) slices.push({ bucketId: b.id, name: b.name, amount: give, percent: 0 });
  }
  if (available > 0) {
    slices.push({
      bucketId: savings ? savings.id : null,
      name: savings ? savings.name : "Savings / leftover",
      amount: available,
      percent: 0,
    });
  }
  for (const s of slices) s.percent = Math.round((s.amount / amount) * 1000) / 10;
  return slices;
}

/** Turn a day count into a friendly setback label. */
export function labelSetback(days: number): string {
  if (days <= 0) return "no measurable setback";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  const monthsApprox = Math.round(days / 30);
  return `about ${monthsApprox} month${monthsApprox === 1 ? "" : "s"}`;
}

/** Stable identity for a warning, for baseline-vs-purchase comparison. */
function warningKey(w: Warning): string {
  return `${w.type}:${w.bucketId}`;
}

/** Compare a baseline projection to a "with purchase" projection. */
export function buildVerdict(
  baseline: ProjectionResult,
  withPurchase: ProjectionResult,
): WhatIfVerdict {
  const endingWithout = baseline.endingTotal;
  const endingWith = withPurchase.endingTotal;

  const pts = baseline.points;
  const endDate = parseISO(pts[pts.length - 1].date);

  // How far back does the purchase put you? Savings only grows on paydays, so the
  // curve is flat between paychecks — measuring the raw horizontal gap is jumpy.
  // Instead we ask the intuitive question: at your average saving pace, how long
  // to earn this money back? setback = purchase cost / average savings-per-day.
  const horizonDays = diffDays(parseISO(pts[0].date), endDate);
  const dailyRate =
    horizonDays > 0 ? (endingWithout - pts[0].total) / horizonDays : 0;
  const shortfall = endingWithout - endingWith; // ≈ the purchase amount
  const setbackDays =
    dailyRate > 0.00001 ? Math.round(shortfall / dailyRate) : 0;

  const baselineKeys = new Set(baseline.warnings.map(warningKey));
  const causesNegative = withPurchase.warnings.some(
    (w) => !baselineKeys.has(warningKey(w)),
  );

  return {
    endingWithout,
    endingWith,
    setbackDays,
    setbackLabel: labelSetback(setbackDays),
    causesNegative,
    warnings: withPurchase.warnings,
  };
}

/**
 * Evaluate a considered purchase. Rule 8: what-if items deduct from savings on
 * their chosen date, producing a second comparison timeline.
 */
export function evaluateWhatIf(
  input: ProjectionInput,
  item: WhatIfItem,
): {
  baseline: ProjectionResult;
  withPurchase: ProjectionResult;
  verdict: WhatIfVerdict;
} {
  const baseline = runProjection(input);
  const purchase: Expense = {
    id: `whatif-${item.id}`,
    name: item.name,
    amount: item.amount,
    bucketId: null, // null targets the savings bucket
    dueDate: item.targetDate,
    cadence: "one_time",
  };
  const withPurchase = runProjection({
    ...input,
    expenses: [...input.expenses, purchase],
  });
  return { baseline, withPurchase, verdict: buildVerdict(baseline, withPurchase) };
}
