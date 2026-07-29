/**
 * Bill-to-paycheck calendar: which upcoming check covers which bills.
 * Answers "can this check handle rent AND the concert?" visually instead of
 * making you do the mental math across a long list of due dates.
 */
import { addDays, diffDays, parseISO, toISO } from "./dates";
import { generateOccurrences, generatePayDates } from "./projection";
import { currentPayCycle } from "./safeToSpend";
import type { Bucket, Expense, IncomeSource } from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Payments per year, for prorating side income across a check window. */
const SIDE_PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export interface CalendarBill {
  expenseId: string;
  name: string;
  amount: number;
  dueDate: string;
  bucketId: string | null;
  bucketName: string;
}

export interface CheckBillGroup {
  /** This check's payday. */
  payday: string;
  /** The next payday after it — the window's exclusive end. */
  nextPayday: string;
  /** Paycheck-kind income landing on `payday`. */
  paycheckTotal: number;
  /** Side income (rent, gigs) landing anywhere inside this check's window —
   * money that genuinely helps cover the window's bills. */
  sideTotal: number;
  /** paycheckTotal + sideTotal: everything arriving in this window. */
  incomeTotal: number;
  /** Every bill occurrence due in [payday, nextPayday), earliest first. */
  bills: CalendarBill[];
  totalBills: number;
  /** Whether this check's income alone covers everything due against it. */
  fits: boolean;
  /** How far short the check falls (0 when it fits). */
  shortBy: number;
}

/**
 * Group upcoming bill occurrences by the paycheck that funds them, starting
 * at the NEXT payday (the current, already-landed check is covered by the
 * Budget page's "this cycle so far" view, not this calendar) and looking
 * `checksAhead` checks into the future.
 */
export function billsByCheck(
  sources: IncomeSource[],
  buckets: Bucket[],
  expenses: Expense[],
  todayISO: string,
  checksAhead = 4,
): CheckBillGroup[] {
  const cycle = currentPayCycle(sources, todayISO);
  if (!cycle) return [];

  const paychecks = sources.filter((s) => s.kind === "paycheck");
  const sideSources = sources.filter(
    (s) => s.kind === "side" && s.frequency !== "irregular",
  );
  const nameById = new Map(buckets.map((b) => [b.id, b.name]));
  const bucketName = (id: string | null) =>
    id === null ? "Savings / leftover" : nameById.get(id) ?? "Unknown";

  // Gather future paydays starting at the next one. ~40 days per check is
  // generous headroom even for monthly frequencies.
  const horizonEnd = addDays(parseISO(cycle.nextPayday), 40 * checksAhead);
  const boundarySet = new Set<string>();
  boundarySet.add(cycle.nextPayday);
  for (const s of paychecks) {
    for (const d of generatePayDates(s, parseISO(cycle.nextPayday), horizonEnd)) {
      boundarySet.add(toISO(d));
    }
  }
  const boundaries = [...boundarySet].sort().slice(0, checksAhead + 1);
  if (boundaries.length < 2) return [];

  const groups: CheckBillGroup[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const startDate = parseISO(start);
    const inclusiveEnd = addDays(parseISO(end), -1);

    const paycheckTotal = round2(
      paychecks
        .filter((s) => generatePayDates(s, startDate, startDate).length > 0)
        .reduce((sum, s) => sum + s.amount, 0),
    );

    // Side income counts toward covering the window, PRORATED by the window's
    // length rather than by exact landing dates. Monthly rent against a
    // semimonthly check would otherwise fall on one side of a boundary and
    // make alternating windows look impossible — the mortgage due the 29th is
    // really paid out of rent that arrived, not out of thin air.
    const windowDays = Math.max(1, diffDays(startDate, parseISO(end)));
    const sideTotal = round2(
      sideSources.reduce(
        (sum, s) =>
          sum +
          ((s.amount * (SIDE_PER_YEAR[s.frequency] ?? 0)) / 365.25) * windowDays,
        0,
      ),
    );
    const incomeTotal = round2(paycheckTotal + sideTotal);

    const bills: CalendarBill[] = [];
    for (const e of expenses) {
      if (e.isPaused) continue;
      for (const d of generateOccurrences(e.dueDate, e.cadence, startDate, inclusiveEnd)) {
        bills.push({
          expenseId: e.id,
          name: e.name,
          amount: e.amount,
          dueDate: toISO(d),
          bucketId: e.bucketId,
          bucketName: bucketName(e.bucketId),
        });
      }
    }
    bills.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

    const totalBills = round2(bills.reduce((sum, b) => sum + b.amount, 0));
    const shortBy = round2(Math.max(0, totalBills - incomeTotal));

    groups.push({
      payday: start,
      nextPayday: end,
      paycheckTotal,
      sideTotal,
      incomeTotal,
      bills,
      totalBills,
      fits: shortBy === 0,
      shortBy,
    });
  }

  return groups;
}
