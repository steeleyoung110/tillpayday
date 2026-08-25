import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LegalFooter } from "@/components/LegalFooter";
import { completeReview } from "@/app/actions";
import { cycleStartSavings } from "@/lib/balances";
import { getDashboardData } from "@/lib/data";
import {
  addDays,
  dangerDay,
  generateOccurrences,
  parseISO,
  toISO,
} from "@/lib/engine";
import { merchantLeaderboard } from "@/lib/merchants";
import { relativeDayWithDate } from "@/lib/relativeDate";
import {
  bucketToEngine,
  expenseShare,
  expenseToEngine,
  incomeEntryToEngine,
  incomeToEngine,
  transferToEngine,
} from "@/lib/rows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Monday of the week containing `iso`. */
function weekStartOf(iso: string): string {
  const d = parseISO(iso);
  const dow = d.getUTCDay(); // 0=Sun
  return toISO(addDays(d, dow === 0 ? -6 : 1 - dow));
}

/**
 * The weekly review: a 2-minute honest look backward and forward. What left
 * this week, what's coming next week, where the low point is, and one thing
 * to skip. Done → the streak grows.
 */
export default async function ReviewPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getDashboardData();
  if (data.buckets.length === 0) redirect("/");
  const todayISO = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartOf(todayISO);
  const weekAgo = toISO(addDays(parseISO(todayISO), -7));
  const twoWeeksAgo = toISO(addDays(parseISO(todayISO), -14));
  const weekAhead = toISO(addDays(parseISO(todayISO), 7));

  // Backward: one-time spends, this 7 days vs the 7 before.
  const spends = data.expenses.filter((e) => e.cadence === "one_time" && !e.is_paused);
  const thisWeek = spends.filter((e) => e.due_date > weekAgo && e.due_date <= todayISO);
  const lastWeek = spends.filter((e) => e.due_date > twoWeeksAgo && e.due_date <= weekAgo);
  const sum = (rows: typeof thisWeek) =>
    Math.round(rows.reduce((s, e) => s + expenseShare(e), 0) * 100) / 100;
  const thisTotal = sum(thisWeek);
  const lastTotal = sum(lastWeek);

  // Forward: bill occurrences in the next 7 days.
  const upcoming: { name: string; amount: number; due: string }[] = [];
  for (const e of data.expenses) {
    if (e.is_paused) continue;
    for (const d of generateOccurrences(
      e.due_date,
      e.cadence,
      addDays(parseISO(todayISO), 1),
      parseISO(weekAhead),
    )) {
      upcoming.push({ name: e.name, amount: expenseShare(e), due: toISO(d) });
    }
  }
  upcoming.sort((a, b) => (a.due < b.due ? -1 : 1));

  const danger = dangerDay(
    data.income.map(incomeToEngine),
    data.buckets.map(bucketToEngine),
    data.expenses.map(expenseToEngine),
    todayISO,
    data.incomeEntries.map(incomeEntryToEngine),
    data.transfers.map(transferToEngine),
    cycleStartSavings(data),
  );

  // One thing to skip: your biggest merchant of the last 30 days.
  const topMerchant = merchantLeaderboard(data.expenses, todayISO, 30, 1)[0] ?? null;

  // Streak: consecutive weeks (including this one if done).
  const { data: checkins } = await supabase
    .from("review_checkins")
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(60);
  const done = new Set((checkins ?? []).map((c: { week_start: string }) => c.week_start));
  const doneThisWeek = done.has(weekStart);
  let streak = 0;
  let cursor = doneThisWeek ? weekStart : toISO(addDays(parseISO(weekStart), -7));
  while (done.has(cursor)) {
    streak += 1;
    cursor = toISO(addDays(parseISO(cursor), -7));
  }

  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black text-white">Weekly review 🧭</h1>
            <p className="mt-1 text-sm text-slate-400">
              Two honest minutes. People who do this weekly stop being
              surprised by their own money.
            </p>
          </div>
          <p className="text-sm font-semibold text-emerald-300">
            {streak > 0 ? `${streak}-week streak` : "start your streak"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold text-white">1 · What left this week</h2>
          <p className="mt-1 text-sm text-slate-300">
            {thisWeek.length === 0
              ? "No spends logged in the last 7 days — quiet week or unlogged week. Only you know which."
              : `${thisWeek.length} spend${thisWeek.length === 1 ? "" : "s"}, ${currency.format(thisTotal)} total — ${
                  lastTotal > 0
                    ? thisTotal <= lastTotal
                      ? `${currency.format(lastTotal - thisTotal)} LESS than the week before. Keep that.`
                      : `${currency.format(thisTotal - lastTotal)} more than the week before. Worth a look below.`
                    : "no prior week to compare against yet."
                }`}
          </p>
          {thisWeek.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-400">
              {[...thisWeek]
                .sort((a, b) => Number(b.amount) - Number(a.amount))
                .slice(0, 6)
                .map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span>{`${e.name} · ${e.due_date}`}</span>
                    <span className="text-red-300">{`−${currency.format(expenseShare(e))}`}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold text-white">2 · What's coming next week</h2>
          {upcoming.length === 0 ? (
            <p className="mt-1 text-sm text-slate-300">
              No bills land in the next 7 days. Breathe.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              {upcoming.map((u) => (
                <li key={`${u.name}-${u.due}`} className="flex justify-between">
                  <span>{`${u.name} · ${u.due}`}</span>
                  <span>{currency.format(u.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {danger && (
            <p className="mt-3 text-sm text-amber-200">
              {`Tightest day before payday: ${relativeDayWithDate(danger.date, todayISO)} at ${currency.format(danger.low)}${danger.negative ? " — that's NEGATIVE. Fix it now, not then." : "."}`}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold text-white">3 · Pick one thing to skip</h2>
          <p className="mt-1 text-sm text-slate-300">
            {topMerchant
              ? `Your biggest merchant this month is ${topMerchant.name} — ${currency.format(topMerchant.total)} across ${topMerchant.count} visit${topMerchant.count === 1 ? "" : "s"}. Skipping ONE of those this week is the easiest money you'll make.`
              : "Nothing logged recently to pick from — next week's review will have a target."}
          </p>
        </div>

        {doneThisWeek ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-200">
            ✅ This week&apos;s review is done. Come back after Monday for the
            next one.
          </div>
        ) : (
          <form action={completeReview}>
            <input type="hidden" name="week_start" value={weekStart} />
            <button className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-lg font-bold text-slate-950 transition hover:bg-emerald-400">
              {`Done — mark week of ${weekStart} reviewed`}
            </button>
          </form>
        )}

        <p className="text-xs text-slate-400">
          <Link href="/" className="text-sky-300 hover:text-sky-200">
            ← Back to Dashboard
          </Link>
        </p>
      </div>
      <LegalFooter />
    </AppShell>
  );
}
