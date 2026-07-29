/**
 * Cash-flow calendar: one month of money events laid out as a real grid —
 * paydays in, bills out, the danger day flagged. Pure data; the component
 * just paints it.
 */
import { addDays, parseISO, toISO } from "./dates";
import { generateOccurrences, generatePayDates } from "./projection";
import type { Expense, IncomeSource } from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface CalendarDayCell {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  /** Belongs to the month being shown (padding days are false). */
  inMonth: boolean;
  isToday: boolean;
  /** Paycheck money landing this day (0 = none). */
  paydayTotal: number;
  bills: { name: string; amount: number }[];
  totalBills: number;
  isDanger: boolean;
}

/**
 * Build the weeks (Sunday-first) of `year`-`month` with every payday and bill
 * occurrence placed on its day. `dangerISO` marks the danger day if it falls
 * inside the grid.
 */
export function monthGrid(
  sources: IncomeSource[],
  expenses: Expense[],
  year: number,
  month: number, // 1–12
  todayISO: string,
  dangerISO: string | null = null,
): CalendarDayCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = addDays(new Date(Date.UTC(year, month, 1)), -1);
  const gridStart = addDays(first, -first.getUTCDay());
  const gridEnd = addDays(last, 6 - last.getUTCDay());

  // Paydays: paycheck-kind income landing in the grid range.
  const paydayByDate = new Map<string, number>();
  for (const s of sources) {
    if (s.kind !== "paycheck" || s.frequency === "irregular") continue;
    for (const d of generatePayDates(s, gridStart, gridEnd)) {
      const iso = toISO(d);
      paydayByDate.set(iso, round2((paydayByDate.get(iso) ?? 0) + s.amount));
    }
  }

  // Bills: every occurrence in the grid range.
  const billsByDate = new Map<string, { name: string; amount: number }[]>();
  for (const e of expenses) {
    if (e.isPaused) continue;
    for (const d of generateOccurrences(e.dueDate, e.cadence, gridStart, gridEnd)) {
      const iso = toISO(d);
      const list = billsByDate.get(iso) ?? [];
      list.push({ name: e.name, amount: e.amount });
      billsByDate.set(iso, list);
    }
  }

  const weeks: CalendarDayCell[][] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const week: CalendarDayCell[] = [];
    for (let i = 0; i < 7; i += 1) {
      const iso = toISO(cursor);
      const bills = (billsByDate.get(iso) ?? []).sort((a, b) => b.amount - a.amount);
      week.push({
        date: iso,
        dayOfMonth: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === month - 1,
        isToday: iso === todayISO,
        paydayTotal: paydayByDate.get(iso) ?? 0,
        bills,
        totalBills: round2(bills.reduce((s, b) => s + b.amount, 0)),
        isDanger: iso === dangerISO,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Convenience: parse "YYYY-MM" (fallback to today's month) into {year, month}. */
export function parseMonthKey(key: string | undefined, todayISO: string): { year: number; month: number } {
  const valid = /^\d{4}-\d{2}$/.test(key ?? "") ? key! : todayISO.slice(0, 7);
  const [y, m] = valid.split("-").map(Number);
  return { year: y, month: m };
}
