import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { InstantAction } from "@/components/InstantAction";
import { LegalFooter } from "@/components/LegalFooter";
import { togglePaused, undoRestore } from "@/app/actions";
import { computeTodayBalances } from "@/lib/balances";
import { crisisPlan } from "@/lib/crisisPlan";
import { getDashboardData } from "@/lib/data";
import { cycleHistory, runway } from "@/lib/engine";
import {
  bucketToEngine,
  expenseShare,
  expenseToEngine,
  incomeToEngine,
} from "@/lib/rows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Crisis mode: the plan for the worst day, ready before it happens. Runway
 * at the current pace, runway on essentials only, and the ranked list of
 * what to pause first — each with a one-tap pause.
 */
export default async function CrisisPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getDashboardData();
  if (data.buckets.length === 0) redirect("/");
  const todayISO = new Date().toISOString().slice(0, 10);

  const balances = computeTodayBalances(data, todayISO);
  const liquid = balances
    ? Math.round(Object.values(balances).reduce((s, v) => s + v, 0) * 100) / 100
    : 0;

  const accountCreatedISO = (user.created_at ?? todayISO).slice(0, 10);
  const cycles = cycleHistory(
    data.income.map(incomeToEngine),
    data.buckets.map(bucketToEngine),
    data.expenses.map(expenseToEngine),
    todayISO,
    6,
  ).cycles.filter((c) => c.cycleStart >= accountCreatedISO);
  const currentRunway = runway(liquid, cycles);

  // Split bills count at YOUR share.
  const shareAdjusted = data.expenses.map((e) => ({ ...e, amount: expenseShare(e) }));
  const plan = crisisPlan(liquid, shareAdjusted, data.buckets);

  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <div>
          <h1 className="text-2xl font-black text-white">If the income stopped today 🧯</h1>
          <p className="mt-1 text-sm text-slate-400">
            Nobody plans to need this page. Having it ready is the plan. All
            numbers are yours, computed from what you&apos;ve entered — no
            drama, no averages from the internet.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs text-slate-400">Money on hand</p>
            <p className="mt-1 text-2xl font-black text-white">{currency.format(plan.liquid)}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs text-slate-400">Lasts at your CURRENT pace</p>
            <p
              className={`mt-1 text-2xl font-black ${
                currentRunway && currentRunway.days < 30 ? "text-red-300" : "text-amber-300"
              }`}
            >
              {currentRunway ? `${currentRunway.days} days` : "—"}
            </p>
            {currentRunway && (
              <p className="mt-1 text-xs text-slate-400">
                {`at ${currency.format(currentRunway.avgDailySpend)}/day, your real recent pace`}
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs text-slate-400">Lasts on ESSENTIALS only</p>
            <p className="mt-1 text-2xl font-black text-emerald-300">
              {plan.essentialRunwayDays !== null ? `${plan.essentialRunwayDays} days` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {`bills in non-flexible buckets: ${currency.format(plan.essentialMonthly)}/mo`}
            </p>
          </div>
        </div>

        {plan.candidates.length > 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-white">Pause these first</h2>
              <p className="text-sm text-slate-400">
                {`${currency.format(plan.cutMonthly)}/mo still cuttable`}
              </p>
            </div>
            <p className="mb-3 mt-1 text-xs text-slate-400">
              Bills living in flexible buckets — the wants, biggest first.
              Pausing here stops them from draining the projection until you
              resume them.
            </p>
            <ul className="space-y-1">
              {plan.candidates.map((c) => (
                <li
                  key={c.expenseId}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-sm ${
                    c.isPaused ? "opacity-50" : ""
                  }`}
                >
                  <span className="text-slate-200">
                    {c.name}
                    <span className="ml-2 text-xs text-slate-400">{`${currency.format(c.monthlyCost)}/mo · ${c.bucketName}`}</span>
                    {c.isPaused && (
                      <span className="ml-2 rounded bg-slate-500/30 px-1.5 py-0.5 text-xs text-slate-300">
                        paused ⏸
                      </span>
                    )}
                  </span>
                  {!c.isPaused && (
                    <InstantAction
                      action={togglePaused}
                      undoAction={undoRestore}
                      values={{ table: "expenses", id: c.expenseId, paused: "true" }}
                      message={`Paused ${c.name} — ${currency.format(c.monthlyCost)}/mo stays put until you resume it.`}
                      className="rounded bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
                    >
                      pause it
                    </InstantAction>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
            No bills live in flexible buckets, so there&apos;s nothing obvious
            to cut — your plan is already lean, or your bills need buckets.
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
          <p className="font-semibold text-slate-200">The rest of the playbook</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            <li>
              File for unemployment the same week — it starts from filing, not
              from job loss.
            </li>
            <li>
              Call lenders BEFORE missing a payment; hardship programs exist
              and answering early is leverage.
            </li>
            <li>
              Run the{" "}
              <Link href="/budget" className="text-sky-300 hover:text-sky-200">
                income shock simulator
              </Link>{" "}
              to see the projection with zero paychecks.
            </li>
          </ul>
        </div>
      </div>
      <LegalFooter disclaimer />
    </AppShell>
  );
}
