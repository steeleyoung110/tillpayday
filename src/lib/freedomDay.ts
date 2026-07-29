/**
 * Freedom Day: the day of the month your income stops belonging to your
 * bills. If bills eat 60% of a 30-day month's income, you work for the bills
 * through the 18th — after that you work for you. Watching this date move
 * earlier is the whole game, stated as a calendar day.
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

export interface FreedomDayResult {
  /** Day of month (1-based) when cumulative income passes total bills. */
  day: number;
  date: string; // YYYY-MM-DD
  /** Share of the month's income the bills take (0–1, capped at 1). */
  billShare: number;
  monthIncome: number;
  monthBills: number;
  /** Bills meet or exceed income — no day this month works for you. */
  neverFree: boolean;
  daysInMonth: number;
}

/**
 * Compute for the month containing `todayISO`. Uses the FULL month's
 * scheduled paychecks and bill occurrences (stable within the month).
 * Null when there is no scheduled income to measure against.
 */
export function freedomDay(
  income: IncomeSource[],
  expenses: Expense[],
  todayISO: string,
): FreedomDayResult | null {
  const today = parseISO(todayISO);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const last = addDays(new Date(Date.UTC(year, month + 1, 1)), -1);
  const daysInMonth = last.getUTCDate();

  let monthIncome = 0;
  for (const s of income) {
    if (s.kind !== "paycheck" || s.frequency === "irregular") continue;
    monthIncome += generatePayDates(s, first, last).length * s.amount;
  }
  monthIncome = Math.round(monthIncome * 100) / 100;
  if (monthIncome <= 0) return null;

  let monthBills = 0;
  for (const e of expenses) {
    if (e.isPaused || e.cadence === "one_time") continue;
    monthBills += generateOccurrences(e.dueDate, e.cadence, first, last).length * e.amount;
  }
  monthBills = Math.round(monthBills * 100) / 100;

  const rawShare = monthBills / monthIncome;
  const neverFree = rawShare >= 1;
  const billShare = Math.min(1, Math.round(rawShare * 1000) / 1000);
  const day = neverFree
    ? daysInMonth
    : Math.min(daysInMonth, Math.max(1, Math.ceil(rawShare * daysInMonth)));

  return {
    day,
    date: toISO(new Date(Date.UTC(year, month, day))),
    billShare,
    monthIncome,
    monthBills,
    neverFree,
    daysInMonth,
  };
}
