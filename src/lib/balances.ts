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

/** Balance per bucket id today; "" = savings/leftover. Undefined without a cycle. */
export function computeTodayBalances(
  data: DashboardData,
  todayISO: string,
): Record<string, number> | undefined {
  const engineIncome = data.income.map(incomeToEngine);
  const cycle = currentPayCycle(engineIncome, todayISO);
  if (!cycle) return undefined;

  const savingsBucket = data.buckets.find((b) => b.is_savings);
  const liquidNow = data.netWorth
    .filter((i) => i.kind === "asset" && LIQUID_CATEGORIES.includes(i.category))
    .reduce((s, i) => s + Number(i.amount), 0);
  const startingSavings =
    savingsBucket && Number(savingsBucket.starting_balance) > 0
      ? Number(savingsBucket.starting_balance)
      : liquidNow;

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
