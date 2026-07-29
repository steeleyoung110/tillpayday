/**
 * Nudges: the moments worth speaking up about, computed from the same data
 * the dashboard already loads. Pure — data in, nudge list out — so the
 * in-app banners and the daily email route share one brain.
 */
import { computeTodayBalances } from "@/lib/balances";
import {
  addDays,
  currentPayCycle,
  dangerDay,
  generateOccurrences,
  parseISO,
  toISO,
} from "@/lib/engine";
import {
  bucketToEngine,
  expenseToEngine,
  incomeEntryToEngine,
  incomeToEngine,
  transferToEngine,
  type DashboardData,
} from "@/lib/rows";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export type NudgeType =
  | "bill-underfunded"
  | "payday-tomorrow"
  | "savings-negative"
  | "renewal-soon"
  | "danger-tomorrow"
  | "manual-due"
  | "autopay-check";

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

  // Autopay audit: manual bills fail when YOU forget; autopay bills fail
  // when the charge silently doesn't happen. Different reminders for each.
  for (const e of data.expenses) {
    if (e.is_paused || e.autopay === null || e.autopay === undefined) continue;
    if (e.autopay === false) {
      // Manual: due today or tomorrow → it's on you.
      for (const d of generateOccurrences(e.due_date, e.cadence, start, addDays(start, 1))) {
        const when = toISO(d) === todayISO ? "TODAY" : "tomorrow";
        nudges.push({
          type: "manual-due",
          message: `${e.name} (${currency.format(Number(e.amount))}) is due ${when} and it's on YOU to pay it — no autopay is catching this one.`,
        });
      }
    } else {
      // Autopay: went due yesterday → confirm the robot actually did its job.
      const yesterday = addDays(start, -1);
      if (generateOccurrences(e.due_date, e.cadence, yesterday, yesterday).length > 0) {
        nudges.push({
          type: "autopay-check",
          message: `${e.name} should have auto-paid yesterday — a 10-second glance at your bank confirms the robot did its job.`,
        });
      }
    }
  }

  // Contract watch: renewals inside the shopping window (30 days out), and a
  // just-renewed check-in (7 days after) — did the price quietly move?
  for (const e of data.expenses) {
    if (!e.renewal_date || e.is_paused) continue;
    const daysTo = Math.round(
      (Date.parse(e.renewal_date) - Date.parse(todayISO)) / 86400000,
    );
    if (daysTo >= 0 && daysTo <= 30) {
      nudges.push({
        type: "renewal-soon",
        message: `${e.name} renews ${daysTo === 0 ? "today" : `in ${daysTo} day${daysTo === 1 ? "" : "s"} (${e.renewal_date})`} — this is the window to shop it around. Loyalty is usually the expensive option.`,
      });
    } else if (daysTo < 0 && daysTo >= -7) {
      nudges.push({
        type: "renewal-soon",
        message: `${e.name} renewed on ${e.renewal_date} — check whether the price moved, and bump its renewal date to next year.`,
      });
    }
  }

  // Danger-day heads-up: tomorrow is the projected low point and it's thin.
  const tomorrowISO = toISO(addDays(start, 1));
  const danger = dangerDay(
    data.income.map(incomeToEngine),
    data.buckets.map(bucketToEngine),
    data.expenses.map(expenseToEngine),
    todayISO,
    data.incomeEntries.map(incomeEntryToEngine),
    data.transfers.map(transferToEngine),
  );
  if (danger && danger.date === tomorrowISO && (danger.negative || danger.low < 50)) {
    nudges.push({
      type: "danger-tomorrow",
      message: danger.negative
        ? `Tomorrow is your tightest day before payday — projected ${currency.format(Math.abs(danger.low))} NEGATIVE${danger.causes[0] ? ` when ${danger.causes[0].name} lands` : ""}. Move money today.`
        : `Tomorrow is your tightest day before payday — projected low of ${currency.format(danger.low)}${danger.causes[0] ? ` after ${danger.causes[0].name}` : ""}.`,
    });
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
