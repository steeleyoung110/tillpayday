/**
 * Spending visualizations, computed server-side: the daily heatmap (13 weeks
 * of spend intensity) and monthly totals per semantic category. Pure.
 */
import { classifyBucket, planColor, type SpendCategory } from "@/lib/bucketColor";
import {
  addDays,
  generateOccurrences,
  generatePayDates,
  parseISO,
  toISO,
  type Expense,
  type IncomeSource,
} from "@/lib/engine";
import type { BucketRow, IncomeEntryRow } from "@/lib/rows";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface HeatDay {
  date: string;
  total: number;
}

export interface SpendHeatmap {
  /** One entry per day, oldest first, covering exactly `days` days. */
  days: HeatDay[];
  max: number;
  total: number;
}

/** Daily spend totals for the trailing window (default 13 weeks). */
export function dailySpendHeatmap(
  expenses: Expense[],
  todayISO: string,
  days = 91,
): SpendHeatmap {
  const end = parseISO(todayISO);
  const start = addDays(end, -(days - 1));

  const byDate = new Map<string, number>();
  for (const e of expenses) {
    if (e.isPaused) continue;
    for (const d of generateOccurrences(e.dueDate, e.cadence, start, end)) {
      const key = toISO(d);
      byDate.set(key, round2((byDate.get(key) ?? 0) + e.amount));
    }
  }

  const out: HeatDay[] = [];
  let max = 0;
  let total = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const key = toISO(d);
    const t = byDate.get(key) ?? 0;
    out.push({ date: key, total: t });
    max = Math.max(max, t);
    total = round2(total + t);
  }
  return { days: out, max, total };
}

export interface MonthCategoryTotals {
  /** "2026-07" */
  month: string;
  /** Human label, e.g. "Jul". */
  label: string;
  /** Spend per semantic category, only non-zero keys present. */
  byCategory: Record<string, number>;
  total: number;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface MonthlySavingsRate {
  /** "2026-07" */
  month: string;
  income: number;
  spent: number;
  /** Percent of income kept, negative when you outspent it. Null = no income. */
  ratePct: number | null;
}

/**
 * Savings rate per calendar month: (income − spent) / income. Income counts
 * scheduled paychecks plus logged entries in the month; the current month is
 * partial and honestly so. Negative rates are reported, not clamped.
 */
export function monthlySavingsRate(
  income: IncomeSource[],
  entries: IncomeEntryRow[],
  expenses: Expense[],
  todayISO: string,
  months = 6,
): MonthlySavingsRate[] {
  const today = parseISO(todayISO);
  const out: MonthlySavingsRate[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const nextFirst = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    const last = addDays(nextFirst, -1);
    const windowEnd = last <= today ? last : today;

    // Every scheduled source counts — side income is income.
    let moneyIn = 0;
    for (const src of income) {
      if (src.frequency === "irregular") continue;
      moneyIn += generatePayDates(src, first, windowEnd).length * src.amount;
    }
    for (const e of entries) {
      if (e.received_date >= toISO(first) && e.received_date <= toISO(windowEnd)) {
        moneyIn += Number(e.amount);
      }
    }

    let spent = 0;
    for (const e of expenses) {
      if (e.isPaused) continue;
      spent += generateOccurrences(e.dueDate, e.cadence, first, windowEnd).length * e.amount;
    }

    moneyIn = round2(moneyIn);
    spent = round2(spent);
    out.push({
      month: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`,
      income: moneyIn,
      spent,
      ratePct: moneyIn > 0 ? Math.round(((moneyIn - spent) / moneyIn) * 100) : null,
    });
  }
  return out;
}

/** Colors for the trend chart, one per semantic family (brightest shade). */
export function categoryColor(category: string): string {
  return planColor(category as SpendCategory, 0);
}

/**
 * Monthly spending grouped by semantic bucket category for the last
 * `months` calendar months (current month included, partial and honest).
 */
export function monthlyCategoryTotals(
  expenses: Expense[],
  buckets: BucketRow[],
  todayISO: string,
  months = 6,
): MonthCategoryTotals[] {
  const bucketById = new Map(buckets.map((b) => [b.id, b]));
  const categoryOf = (bucketId: string | null): string => {
    if (bucketId === null) return "savings";
    const b = bucketById.get(bucketId);
    if (!b) return "other";
    return classifyBucket(b.name, {
      isSavings: b.is_savings,
      isFlexible: b.is_flexible,
    });
  };

  const today = parseISO(todayISO);
  const out: MonthCategoryTotals[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const nextFirst = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    const last = addDays(nextFirst, -1);
    const windowEnd = last <= today ? last : today;

    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const e of expenses) {
      if (e.isPaused) continue;
      for (const d of generateOccurrences(e.dueDate, e.cadence, first, windowEnd)) {
        void d;
        const cat = categoryOf(e.bucketId);
        byCategory[cat] = round2((byCategory[cat] ?? 0) + e.amount);
        total = round2(total + e.amount);
      }
    }
    out.push({
      month: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`,
      label: MONTH_LABELS[first.getUTCMonth()],
      byCategory,
      total,
    });
  }
  return out;
}
