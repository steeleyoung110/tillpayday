/** Next-payday countdown shown at the top of the dashboard. */
import {
  addMonths,
  diffDays,
  generatePayDates,
  parseISO,
  toISO,
} from "@/lib/engine";
import { incomeToEngine, type IncomeRow } from "@/lib/rows";

/**
 * Earliest upcoming pay date (ISO) across paycheck income sources, or across
 * all income if the user only has side income. Null when there is no income.
 */
export function nextPayday(income: IncomeRow[], todayISO: string): string | null {
  const start = parseISO(todayISO);
  const end = addMonths(start, 2);
  const paychecks = income.filter((s) => s.kind === "paycheck");
  const pool = paychecks.length > 0 ? paychecks : income;
  const dates = pool
    .flatMap((s) => generatePayDates(incomeToEngine(s), start, end))
    .sort((a, b) => a.getTime() - b.getTime());
  return dates.length > 0 ? toISO(dates[0]) : null;
}

/** "5 days till payday (Aug 1)", "Payday is tomorrow…", "Payday is today!…" */
export function paydayLabel(payday: string, todayISO: string): string {
  const days = diffDays(parseISO(todayISO), parseISO(payday));
  const pretty = parseISO(payday).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (days <= 0) return `Payday is today! (${pretty}) 🎉`;
  if (days === 1) return `Payday is tomorrow (${pretty})`;
  return `${days} days till payday (${pretty})`;
}
