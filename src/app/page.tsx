import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CelebrationOverlay } from "@/components/CelebrationOverlay";
import { LegalFooter } from "@/components/LegalFooter";
import { Onboarding } from "@/components/Onboarding";
import { ProjectionSection } from "@/components/ProjectionSection";
import { SetupNotice } from "@/components/SetupNotice";
import { getDashboardData, getNetWorthData } from "@/lib/data";
import {
  cycleSpending,
  irregularWeeklyBaseline,
  paydayRecap,
  safeToSpend,
} from "@/lib/engine";
import { nextPayday, paydayLabel } from "@/lib/payday";
import {
  LIQUID_CATEGORIES,
  bucketToEngine,
  expenseToEngine,
  incomeEntryToEngine,
  incomeToEngine,
} from "@/lib/rows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const heroCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Dashboard: the read-only daily glance — safe-to-spend, payday countdown,
 * projection, warnings, celebrations. All managing happens on /budget.
 */
export default async function Home() {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [data, nw] = await Promise.all([getDashboardData(), getNetWorthData()]);
  const todayISO = new Date().toISOString().slice(0, 10);

  // 9E: friendly check-in nudge when net-worth values are 30+ days old.
  const nwTouches = [...nw.assets, ...nw.liabilities].map((i) =>
    new Date(i.updated_at).getTime(),
  );
  const staleNetWorth =
    nwTouches.length > 0 &&
    Date.now() - Math.max(...nwTouches) > 30 * 24 * 60 * 60 * 1000;

  const meta = user.user_metadata as Record<string, unknown>;
  const displayName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    user.email?.split("@")[0] ||
    "there";
  const payday = nextPayday(data.income, todayISO);
  const engineIncome = data.income.map(incomeToEngine);
  const engineBuckets = data.buckets.map(bucketToEngine);
  const engineExpenses = data.expenses.map(expenseToEngine);
  const engineEntries = data.incomeEntries.map(incomeEntryToEngine);
  const sts = safeToSpend(
    engineIncome,
    engineBuckets,
    engineExpenses,
    todayISO,
    engineEntries,
  );

  // Spent-so-far chip: what left the buckets since the last payday, as a
  // share of a typical check ("spent $360 — 64% of your check left").
  const spend = cycleSpending(engineIncome, engineExpenses, todayISO);
  const regularMax = Math.max(
    0,
    ...data.income
      .filter((s) => s.kind === "paycheck" && s.frequency !== "irregular")
      .map((s) => Number(s.amount)),
  );
  const typicalPaycheck = Math.max(
    regularMax,
    data.income.some((s) => s.frequency === "irregular")
      ? irregularWeeklyBaseline(engineEntries, todayISO)
      : 0,
  );
  const spentPct =
    spend && typicalPaycheck > 0
      ? Math.round((spend.total / typicalPaycheck) * 100)
      : 0;
  const leftPct = Math.max(0, 100 - spentPct);

  // Payday celebration: recap the latest payday unless it was already shown.
  const savingsRow = data.buckets.find((b) => b.is_savings);
  const liquid = data.netWorth
    .filter((i) => i.kind === "asset" && LIQUID_CATEGORIES.includes(i.category))
    .reduce((sum, i) => sum + Number(i.amount), 0);
  const startingSavings =
    savingsRow && Number(savingsRow.starting_balance) > 0
      ? Number(savingsRow.starting_balance)
      : liquid;
  const recap = paydayRecap(
    engineIncome,
    engineBuckets,
    engineExpenses,
    startingSavings,
    todayISO,
    engineEntries,
  );
  const celebratedSet = new Set(data.celebrated.map((c) => c.payday));
  const showCelebration = recap !== null && !celebratedSet.has(recap.payday);

  // First visit (no buckets yet): the three-question setup replaces the
  // dashboard until it's done.
  if (data.buckets.length === 0) {
    return (
      <AppShell active="dashboard">
        <Onboarding hasIncome={data.income.length > 0} todayISO={todayISO} />
        <LegalFooter />
      </AppShell>
    );
  }

  return (
    <AppShell active="dashboard">
      {showCelebration && recap && (
        <CelebrationOverlay
          recap={recap}
          goal={savingsRow ? Number(savingsRow.goal_amount) : 0}
        />
      )}

      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-6">
        {staleNetWorth && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-6 py-4">
            <p className="text-sm text-sky-200">
              Quick net-worth check-in? Takes 2 minutes — numbers drift, and
              that&apos;s completely normal.
            </p>
            <Link
              href="/net-worth"
              className="rounded-lg bg-sky-500/20 px-3 py-1.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/30"
            >
              Update my numbers →
            </Link>
          </div>
        )}

        {/* Safe-to-spend hero */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-400">{`Welcome back, ${displayName} 👋`}</p>
            <span className="flex flex-wrap items-center gap-2">
              {spend && spend.total > 0 && typicalPaycheck > 0 && (
                <p className="rounded-lg bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-300">
                  {leftPct > 0
                    ? `spent ${heroCurrency.format(spend.total)} this cycle — ${leftPct}% of your check left`
                    : `spent ${heroCurrency.format(spend.total)} this cycle — this check's fully spoken for`}
                </p>
              )}
              {payday && (
                <p className="rounded-lg bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300">
                  {paydayLabel(payday, todayISO)}
                </p>
              )}
            </span>
          </div>

          {sts && sts.hasFlexibleBuckets ? (
            <div className="mt-2">
              <p className="text-6xl font-black tracking-tight text-white sm:text-7xl">
                {heroCurrency.format(sts.perDay)}
                <span className="ml-1 text-2xl font-semibold text-slate-400">/day</span>
              </p>
              <p className="mt-2 text-lg font-semibold text-emerald-300">
                {`safe to spend today — ${
                  sts.daysUntilPayday === 1
                    ? "1 day"
                    : `${sts.daysUntilPayday} days`
                } till payday`}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {sts.flexibleBalance > 0
                  ? `Based on ${heroCurrency.format(sts.flexibleBalance)} left across your flexible buckets. Spend less than this today and tomorrow's number goes up.`
                  : "Your flexible buckets are empty this cycle — hang tight till payday."}
              </p>
            </div>
          ) : sts ? (
            <p className="mt-3 text-lg text-slate-300">
              {'Mark a bucket as "flexible" 💸 in your '}
              <Link href="/budget" className="text-sky-300 hover:text-sky-200">
                Budget
              </Link>
              {" and this becomes your daily safe-to-spend number."}
            </p>
          ) : (
            <p className="mt-3 text-lg text-slate-300">
              {"Add your paycheck in your "}
              <Link href="/budget" className="text-sky-300 hover:text-sky-200">
                Budget
              </Link>
              {" to unlock your daily safe-to-spend number."}
            </p>
          )}
        </div>

        <ProjectionSection data={data} todayISO={todayISO} />

        {/* The glance ends here — changes live in Budget. */}
        <Link
          href="/budget"
          className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-6 py-4 transition hover:border-emerald-400/50"
        >
          <span className="text-sm text-slate-300">
            🪣 Need to change something? Buckets, income, bills, and what-ifs
            live in your Budget.
          </span>
          <span className="text-sm font-semibold text-emerald-300">
            Manage budget →
          </span>
        </Link>
      </div>
      <LegalFooter disclaimer />
    </AppShell>
  );
}
