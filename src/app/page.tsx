import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CelebrationOverlay } from "@/components/CelebrationOverlay";
import { LegalFooter } from "@/components/LegalFooter";
import { Onboarding } from "@/components/Onboarding";
import { ProjectionSection } from "@/components/ProjectionSection";
import { SetupNotice } from "@/components/SetupNotice";
import { DebtOutlook } from "@/components/DebtOutlook";
import { QuickSpend } from "@/components/QuickSpend";
import { computeTodayBalances } from "@/lib/balances";
import { classifyBucket, planColor } from "@/lib/bucketColor";
import { computeNudges } from "@/lib/nudges";
import { getDashboardData, getNetWorthData, resolveViewUser } from "@/lib/data";
import {
  cycleHistory,
  cycleSpending,
  irregularWeeklyBaseline,
  paydayRecap,
  runway,
  safeToSpend,
  spendAnomalies,
} from "@/lib/engine";
import { nextPayday, paydayLabel } from "@/lib/payday";
import {
  LIQUID_CATEGORIES,
  bucketToEngine,
  expenseToEngine,
  incomeEntryToEngine,
  incomeToEngine,
  transferToEngine,
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
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Read-only household view: ?view=<ownerId> works only when that owner
  // has shared their budget with this account; anything else falls back to
  // your own dashboard.
  const { view } = await searchParams;
  const viewUid = await resolveViewUser(view);
  if (view && viewUid === null) redirect("/");
  const uid = viewUid ?? user.id;
  const viewing = uid !== user.id;
  let viewingOwnerEmail: string | null = null;
  if (viewing) {
    const { data: grant } = await supabase
      .from("shared_access")
      .select("owner_email")
      .eq("owner_id", uid)
      .maybeSingle();
    viewingOwnerEmail = grant?.owner_email || "someone";
  }

  const [data, nw] = await Promise.all([
    getDashboardData(uid),
    getNetWorthData(uid),
  ]);
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
  const engineTransfers = data.transfers.map(transferToEngine);
  const sts = safeToSpend(
    engineIncome,
    engineBuckets,
    engineExpenses,
    todayISO,
    engineEntries,
    engineTransfers,
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
    engineTransfers,
  );
  const celebratedSet = new Set(data.celebrated.map((c) => c.payday));
  const showCelebration = recap !== null && !celebratedSet.has(recap.payday);

  // Nudges: bills landing in the next 2 days that their bucket can't cover,
  // and payday-tomorrow. (Negative savings has its own red alert below.)
  const nudges = computeNudges(data, todayISO).filter(
    (n) => n.type !== "savings-negative",
  );

  // Honest-mirror insights: runway (how long the money on hand lasts at your
  // real spending pace) and buckets running above your OWN average. Both use
  // completed cycles since signup only — no fabricated pre-signup history.
  const accountCreatedISO = (user.created_at ?? todayISO).slice(0, 10);
  const completedCycles = cycleHistory(
    engineIncome,
    engineBuckets,
    engineExpenses,
    todayISO,
    6,
  ).cycles.filter((c) => c.cycleStart >= accountCreatedISO);
  const balancesToday = computeTodayBalances(data, todayISO);
  const liquidToday = balancesToday
    ? Math.round(Object.values(balancesToday).reduce((s, v) => s + v, 0) * 100) / 100
    : 0;
  const runwayInfo = runway(liquidToday, completedCycles);
  const anomalies = spendAnomalies(spend, completedCycles);

  // Semantic colors for the celebration's split bars — the same virtue
  // spectrum as the Budget pies and envelope bars, so money reads as one
  // system wherever it shows up.
  const celebrationColors: Record<string, string> = {};
  if (recap) {
    const familyCount: Record<string, number> = {};
    for (const s of recap.split) {
      const row = s.bucketId ? data.buckets.find((b) => b.id === s.bucketId) : undefined;
      const cat = classifyBucket(s.name, {
        isSavings: (row?.is_savings ?? false) || s.bucketId === null,
        isFlexible: row?.is_flexible,
      });
      const idx = familyCount[cat] ?? 0;
      familyCount[cat] = idx + 1;
      celebrationColors[s.bucketId ?? "savings"] = planColor(cat, idx);
    }
  }

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
      {!viewing && showCelebration && recap && (
        <CelebrationOverlay
          recap={recap}
          goal={savingsRow ? Number(savingsRow.goal_amount) : 0}
          bucketColors={celebrationColors}
        />
      )}

      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-6">
        {viewing && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-500/40 bg-violet-500/10 px-6 py-4">
            <p className="text-sm font-semibold text-violet-200">
              {`👀 Viewing ${viewingOwnerEmail}'s budget — read-only. Their numbers, their plan.`}
            </p>
            <Link
              href="/"
              className="text-sm font-semibold text-violet-300 transition hover:text-violet-200"
            >
              Back to mine →
            </Link>
          </div>
        )}
        {recap !== null && recap.savingsTotal < 0 && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-4">
            <p className="text-sm font-semibold text-red-200">
              {`⚠️ Your savings is ${heroCurrency.format(Math.abs(recap.savingsTotal))} in the red.`}
            </p>
            <p className="mt-1 text-sm text-red-200/80">
              Buckets keep refilling, but they&apos;re filling on borrowed
              ground — new bills are coming out of money you don&apos;t have.
              Time to pull from another bucket, trim a refill, or pause a bill
              until this climbs back above zero.
            </p>
          </div>
        )}

        {!viewing && nudges.map((n) => (
          <div
            key={n.message}
            className={`rounded-2xl border px-6 py-4 ${
              n.type === "payday-tomorrow"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-amber-500/40 bg-amber-500/10"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                n.type === "payday-tomorrow" ? "text-emerald-200" : "text-amber-200"
              }`}
            >
              {n.type === "payday-tomorrow" ? `🎉 ${n.message}` : `⏰ ${n.message}`}
            </p>
          </div>
        ))}

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

        {(runwayInfo || anomalies.length > 0) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {runwayInfo && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
                <p className="text-sm text-slate-400">
                  If your paycheck stopped today
                </p>
                <p
                  className={`mt-1 text-4xl font-black tracking-tight ${
                    runwayInfo.days < 14
                      ? "text-red-300"
                      : runwayInfo.days < 45
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }`}
                >
                  {`${runwayInfo.days} day${runwayInfo.days === 1 ? "" : "s"}`}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {`That's how long ${heroCurrency.format(runwayInfo.liquid)} on hand lasts at your real pace of ${heroCurrency.format(runwayInfo.avgDailySpend)}/day. This number growing is the whole game.`}
                </p>
              </div>
            )}
            {anomalies.length > 0 && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-5">
                <p className="text-sm font-semibold text-amber-200">
                  Above your own average — with days still to go
                </p>
                <ul className="mt-2 space-y-1">
                  {anomalies.map((a) => (
                    <li key={a.bucketId ?? "savings"} className="text-sm text-amber-100/90">
                      {`${a.bucketName}: ${heroCurrency.format(a.current)} so far this cycle — ${a.pctAbove}% above your usual ${heroCurrency.format(a.average)} for a FULL cycle.`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!viewing && (
          <QuickSpend
            data={data}
            balances={balancesToday}
            todayISO={todayISO}
          />
        )}

        <ProjectionSection
          data={data}
          todayISO={todayISO}
          anchorISO={viewing ? todayISO : (user.created_at ?? todayISO).slice(0, 10)}
        />

        <DebtOutlook liabilities={nw.liabilities} todayISO={todayISO} />

        {/* The glance ends here — changes live in Budget. */}
        {!viewing && (
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
        )}
      </div>
      <LegalFooter disclaimer />
    </AppShell>
  );
}
