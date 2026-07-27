/**
 * Nudges: the moments worth speaking up about, computed from the same data
 * the dashboard already loads. Pure — data in, nudge list out — so the
 * in-app banners and the daily email route share one brain.
 */
import { computeTodayBalances } from "@/lib/balances";
import {
  addDays,
  currentPayCycle,
  generateOccurrences,
  parseISO,
  toISO,
} from "@/lib/engine";
import { incomeToEngine, type DashboardData } from "@/lib/rows";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export type NudgeType = "bill-underfunded" | "payday-tomorrow" | "savings-negative";

export interface Nudge {
  type: NudgeType;
  message: string;
}

/**
 * Everything worth flagging today: bills landing within `daysAhead` days
 * whose bucket isn't holding enough, payday-tomorrow, and negative savings.
 * The dashboard renders bill/payday nudges (it has its own red savings
 * alert); the email route sends all three.
 */
export function computeNudges(
  data: DashboardData,
  todayISO: string,
  daysAhead = 2,
): Nudge[] {
  const nudges: Nudge[] = [];
  const balances = computeTodayBalances(data, todayISO);
  if (!balances) return nudges;

  const start = parseISO(todayISO);
  const end = addDays(start, daysAhead);
  const savingsBucket = data.buckets.find((b) => b.is_savings);

  for (const e of data.expenses) {
    if (e.is_paused) continue;
    for (const d of generateOccurrences(e.due_date, e.cadence, start, end)) {
      const dueISO = toISO(d);
      const key = e.bucket_id === null || e.bucket_id === savingsBucket?.id ? "" : e.bucket_id;
      const holding = balances[key] ?? 0;
      const amount = Number(e.amount);
      if (holding >= amount) continue;
      const bucketName =
        key === ""
          ? savingsBucket?.name ?? "Savings / leftover"
          : data.buckets.find((b) => b.id === key)?.name ?? "its bucket";
      const when = dueISO === todayISO ? "today" : `on ${dueISO}`;
      nudges.push({
        type: "bill-underfunded",
        message: `${e.name} (${currency.format(amount)}) is due ${when} — ${bucketName} is holding ${currency.format(holding)}. The difference will raid your other buckets, fun money first.`,
      });
    }
  }

  const cycle = currentPayCycle(data.income.map(incomeToEngine), todayISO);
  if (cycle && cycle.daysUntilPayday === 1) {
    nudges.push({
      type: "payday-tomorrow",
      message: "Payday lands tomorrow — your buckets sweep and refill in the morning.",
    });
  }

  if ((balances[""] ?? 0) < 0) {
    nudges.push({
      type: "savings-negative",
      message: `Your savings is ${currency.format(Math.abs(balances[""]))} in the red. Everything else drained first — this is the real number.`,
    });
  }

  return nudges;
}
