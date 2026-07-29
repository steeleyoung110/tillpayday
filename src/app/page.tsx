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
  ageOfMoney,
  billsByCheck,
  currentPayCycle,
  cycleHistory,
  cycleSpending,
  dangerDay,
  irregularWeeklyBaseline,
  noSpendStreak,
  paydayRecap,
  runway,
  safeToSpend,
  spendAnomalies,
  splitPaycheck,
} from "@/lib/engine";
import { AppBadge } from "@/components/AppBadge";
import { AffordCheck } from "@/components/AffordCheck";
import { EfundCard } from "@/components/EfundCard";
import { InstantAction } from "@/components/InstantAction";
import {
  addTransfer,
  adoptStarterSetup,
  applyDebtSweep,
  deleteExpense,
  dismissAnnouncement,
  markGoalAchieved,
  undoRestore,
} from "@/app/actions";
import { efundStatus, monthlyBillLoad } from "@/lib/efund";
import { freedomDay } from "@/lib/freedomDay";
import { detectShortCheck } from "@/lib/shortCheck";
import { expenseShare } from "@/lib/rows";
import { anniversaryWindow } from "@/lib/anniversary";
import { findDuplicateSpends } from "@/lib/dupes";
import { ReconcileCard } from "@/components/ReconcileCard";
import type { SpendPreset } from "@/components/PresetChips";
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
  let partnerCanEdit = false;
  if (viewing) {
    const { data: grant } = await supabase
      .from("shared_access")
      .select("owner_email, can_edit")
      .eq("owner_id", uid)
      .maybeSingle();
    viewingOwnerEmail = grant?.owner_email || "someone";
    partnerCanEdit = grant?.can_edit === true;
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
  const hourlyWage =
    typeof meta.hourly_wage === "number" && meta.hourly_wage > 0
      ? meta.hourly_wage
      : null;
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

  // Danger Day: the projected low-water mark between now and the next check.
  const danger = dangerDay(
    engineIncome,
    engineBuckets,
    engineExpenses,
    todayISO,
    engineEntries,
    engineTransfers,
  );

  // Short-check detector: a logged check well under typical this cycle.
  const payCycleNow = currentPayCycle(engineIncome, todayISO);
  const shortCheck = detectShortCheck(
    engineEntries,
    typicalPaycheck,
    payCycleNow?.lastPayday ?? null,
    todayISO,
  );
  const funBucketRow = data.buckets.find((b) => b.is_flexible && !b.is_savings);
  const funBalanceNow = funBucketRow
    ? Math.max(balancesToday?.[funBucketRow.id] ?? 0, 0)
    : 0;
  const trimAmount = shortCheck
    ? Math.min(shortCheck.shortBy, Math.round(funBalanceNow * 100) / 100)
    : 0;

  // Emergency fund: target months live on the auth user (default 3).
  const efMonths =
    typeof meta.ef_months === "number" && [1, 3, 6].includes(meta.ef_months)
      ? meta.ef_months
      : 3;
  const efLoad = monthlyBillLoad(
    data.expenses.map((e) => ({ ...e, amount: expenseShare(e) })),
  );
  const efStatus = efundStatus(efLoad, efMonths, liquidToday);

  // Freedom Day: the day this month stops working for the bills.
  const freedom = freedomDay(engineIncome, engineExpenses, todayISO);

  // Goal crossed? Celebrate it properly instead of a quiet line of text.
  const savingsNow = recap?.savingsTotal ?? liquidToday;
  const goalsCrossed = data.goals.filter(
    (g) =>
      !g.achieved_at && !g.is_archived && savingsNow >= Number(g.target_amount),
  );

  // Weekly review chip: this week's Monday, done-or-not, and the streak.
  const todayDow = new Date(`${todayISO}T00:00:00Z`).getUTCDay();
  const weekStartMs =
    Date.parse(todayISO) - (todayDow === 0 ? 6 : todayDow - 1) * 86400000;
  const weekStart = new Date(weekStartMs).toISOString().slice(0, 10);
  const { data: checkinRows } = await supabase
    .from("review_checkins")
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(20);
  const checkinSet = new Set(
    (checkinRows ?? []).map((c: { week_start: string }) => c.week_start),
  );
  const reviewDone = checkinSet.has(weekStart);
  let reviewStreak = 0;
  let reviewCursor = reviewDone
    ? weekStart
    : new Date(weekStartMs - 7 * 86400000).toISOString().slice(0, 10);
  while (checkinSet.has(reviewCursor)) {
    reviewStreak += 1;
    reviewCursor = new Date(Date.parse(reviewCursor) - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
  }

  // Duplicate-spend guard: same merchant + amount + day in the last 2 weeks.
  const dupes = viewing ? [] : findDuplicateSpends(data.expenses, 14, todayISO);

  // Yesterday's safe-to-spend, for the "why did my number change?" receipt.
  const yesterdayISO = new Date(Date.parse(todayISO) - 86400000)
    .toISOString()
    .slice(0, 10);
  const stsYesterday =
    sts && sts.hasFlexibleBuckets
      ? safeToSpend(
          engineIncome,
          engineBuckets,
          engineExpenses,
          yesterdayISO,
          engineEntries,
          engineTransfers,
        )
      : null;
  const flexibleIdSet = new Set(
    data.buckets.filter((b) => b.is_flexible && !b.is_savings).map((b) => b.id),
  );
  const recentFlexHits = data.expenses.filter(
    (e) =>
      e.cadence === "one_time" &&
      !e.is_paused &&
      e.bucket_id !== null &&
      flexibleIdSet.has(e.bucket_id) &&
      (e.due_date === todayISO || e.due_date === yesterdayISO),
  );

  // Cycle-end debt sweep: fresh cycle + money kept last cycle + a debt to hit.
  const latestCycle = [...completedCycles].sort((a, b) =>
    a.cycleStart < b.cycleStart ? 1 : -1,
  )[0];
  const keptLastCycle = latestCycle
    ? Math.max(
        0,
        Math.round((latestCycle.paycheckTotal - latestCycle.totalActual) * 100) / 100,
      )
    : 0;
  const daysIntoCycle = payCycleNow
    ? Math.round((Date.parse(todayISO) - Date.parse(payCycleNow.lastPayday)) / 86400000)
    : 99;
  const sweepTarget = [...nw.liabilities]
    .filter(
      (l) =>
        !l.is_archived &&
        Number(l.current_balance) > 0 &&
        l.interest_rate !== null &&
        Number(l.interest_rate) > 0,
    )
    .sort((a, b) => Number(b.interest_rate) - Number(a.interest_rate))[0];
  const sweepAmount = sweepTarget
    ? Math.min(keptLastCycle, Number(sweepTarget.current_balance))
    : 0;
  const showSweep =
    !viewing &&
    latestCycle &&
    payCycleNow?.lastPayday === latestCycle.cycleEnd &&
    daysIntoCycle <= 3 &&
    sweepAmount >= 25;

  // Anniversary report: 14-day window after 3/6/12… months in.
  const annWindow = anniversaryWindow(accountCreatedISO, todayISO);
  const firstSnap = nw.snapshots[0];
  const lastSnap = nw.snapshots[nw.snapshots.length - 1];
  const skippedJar =
    Math.round(
      data.whatIf
        .filter((w) => w.status === "skipped")
        .reduce((s, w) => s + Number(w.amount), 0) * 100,
    ) / 100;

  // One-tap presets for the log-a-spend card.
  const presets: SpendPreset[] = Array.isArray(meta.spend_presets)
    ? (meta.spend_presets as SpendPreset[]).filter(
        (p) => typeof p?.name === "string" && Number(p?.amount) > 0,
      )
    : [];
  const aom = ageOfMoney(engineIncome, engineEntries, engineExpenses, todayISO);
  const funIds = new Set(
    data.buckets.filter((b) => b.is_flexible && !b.is_savings).map((b) => b.id),
  );
  const streak = noSpendStreak(engineExpenses, funIds, todayISO);

  // Active announcements this user hasn't dismissed yet.
  const [{ data: annRaw }, { data: disRaw }] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, message, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase.from("announcement_dismissals").select("announcement_id"),
  ]);
  const dismissedIds = new Set(
    (disRaw ?? []).map((d: { announcement_id: string }) => d.announcement_id),
  );
  const announcements = ((annRaw ?? []) as { id: string; message: string }[]).filter(
    (a) => !dismissedIds.has(a.id),
  );

  // Getting-started checklist: what's set up, what's missing. Disappears
  // once the core five are done.
  const setupSteps: { label: string; done: boolean; href: string }[] = [
    { label: "Add your paycheck", done: data.income.length > 0, href: "/budget#income" },
    { label: "Split it into buckets (2+)", done: data.buckets.length >= 2, href: "/budget#buckets" },
    { label: "Mark a savings bucket", done: data.buckets.some((b) => b.is_savings), href: "/budget#buckets" },
    { label: "Add your first bill or spend", done: data.expenses.length > 0, href: "/budget#bills" },
    {
      label: "Set a goal to aim at",
      done:
        data.goals.some((g) => !g.achieved_at && !g.is_archived) ||
        data.buckets.some((b) => Number(b.goal_amount) > 0),
      href: "/budget#goals",
    },
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;
  const showChecklist = data.buckets.length > 0 && setupDone < setupSteps.length;

  // Next payday preview: what that check does the moment it lands.
  const nextCheck = billsByCheck(engineIncome, engineBuckets, engineExpenses, todayISO, 1)[0];
  const previewSplit = nextCheck
    ? splitPaycheck(engineBuckets, nextCheck.paycheckTotal)
    : [];
  const sweepEstimate = balancesToday
    ? Math.round(
        data.buckets
          .filter((b) => !b.is_savings && !b.rolls_over && !b.is_paused)
          .reduce((s, b) => s + Math.max(balancesToday[b.id] ?? 0, 0), 0) * 100,
      ) / 100
    : 0;
  const daysToNextCheck = nextCheck
    ? Math.max(
        0,
        Math.round(
          (Date.parse(nextCheck.payday) - Date.parse(todayISO)) / 86400000,
        ),
      )
    : null;
  const spokenForPct =
    nextCheck && nextCheck.paycheckTotal > 0
      ? Math.round((nextCheck.totalBills / nextCheck.paycheckTotal) * 100)
      : 0;

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
        <div className="mx-auto max-w-2xl px-6 pt-2">
          <form
            action={adoptStarterSetup}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4"
          >
            <p className="text-sm text-slate-400">
              In a hurry? Start from the sample setup — Rent, Food, Fun money,
              Savings, and a $1,400 biweekly check. Change every number after.
            </p>
            <button className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-emerald-400 hover:text-white">
              Use the starter setup →
            </button>
          </form>
        </div>
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

      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
        {viewing && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-500/40 bg-violet-500/10 px-6 py-4">
            <p className="text-sm font-semibold text-violet-200">
              {partnerCanEdit
                ? `👥 Viewing ${viewingOwnerEmail}'s budget — you can log spending into it. Their numbers, shared plan.`
                : `👀 Viewing ${viewingOwnerEmail}'s budget — read-only. Their numbers, their plan.`}
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

        {!viewing &&
          goalsCrossed.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-6 py-5"
            >
              <p className="text-lg font-black text-emerald-200">
                {`🎉🎊 You did it — your savings crossed ${heroCurrency.format(Number(g.target_amount))} and "${g.name}" is DONE.`}
              </p>
              <InstantAction
                action={markGoalAchieved}
                values={{ id: g.id }}
                message={`"${g.name}" marked achieved — it moves to your trophy shelf in Budget → Goals.`}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                Mark it achieved 🏆
              </InstantAction>
            </div>
          ))}

        {dupes.length > 0 && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-4">
            <p className="text-sm font-semibold text-amber-200">
              🔁 Possible double-log{dupes.length === 1 ? "" : "s"} — same
              merchant, same amount, same day:
            </p>
            <ul className="mt-2 space-y-1">
              {dupes.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-100/90"
                >
                  <span>{`${d.name} · ${heroCurrency.format(d.amount)} · ${d.date}`}</span>
                  <InstantAction
                    action={deleteExpense}
                    undoAction={undoRestore}
                    values={{ id: d.id }}
                    message={`Removed the duplicate ${d.name}.`}
                    className="rounded bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
                  >
                    remove the extra one
                  </InstantAction>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-amber-100/60">
              If both are real, ignore this — it disappears in two weeks.
            </p>
          </div>
        )}

        {!viewing && annWindow && (
          <div className="rounded-2xl border border-violet-500/40 bg-violet-500/10 px-6 py-5">
            <p className="text-lg font-black text-violet-200">
              {`🎂 ${annWindow.months} month${annWindow.months === 1 ? "" : "s"} on Till Payday`}
            </p>
            <p className="mt-1 text-sm text-violet-100/80">
              {[
                firstSnap && lastSnap && firstSnap.snapshot_date !== lastSnap.snapshot_date
                  ? `Net worth: ${heroCurrency.format(Number(firstSnap.net_worth))} → ${heroCurrency.format(Number(lastSnap.net_worth))}`
                  : null,
                reviewStreak > 0 || checkinSet.size > 0
                  ? `${checkinSet.size} weekly review${checkinSet.size === 1 ? "" : "s"} done`
                  : null,
                streak && streak.best > 0
                  ? `best no-spend run ${streak.best} days`
                  : null,
                skippedJar > 0 ? `${heroCurrency.format(skippedJar)} of almost-purchases skipped` : null,
              ]
                .filter(Boolean)
                .join(" · ") ||
                "The habit is the win — the numbers follow. Keep logging."}
            </p>
          </div>
        )}

        {!viewing && shortCheck && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-4">
            <p className="text-sm font-semibold text-amber-200">
              {`✂️ The check you logged on ${shortCheck.receivedDate} was ${heroCurrency.format(shortCheck.amount)} — ${heroCurrency.format(shortCheck.shortBy)} short of your usual ${heroCurrency.format(shortCheck.typical)} (${shortCheck.pct}%).`}
            </p>
            <p className="mt-1 text-sm text-amber-100/80">
              Your buckets refilled as if the full check landed, so this cycle
              is running on money that didn&apos;t arrive.
              {funBucketRow && trimAmount > 0
                ? ` The honest fix: move ${heroCurrency.format(trimAmount)} of ${funBucketRow.name} back toward savings for just this cycle.`
                : " Trim a bucket or pause a bill until the next full check."}
            </p>
            {funBucketRow && trimAmount > 0 && (
              <div className="mt-2">
                <InstantAction
                  action={addTransfer}
                  values={{
                    from_bucket_id: funBucketRow.id,
                    to_bucket_id: "",
                    amount: String(trimAmount),
                    transfer_date: todayISO,
                    note: "short-check trim",
                  }}
                  message={`Moved ${heroCurrency.format(trimAmount)} from ${funBucketRow.name} back to savings — undo it in Budget → Move money.`}
                  className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/30"
                >
                  {`Trim ${funBucketRow.name} by ${heroCurrency.format(trimAmount)} this cycle`}
                </InstantAction>
              </div>
            )}
          </div>
        )}

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

        {/* Safe-to-spend hero (+ payday preview beside it on big screens) */}
        <div
          className={`grid grid-cols-1 gap-6 ${nextCheck ? "2xl:grid-cols-2" : ""}`}
        >
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-400">{`Welcome back, ${displayName} 👋`}</p>
            <span className="flex flex-wrap items-center gap-2">
              {spend && spend.total > 0 && typicalPaycheck > 0 && (
                <p className="rounded-lg bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-300">
                  {leftPct > 0
                    ? `spent ${heroCurrency.format(spend.total)} this cycle — ${leftPct}% of your check left`
                    : `spent ${heroCurrency.format(spend.total)} this cycle — this check's fully spoken for`}
                  {hourlyWage && (
                    <span className="ml-1 font-normal opacity-80">
                      {`(≈ ${(spend.total / hourlyWage).toFixed(1)}h of work)`}
                    </span>
                  )}
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
              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer transition hover:text-slate-300">
                  why did my number change?
                </summary>
                <div className="mt-1 space-y-1 rounded-lg bg-slate-800/60 px-3 py-2">
                  <p>
                    {`The math: ${heroCurrency.format(sts.flexibleBalance)} of flexible money ÷ ${sts.daysUntilPayday} day${sts.daysUntilPayday === 1 ? "" : "s"} until payday = ${heroCurrency.format(sts.perDay)}/day.`}
                  </p>
                  {stsYesterday && (
                    <p>
                      {`Yesterday it was ${heroCurrency.format(stsYesterday.perDay)}/day (${heroCurrency.format(stsYesterday.flexibleBalance)} ÷ ${stsYesterday.daysUntilPayday} days).`}
                      {sts.daysUntilPayday !== stsYesterday.daysUntilPayday &&
                        ` One day closer to payday ${sts.daysUntilPayday < stsYesterday.daysUntilPayday ? "stretches the same money over fewer days" : "reset the cycle"}.`}
                    </p>
                  )}
                  {recentFlexHits.length > 0 && (
                    <p>
                      {`Flexible money that left in the last day: ${recentFlexHits
                        .map((e) => `${e.name} −${heroCurrency.format(expenseShare(e))}`)
                        .join(", ")}.`}
                    </p>
                  )}
                  <p className="text-slate-600">
                    No mystery, no magic — spend less than the number and it
                    rises tomorrow.
                  </p>
                </div>
              </details>
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

        {nextCheck && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-white">
                {`Next payday — ${nextCheck.payday}`}
                <span className="ml-2 text-sm font-normal text-slate-400">
                  {daysToNextCheck === 0
                    ? "today 🎉"
                    : daysToNextCheck === 1
                      ? "tomorrow"
                      : `in ${daysToNextCheck} days`}
                </span>
              </h2>
              <p className="text-sm font-bold text-emerald-300">
                {`+${heroCurrency.format(nextCheck.paycheckTotal)} lands`}
              </p>
            </div>
            {sweepEstimate > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {`First: the ${heroCurrency.format(sweepEstimate)} still sitting in spending buckets sweeps into savings. Then the new check splits:`}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {previewSplit.map((s) => (
                <span
                  key={s.bucketId ?? "leftover"}
                  className="rounded-lg bg-slate-800/70 px-2.5 py-1 text-xs text-slate-200"
                >
                  {`${s.name} ${heroCurrency.format(s.amount)}`}
                </span>
              ))}
            </div>
            <p
              className={`mt-3 text-sm ${
                !nextCheck.fits
                  ? "font-semibold text-red-300"
                  : spokenForPct >= 60
                    ? "text-amber-200"
                    : "text-slate-300"
              }`}
            >
              {nextCheck.bills.length === 0
                ? "No bills land on that check — whatever you don't spend is yours."
                : !nextCheck.fits
                  ? `That check must cover ${heroCurrency.format(nextCheck.totalBills)} of bills — it's short by ${heroCurrency.format(nextCheck.shortBy)}. This is next cycle's problem unless you move money now.`
                  : `${heroCurrency.format(nextCheck.totalBills)} of bills land on that check (${nextCheck.bills.length} bill${nextCheck.bills.length === 1 ? "" : "s"}) — ${spokenForPct}% of it is spoken for before it arrives.`}
            </p>
            {!viewing && (
              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer transition hover:text-slate-300">
                  adjust this check once
                </summary>
                <form action={addTransfer} className="mt-2 flex flex-wrap items-end gap-2">
                  <span className="text-slate-400">On payday, move an extra</span>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="$"
                    className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-white outline-none focus:border-emerald-400"
                  />
                  <span className="text-slate-400">from savings into</span>
                  <select
                    name="to_bucket_id"
                    className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-white outline-none focus:border-emerald-400"
                  >
                    {data.buckets
                      .filter((b) => !b.is_savings)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                  <input type="hidden" name="from_bucket_id" value="" />
                  <input type="hidden" name="transfer_date" value={nextCheck.payday} />
                  <input type="hidden" name="note" value="one-off payday adjustment" />
                  <button className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30">
                    set it
                  </button>
                </form>
                <p className="mt-1 text-slate-600">
                  Just this check — your standing plan doesn&apos;t change.
                  Undo anytime in Budget → Move money.
                </p>
              </details>
            )}
          </div>
        )}
        </div>

        {!viewing && sts && sts.hasFlexibleBuckets && (
          <AffordCheck
            flexibleBalance={sts.flexibleBalance}
            daysUntilPayday={sts.daysUntilPayday}
            nextPayday={sts.nextPayday}
            savingsBalance={balancesToday?.[""] ?? 0}
            dangerLow={danger?.low ?? null}
            dangerDate={danger?.date ?? null}
            hourlyWage={hourlyWage}
          />
        )}

        <AppBadge count={daysToNextCheck} />

        {announcements.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-500/40 bg-violet-500/10 px-6 py-4"
          >
            <p className="text-sm text-violet-100">{`📣 ${a.message}`}</p>
            <form action={dismissAnnouncement}>
              <input type="hidden" name="id" value={a.id} />
              <button className="text-xs text-violet-300 transition hover:text-white">
                got it — dismiss
              </button>
            </form>
          </div>
        ))}

        {showChecklist && (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 px-6 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-sky-200">
                {`Finish setting up — ${setupDone} of ${setupSteps.length} done`}
              </h2>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-400"
                  style={{ width: `${(setupDone / setupSteps.length) * 100}%` }}
                />
              </div>
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {setupSteps.map((s) => (
                <li key={s.label} className="text-sm">
                  {s.done ? (
                    <span className="text-slate-500 line-through">{`✓ ${s.label}`}</span>
                  ) : (
                    <Link
                      href={s.href}
                      className="text-sky-200 underline-offset-2 transition hover:text-white hover:underline"
                    >
                      {`○ ${s.label} →`}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              The projections get sharper with every step — half-set-up numbers
              are half-honest numbers.
            </p>
          </div>
        )}

        {(runwayInfo || aom || streak || danger || anomalies.length > 0) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {danger && (
              <div
                className={`rounded-2xl border px-6 py-5 ${
                  danger.negative
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-slate-800 bg-slate-900"
                }`}
              >
                <p className="text-sm text-slate-400">
                  Tightest day before payday
                </p>
                <p
                  className={`mt-1 text-4xl font-black tracking-tight ${
                    danger.negative
                      ? "text-red-300"
                      : danger.low < 100
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }`}
                >
                  {heroCurrency.format(danger.low)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {danger.negative
                    ? `On ${danger.date}${danger.causes[0] ? ` when ${danger.causes[0].name} lands` : ""}, your total goes ${heroCurrency.format(Math.abs(danger.low))} negative — a bill is spending money you don't have. Move money or pause something before then.`
                    : `Your low point is ${danger.daysAway === 0 ? "today" : `${danger.date} (${danger.daysAway} day${danger.daysAway === 1 ? "" : "s"} away)`}${danger.causes[0] ? `, after ${danger.causes[0].name} clears` : ""} — then the ${danger.nextPayday} check lands.`}
                </p>
              </div>
            )}
            {aom && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
                <p className="text-sm text-slate-400">Age of your money</p>
                <p
                  className={`mt-1 text-4xl font-black tracking-tight ${
                    aom.days < 7
                      ? "text-red-300"
                      : aom.days < 30
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }`}
                >
                  {`${aom.days} day${aom.days === 1 ? "" : "s"}`}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {`How long a dollar sits with you before it leaves (your last ${aom.sampleSize} spends). Paycheck-to-paycheck money is days old. Older money is calmer money.`}
                </p>
              </div>
            )}
            {streak && (
              <div
                className={`rounded-2xl border px-6 py-5 ${
                  streak.brokeToday
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-slate-800 bg-slate-900"
                }`}
              >
                <p className="text-sm text-slate-400">Fun-money-free streak</p>
                <p
                  className={`mt-1 text-4xl font-black tracking-tight ${
                    streak.current > 0 ? "text-emerald-300" : "text-slate-300"
                  }`}
                >
                  {`${streak.current} day${streak.current === 1 ? "" : "s"}`}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {streak.brokeToday
                    ? `Fun money left your pocket today — the streak dies at ${streak.current}. It restarts tomorrow. Best run: ${streak.best} days.`
                    : `No fun-money spending through yesterday. Best run: ${streak.best} days. Spend fun money today and this resets — your call.`}
                </p>
              </div>
            )}
            {freedom && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
                <p className="text-sm text-slate-400">
                  Freedom Day this month
                </p>
                <p
                  className={`mt-1 text-4xl font-black tracking-tight ${
                    freedom.neverFree
                      ? "text-red-300"
                      : freedom.day > 24
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }`}
                >
                  {freedom.neverFree ? "—" : `the ${freedom.day}${[1, 21, 31].includes(freedom.day) ? "st" : [2, 22].includes(freedom.day) ? "nd" : [3, 23].includes(freedom.day) ? "rd" : "th"}`}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {freedom.neverFree
                    ? `Bills (${heroCurrency.format(freedom.monthBills)}) meet or beat this month's income (${heroCurrency.format(freedom.monthIncome)}) — every day works for the bills. That's the problem to attack first.`
                    : `Bills take ${Math.round(freedom.billShare * 100)}% of this month's income — you work for them through ${freedom.date.slice(5)}. After that, you work for you. Watch this date move earlier.`}
                </p>
              </div>
            )}
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
                  {`That's how long ${heroCurrency.format(runwayInfo.liquid)} on hand lasts at your real pace of ${heroCurrency.format(runwayInfo.avgDailySpend)}/day. This number growing is the whole game. `}
                  <Link href="/crisis" className="text-sky-300 hover:text-sky-200">
                    Worst-case plan →
                  </Link>
                </p>
              </div>
            )}
            {anomalies.length > 0 && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-5 sm:col-span-2 lg:col-span-3">
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

        {!viewing && !reviewDone && (
          <Link
            href="/review"
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/5 px-6 py-4 transition hover:border-sky-400/60"
          >
            <span className="text-sm text-sky-200">
              🧭 This week&apos;s 2-minute review is waiting — what left, what&apos;s
              coming, one thing to skip.
            </span>
            <span className="text-sm font-semibold text-sky-300">
              {reviewStreak > 0 ? `Keep the ${reviewStreak}-week streak →` : "Start the habit →"}
            </span>
          </Link>
        )}

        {!viewing && efStatus && (
          <EfundCard status={efStatus} months={efMonths} monthlyLoad={efLoad} />
        )}

        {(!viewing || partnerCanEdit) && (
          <QuickSpend
            data={data}
            balances={balancesToday}
            todayISO={todayISO}
            ownerId={viewing ? uid : undefined}
            presets={viewing ? [] : presets}
          />
        )}

        {!viewing && balancesToday && (
          <ReconcileCard modelBalance={liquidToday} />
        )}

        {showSweep && sweepTarget && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-emerald-200">
                {`💪 Last cycle you kept ${heroCurrency.format(keptLastCycle)}. Throwing ${heroCurrency.format(sweepAmount)} at ${sweepTarget.name} (${sweepTarget.interest_rate}%) saves ${heroCurrency.format(Math.round(sweepAmount * (Number(sweepTarget.interest_rate) / 100) * 100) / 100)}/yr in interest — every year, forever.`}
              </p>
              <InstantAction
                action={applyDebtSweep}
                undoAction={undoRestore}
                values={{ liability_id: sweepTarget.id, amount: String(sweepAmount) }}
                message={`Sent ${heroCurrency.format(sweepAmount)} at ${sweepTarget.name} — its balance just dropped.`}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                Send it at the debt →
              </InstantAction>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Books the payment as an expense from savings and lowers the
              debt&apos;s balance — one undo reverses both. Make the same
              payment at your actual lender, of course.
            </p>
          </div>
        )}

        <ProjectionSection
          data={data}
          todayISO={todayISO}
          anchorISO={viewing ? todayISO : (user.created_at ?? todayISO).slice(0, 10)}
        />

        <DebtOutlook
          liabilities={nw.liabilities}
          todayISO={todayISO}
          snapshots={nw.snapshots}
        />

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
