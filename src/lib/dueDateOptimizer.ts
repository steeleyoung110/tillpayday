/**
 * Bill due-date optimizer: your Danger Day is usually manufactured by bills
 * that land in the starving days right before payday. For each bill due in
 * that window, simulate moving it to just AFTER the next check and measure
 * how much the low point rises. The top movers become "one phone call"
 * suggestions.
 */
import {
  addDays,
  dangerDay,
  diffDays,
  generateOccurrences,
  parseISO,
  toISO,
  type Bucket,
  type Expense,
  type IncomeEntry,
  type IncomeSource,
  type Transfer,
} from "@/lib/engine";

export interface DueDateSuggestion {
  expenseId: string;
  name: string;
  amount: number;
  /** The occurrence currently landing before payday. */
  currentDue: string;
  /** Where it would land instead (day after the next check). */
  suggestedDue: string;
  oldLow: number;
  newLow: number;
  /** Dollars the danger-day low rises by. */
  lift: number;
}

export function optimizeDueDates(
  sources: IncomeSource[],
  buckets: Bucket[],
  expenses: Expense[],
  todayISO: string,
  incomeEntries: IncomeEntry[] = [],
  transfers: Transfer[] = [],
  maxSuggestions = 2,
): DueDateSuggestion[] {
  const base = dangerDay(sources, buckets, expenses, todayISO, incomeEntries, transfers);
  if (!base) return [];

  const windowStart = parseISO(todayISO);
  const windowEnd = addDays(parseISO(base.nextPayday), -1);
  const targetDue = addDays(parseISO(base.nextPayday), 1);

  const suggestions: DueDateSuggestion[] = [];
  for (const e of expenses) {
    if (e.isPaused || e.cadence === "one_time") continue;
    const occ = generateOccurrences(e.dueDate, e.cadence, windowStart, windowEnd)[0];
    if (!occ) continue;

    // Shift the whole anchor so this occurrence lands the day after payday.
    const shiftDays = diffDays(occ, targetDue);
    if (shiftDays <= 0) continue;
    const moved: Expense = {
      ...e,
      dueDate: toISO(addDays(parseISO(e.dueDate), shiftDays)),
    };
    const withMove = expenses.map((x) => (x.id === e.id ? moved : x));
    const after = dangerDay(sources, buckets, withMove, todayISO, incomeEntries, transfers);
    if (!after) continue;

    const lift = Math.round((after.low - base.low) * 100) / 100;
    if (lift >= 10) {
      suggestions.push({
        expenseId: e.id,
        name: e.name,
        amount: e.amount,
        currentDue: toISO(occ),
        suggestedDue: toISO(targetDue),
        oldLow: base.low,
        newLow: after.low,
        lift,
      });
    }
  }

  return suggestions.sort((a, b) => b.lift - a.lift).slice(0, maxSuggestions);
}
