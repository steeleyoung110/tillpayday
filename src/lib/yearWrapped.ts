/**
 * Year Wrapped: the monthly report card, annualized. Twelve months of money
 * in / money out / kept, best and worst month, and the side-by-side that
 * stings on purpose: what your debt costs per year at today's balances vs
 * what your savings earns. Pure aggregation over the same occurrence math
 * the monthly Wrapped uses.
 */
import {
  addDays,
  generateOccurrences,
  generatePayDates,
  parseISO,
  toISO,
  type Expense,
  type IncomeSource,
} from "@/lib/engine";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface MonthTotal {
  key: string; // YYYY-MM
  monthIdx: number; // 0–11
  moneyIn: number;
  moneyOut: number;
  kept: number;
  /** Any activity at all (empty months don't compete for best/worst). */
  active: boolean;
}

export interface YearSummary {
  year: number;
  /** False when the year is still in progress (numbers cover through today). */
  complete: boolean;
  moneyIn: number;
  moneyOut: number;
  kept: number;
  /** kept / moneyIn as %, null when nothing came in. */
  keptPct: number | null;
  paydayCount: number;
  months: MonthTotal[];
  best: MonthTotal | null;
  worst: MonthTotal | null;
  /** What the debt costs per year at today's balances and rates. */
  interestPaidYearly: number;
  /** What savings-with-APY earns per year at today's balances. */
  interestEarnedYearly: number;
}

export function yearWrapped(
  income: IncomeSource[],
  expenses: Expense[],
  entries: { amount: number; receivedDate: string }[],
  liabilities: { balance: number; rate: number }[],
  earning: { balance: number; apy: number }[],
  year: number,
  todayISO: string,
): YearSummary {
  const today = parseISO(todayISO);
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const complete = yearEnd < today;

  const months: MonthTotal[] = [];
  let paydayCount = 0;

  for (let m = 0; m < 12; m += 1) {
    const first = new Date(Date.UTC(year, m, 1));
    if (first > today) break;
    const lastOfMonth = addDays(new Date(Date.UTC(year, m + 1, 1)), -1);
    const end = lastOfMonth <= today ? lastOfMonth : today;

    let moneyIn = 0;
    for (const src of income) {
      if (src.frequency === "irregular") continue;
      const dates = generatePayDates(src, first, end);
      // Only paychecks count as "paydays"; side income still counts as money.
      if (src.kind === "paycheck") paydayCount += dates.length;
      moneyIn += dates.length * src.amount;
    }
    for (const e of entries) {
      if (e.receivedDate >= toISO(first) && e.receivedDate <= toISO(end)) {
        moneyIn += Number(e.amount);
      }
    }

    let moneyOut = 0;
    let spendCount = 0;
    for (const e of expenses) {
      if (e.isPaused) continue;
      const occurrences = generateOccurrences(e.dueDate, e.cadence, first, end);
      moneyOut += occurrences.length * e.amount;
      spendCount += occurrences.length;
    }

    moneyIn = round2(moneyIn);
    moneyOut = round2(moneyOut);
    months.push({
      key: `${year}-${String(m + 1).padStart(2, "0")}`,
      monthIdx: m,
      moneyIn,
      moneyOut,
      kept: round2(moneyIn - moneyOut),
      active: moneyIn > 0 || spendCount > 0,
    });
  }

  const moneyIn = round2(months.reduce((s, x) => s + x.moneyIn, 0));
  const moneyOut = round2(months.reduce((s, x) => s + x.moneyOut, 0));
  const kept = round2(moneyIn - moneyOut);
  const activeMonths = months.filter((x) => x.active);
  const best = activeMonths.length
    ? activeMonths.reduce((a, b) => (b.kept > a.kept ? b : a))
    : null;
  const worst = activeMonths.length
    ? activeMonths.reduce((a, b) => (b.kept < a.kept ? b : a))
    : null;

  const interestPaidYearly = round2(
    liabilities.reduce(
      (s, l) => s + Math.max(l.balance, 0) * (Math.max(l.rate, 0) / 100),
      0,
    ),
  );
  const interestEarnedYearly = round2(
    earning.reduce(
      (s, a) => s + Math.max(a.balance, 0) * (Math.max(a.apy, 0) / 100),
      0,
    ),
  );

  return {
    year,
    complete,
    moneyIn,
    moneyOut,
    kept,
    keptPct: moneyIn > 0 ? Math.round((kept / moneyIn) * 100) : null,
    paydayCount,
    months,
    best,
    worst,
    interestPaidYearly,
    interestEarnedYearly,
  };
}
