/**
 * Today's balance per bucket: replay the current pay cycle (paychecks, bills,
 * windfalls, transfers) from the last payday to now. Shared by the Dashboard
 * and Budget pages — it powers the overdraft popup and the envelope bars.
 */
import { UNALLOCATED_KEY, currentPayCycle, runProjection } from "@/lib/engine";
import {
  LIQUID_CATEGORIES,
  bucketToEngine,
  expenseToEngine,
  incomeEntryToEngine,
  incomeToEngine,
  transferToEngine,
  type DashboardData,
} from "@/lib/rows";

/**
 * Money in savings at the start of the current cycle: the savings bucket's
 * stated starting balance, else the liquid assets from Net Worth. Every
 * cycle replay needs this seed — without it the app assumes you began the
 * cycle at $0 and every large bill looks like a catastrophe.
 */
export function cycleStartSavings(data: DashboardData): number {
  const savingsBucket = data.buckets.find((b) => b.is_savings);
  if (savingsBucket && Number(savingsBucket.starting_balance) > 0) {
    return Number(savingsBucket.starting_balance);
  }
  return data.netWorth
    .filter((i) => i.kind === "asset" && LIQUID_CATEGORIES.includes(i.category))
    .reduce((s, i) => s + Number(i.amount), 0);
}

/** Balance per bucket id today; "" = savings/leftover. Undefined without a cycle. */
export function computeTodayBalances(
  data: DashboardData,
  todayISO: string,
): Record<string, number> | undefined {
  const engineIncome = data.income.map(incomeToEngine);
  const cycle = currentPayCycle(engineIncome, todayISO);
  if (!cycle) return undefined;

  const savingsBucket = data.buckets.find((b) => b.is_savings);
  const startingSavings = cycleStartSavings(data);

  const replay = runProjection({
    startDate: cycle.lastPayday,
    months: 1,
    startingBalances: {
      [savingsBucket ? savingsBucket.id : UNALLOCATED_KEY]: startingSavings,
    },
    incomeSources: engineIncome,
    buckets: data.buckets.map(bucketToEngine),
    expenses: data.expenses.map(expenseToEngine),
    incomeEntries: data.incomeEntries.map(incomeEntryToEngine),
    transfers: data.transfers.map(transferToEngine),
  });
  const todayPoint =
    replay.points.find((p) => p.date === todayISO) ?? replay.points[0];

  const balances: Record<string, number> = {};
  for (const b of data.buckets) {
    if (b.is_savings) continue;
    balances[b.id] = todayPoint.buckets[b.id] ?? 0;
  }
  balances[""] = savingsBucket
    ? todayPoint.buckets[savingsBucket.id] ?? 0
    : todayPoint.buckets[UNALLOCATED_KEY] ?? 0;
  return balances;
}
