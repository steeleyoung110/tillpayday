import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { NetWorthSection } from "@/components/NetWorthSection";
import { ProjectionSection } from "@/components/ProjectionSection";
import { SetupNotice } from "@/components/SetupNotice";
import {
  BucketsPanel,
  ExpensesPanel,
  IncomePanel,
  WhatIfPanel,
} from "@/components/panels";
import { CelebrationOverlay } from "@/components/CelebrationOverlay";
import { Onboarding } from "@/components/Onboarding";
import { getDashboardData } from "@/lib/data";
import { paydayRecap, safeToSpend } from "@/lib/engine";
import { nextPayday, paydayLabel } from "@/lib/payday";
import {
  LIQUID_CATEGORIES,
  bucketToEngine,
  expenseToEngine,
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

export default async function Home() {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getDashboardData();
  const todayISO = new Date().toISOString().slice(0, 10);

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
  const sts = safeToSpend(engineIncome, engineBuckets, engineExpenses, todayISO);

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
  );
  const celebratedSet = new Set(data.celebrated.map((c) => c.payday));
  const showCelebration = recap !== null && !celebratedSet.has(recap.payday);

  const header = (
    <header className="border-b border-slate-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <h1 className="text-xl font-bold text-white">
          Till <span className="text-emerald-400">Payday</span>
        </h1>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{user.email}</span>
          <form action={signOut}>
            <button className="rounded-lg border border-slate-700 px-3 py-1.5 transition hover:border-slate-500">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );

  // First visit (no buckets yet): the three-question setup replaces the
  // dashboard until it's done.
  if (data.buckets.length === 0) {
    return (
      <main className="min-h-screen bg-slate-950 pb-16">
        {header}
        <Onboarding hasIncome={data.income.length > 0} todayISO={todayISO} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 pb-16">
      {showCelebration && recap && (
        <CelebrationOverlay
          recap={recap}
          goal={savingsRow ? Number(savingsRow.goal_amount) : 0}
        />
      )}
      {header}

      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-6">
        {/* Safe-to-spend hero */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-400">{`Welcome back, ${displayName} 👋`}</p>
            {payday && (
              <p className="rounded-lg bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300">
                {paydayLabel(payday, todayISO)}
              </p>
            )}
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
              {'Mark a bucket as "flexible" 💸 below and this becomes your daily '}
              safe-to-spend number.
            </p>
          ) : (
            <p className="mt-3 text-lg text-slate-300">
              Add your paycheck below to unlock your daily safe-to-spend number.
            </p>
          )}
        </div>

        <h2 className="pt-2 text-lg font-semibold text-white">
          Step 1 — What you&apos;re worth today
        </h2>
        <NetWorthSection data={data} />

        <h2 className="pt-4 text-lg font-semibold text-white">
          Step 2 — Where your paychecks take you
        </h2>
        <ProjectionSection data={data} todayISO={todayISO} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <IncomePanel data={data} />
          <BucketsPanel data={data} />
          <ExpensesPanel data={data} />
          <WhatIfPanel data={data} />
        </div>
      </div>
    </main>
  );
}
