import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LegalFooter } from "@/components/LegalFooter";
import { PaycheckPie, type PieSlice } from "@/components/PaycheckPie";
import {
  UNSPENT_GREEN,
  classifyBucket,
  planColor,
  spentRed,
} from "@/lib/bucketColor";
import {
  BucketsPanel,
  ExpensesPanel,
  GoalsPanel,
  IncomePanel,
  WhatIfPanel,
} from "@/components/panels";
import { CoachRecap } from "@/components/CoachRecap";
import { IncomeShock } from "@/components/IncomeShock";
import { getDashboardData } from "@/lib/data";
import {
  billsByCheck,
  bucketPace,
  currentPayCycle,
  cycleHistory,
  cycleSpending,
  irregularWeeklyBaseline,
  runProjection,
  splitPaycheck,
} from "@/lib/engine";
import {
  bucketToEngine,
  expenseToEngine,
  incomeEntryToEngine,
  incomeToEngine,
  transferToEngine,
} from "@/lib/rows";
import { computeTodayBalances } from "@/lib/balances";
import { parseSharedSpend } from "@/lib/share";
import {
  categoryColor,
  dailySpendHeatmap,
  monthlyCategoryTotals,
  monthlySavingsRate,
} from "@/lib/spendViz";
import { auditSubscriptions } from "@/lib/subscriptions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Budget: everything you manage — income, buckets, bills, what-ifs.
 * The Dashboard is the glance; this is where changes happen.
 */
export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{
    shared_title?: string;
    shared_text?: string;
    shared_url?: string;
    q?: string;
  }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getDashboardData();
  if (data.buckets.length === 0) redirect("/"); // onboarding lives on the dashboard
  const todayISO = new Date().toISOString().slice(0, 10);

  // Web Share Target: text shared into the installed app lands here as
  // query params — parse it into a quick-spend prefill.
  const { shared_title, shared_text, shared_url, q } = await searchParams;
  const sharedRaw = [shared_title, shared_text, shared_url]
    .filter(Boolean)
    .join(" ");
  const sharedPrefill = sharedRaw ? parseSharedSpend(sharedRaw) : undefined;

  const engineIncome = data.income.map(incomeToEngine);
  const engineBuckets = data.buckets.map(bucketToEngine);
  const engineExpenses = data.expenses.map(expenseToEngine);
  const engineEntries = data.incomeEntries.map(incomeEntryToEngine);
  const engineTransfers = data.transfers.map(transferToEngine);

  // Windfall context (8F): what counts as "above a typical paycheck", which
  // buckets are currently flagged short, and where fun money would go.
  const regularMax = Math.max(
    0,
    ...data.income
      .filter((s) => s.kind === "paycheck" && s.frequency !== "irregular")
      .map((s) => Number(s.amount)),
  );
  const hasIrregular = data.income.some((s) => s.frequency === "irregular");
  const typicalPaycheck = Math.max(
    regularMax,
    hasIrregular ? irregularWeeklyBaseline(engineEntries, todayISO) : 0,
  );
  const nearTerm = runProjection({
    startDate: todayISO,
    months: 3,
    incomeSources: engineIncome,
    buckets: engineBuckets,
    expenses: engineExpenses,
    incomeEntries: engineEntries,
    transfers: engineTransfers,
  });
  const seenShort = new Set<string>();
  const shortfalls = nearTerm.warnings
    .filter((w) => w.type === "shortfall")
    .filter((w) => {
      const b = data.buckets.find((x) => x.id === w.bucketId);
      if (!b || b.is_savings || seenShort.has(w.bucketId)) return false;
      seenShort.add(w.bucketId);
      return true;
    })
    .map((w) => ({
      bucketId: w.bucketId,
      bucketName: w.bucketName,
      amount: w.type === "shortfall" ? w.amount : 0,
    }));
  const funBucketRow = data.buckets.find((b) => b.is_flexible && !b.is_savings);
  const funBucket = funBucketRow
    ? { id: funBucketRow.id, name: funBucketRow.name }
    : null;

  const savingsBucket = data.buckets.find((b) => b.is_savings);
  const currencyCents = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  // The plan pie wears the virtue spectrum: green = savings/investing,
  // yellow = food, orange = bills, red = fun. New buckets self-classify by
  // name, shades vary within a family so every slice stays distinct.
  const planRaw = splitPaycheck(engineBuckets, typicalPaycheck);
  const familyCount: Record<string, number> = {};
  const semanticColor = new Map<string | null, string>();
  for (const s of planRaw) {
    const row = s.bucketId
      ? data.buckets.find((b) => b.id === s.bucketId)
      : undefined;
    const cat = classifyBucket(s.name, {
      isSavings: (row?.is_savings ?? false) || s.bucketId === null,
      isFlexible: row?.is_flexible,
    });
    const idx = familyCount[cat] ?? 0;
    familyCount[cat] = idx + 1;
    semanticColor.set(s.bucketId, planColor(cat, idx));
  }
  const pieSlices: PieSlice[] = planRaw.map((s) => ({
    name: s.name,
    amount: s.amount,
    share: s.percent,
    color: semanticColor.get(s.bucketId) ?? "#f59e0b",
  }));

  // The reality donut: every spent slice is a bright red (spending is an
  // outflow — it reads as −$), the unspent remainder is green, and the
  // breakdown list mirrors the plan's row order for 1:1 comparison.
  const spend = cycleSpending(engineIncome, engineExpenses, todayISO);
  const pct = (n: number) =>
    typicalPaycheck > 0 ? Math.round((n / typicalPaycheck) * 1000) / 10 : 0;
  const spentByBucket = new Map(
    (spend?.byBucket ?? []).map((x) => [x.bucketId, x.amount]),
  );
  // Plan-slice bucketId for savings is the savings bucket's id, but spends
  // drawn from savings carry a null bucket_id — bridge the two keys.
  const spendKeyFor = (planBucketId: string | null) =>
    planBucketId === (savingsBucket?.id ?? null) ? null : planBucketId;

  let redIdx = 0;
  const spentRows = planRaw.map((s) => {
    const amount = spentByBucket.get(spendKeyFor(s.bucketId)) ?? 0;
    return {
      name: s.name,
      amount,
      share: pct(amount),
      color: amount > 0 ? spentRed(redIdx++) : null,
    };
  });
  // Spending from buckets the plan doesn't allocate to (e.g. $0-refill ones).
  const covered = new Set(planRaw.map((s) => spendKeyFor(s.bucketId)));
  for (const [key, amount] of spentByBucket) {
    if (covered.has(key) || amount <= 0) continue;
    spentRows.push({
      name:
        key === null
          ? "Savings / leftover"
          : data.buckets.find((b) => b.id === key)?.name ?? "Other",
      amount,
      share: pct(amount),
      color: spentRed(redIdx++),
    });
  }
  const unspent =
    typicalPaycheck > 0
      ? Math.max(0, Math.round((typicalPaycheck - (spend?.total ?? 0)) * 100) / 100)
      : 0;

  const spentSlices: PieSlice[] = spentRows
    .filter((r) => r.amount > 0)
    .map((r) => ({
      name: `Spent from ${r.name}`,
      short: r.name,
      amount: r.amount,
      share: r.share,
      color: r.color!,
      display: `−${currencyCents.format(r.amount)}`,
    }));
  if (unspent > 0 && spentSlices.length > 0) {
    spentSlices.push({
      name: "Left unspent",
      short: "Unspent",
      amount: unspent,
      share: pct(unspent),
      color: UNSPENT_GREEN,
    });
  }

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  // Envelope-bar inputs for the buckets panel: per-check refill dollars and
  // the same semantic colors the pies wear.
  const perCheck: Record<string, number> = {};
  const bucketColors: Record<string, string> = {};
  for (const s of planRaw) {
    if (!s.bucketId) continue;
    perCheck[s.bucketId] = s.amount;
    const c = semanticColor.get(s.bucketId);
    if (c) bucketColors[s.bucketId] = c;
  }

  // Today's balance per bucket (this cycle's replay, including transfers) —
  // powers the overdraft popup, the envelope bars, and the move-money form.
  const cycle = currentPayCycle(engineIncome, todayISO);
  const balances = computeTodayBalances(data, todayISO);

  // Past-cycle recap: planned vs actual per bucket, evidence over time. The
  // pay lattice runs infinitely backward, so cycles that predate this account
  // existing are trimmed — they'd otherwise show as fabricated "$0 spent"
  // history from before the user ever touched the app.
  const accountCreatedISO = (user.created_at ?? todayISO).slice(0, 10);
  const rawHistory = cycleHistory(engineIncome, engineBuckets, engineExpenses, todayISO, 6);
  const pastCycles = rawHistory.cycles.filter((c) => c.cycleStart >= accountCreatedISO);
  // Recompute streaks scoped to the trimmed (real) history — the engine's own
  // streaks were walked against the full, lattice-extended cycle list.
  const streakIds = new Set<string | null>();
  for (const c of pastCycles) for (const b of c.buckets) streakIds.add(b.bucketId);
  const pastStreaks = [...streakIds]
    .map((id) => {
      let overCycles = 0;
      let name = "";
      for (const c of pastCycles) {
        const row = c.buckets.find((b) => b.bucketId === id);
        if (row && row.overBy > 0) {
          overCycles += 1;
          name = row.bucketName;
        } else break;
      }
      return { bucketId: id, bucketName: name, overCycles };
    })
    .filter((s) => s.overCycles > 1) // a single over-cycle isn't a "streak"
    .sort((a, b) => b.overCycles - a.overCycles);

  // Bill-to-paycheck calendar: which upcoming check covers which bills.
  const checkGroups = billsByCheck(engineIncome, engineBuckets, engineExpenses, todayISO, 4);

  // Subscription auditor: repeating bills × their real yearly multiplier.
  const subAudit = auditSubscriptions(data.expenses, data.buckets, data.income);

  // Spend visuals: 13-week daily heatmap + 6-month category trend + rate.
  const heatmap = dailySpendHeatmap(engineExpenses, todayISO);
  const trend = monthlyCategoryTotals(engineExpenses, data.buckets, todayISO);
  const trendMax = Math.max(1, ...trend.map((m) => m.total));
  const trendCategories = [
    ...new Set(trend.flatMap((m) => Object.keys(m.byCategory))),
  ];
  const savingsRates = monthlySavingsRate(
    engineIncome,
    data.incomeEntries,
    engineExpenses,
    todayISO,
  );

  // Cycle pace per bucket: % of plan spent vs % of cycle elapsed.
  const elapsedFraction = cycle
    ? (Date.parse(todayISO) - Date.parse(cycle.lastPayday)) /
      Math.max(1, Date.parse(cycle.nextPayday) - Date.parse(cycle.lastPayday))
    : 0;
  const paceMap: Record<
    string,
    { spentPct: number; elapsedPct: number; status: string }
  > = {};
  if (cycle) {
    for (const s of planRaw) {
      if (!s.bucketId || s.bucketId === savingsBucket?.id) continue;
      const p = bucketPace(
        spentByBucket.get(spendKeyFor(s.bucketId)) ?? 0,
        s.amount,
        elapsedFraction,
      );
      if (p) paceMap[s.bucketId] = p;
    }
  }

  return (
    <AppShell active="budget">
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
        <div>
          <h2 className="text-lg font-semibold text-white">Your budget</h2>
          <p className="text-sm text-slate-400">
            Income, buckets, bills, and maybe-purchases — change anything here
            and the Dashboard updates instantly.
          </p>
          <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {[
              ["#income", "Income"],
              ["#buckets", "Buckets"],
              ["#bills", "Bills"],
              ["#goals", "Goals"],
              ["#what-ifs", "What-ifs"],
              ["/wrapped", "Month wrapped 🎁"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="text-slate-500 underline-offset-2 transition hover:text-emerald-300 hover:underline"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>

        {cycle && typicalPaycheck > 0 && (() => {
          const spentTotal = spend?.total ?? 0;
          const days = Math.max(
            0,
            Math.round(
              (Date.parse(cycle.nextPayday) - Date.parse(todayISO)) / 86400000,
            ),
          );
          const paydayLabel =
            days === 0 ? "today 🎉" : days === 1 ? "tomorrow" : `in ${days} days`;
          const tiles: [string, string, string][] = [
            ["Typical check", currency.format(typicalPaycheck), "text-white"],
            [
              `Spent since ${spend?.since ?? cycle.lastPayday}`,
              spentTotal > 0 ? `−${currencyCents.format(spentTotal)}` : "$0",
              spentTotal > 0 ? "text-red-300" : "text-slate-300",
            ],
            [
              "Still standing",
              currencyCents.format(unspent),
              unspent > 0 ? "text-emerald-300" : "text-red-300",
            ],
            ["Next payday", paydayLabel, "text-white"],
          ];
          return (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tiles.map(([label, value, tone]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                >
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {checkGroups.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-1 font-semibold text-white">
              Which check covers what
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Your next few paychecks and the bills already lined up against
              each one.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {checkGroups.map((g) => (
                <div
                  key={g.payday}
                  className={`rounded-xl border p-3 ${
                    g.fits
                      ? "border-slate-700 bg-slate-800/40"
                      : "border-red-500/40 bg-red-500/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-200">{g.payday}</p>
                    <span className="text-xs text-slate-400">
                      {currency.format(g.paycheckTotal)}
                    </span>
                  </div>
                  {g.bills.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Nothing due against this check yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {g.bills.map((b) => (
                        <li
                          key={`${b.expenseId}-${b.dueDate}`}
                          className="flex items-center justify-between text-xs text-slate-400"
                        >
                          <span>{`${b.name} (${b.dueDate})`}</span>
                          <span>{currency.format(b.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex items-center justify-between border-t border-slate-700/60 pt-2 text-xs">
                    <span className="text-slate-500">
                      {`${currency.format(g.totalBills)} due`}
                    </span>
                    <span
                      className={
                        g.fits
                          ? "font-semibold text-emerald-300"
                          : "font-semibold text-red-300"
                      }
                    >
                      {g.fits
                        ? "fits ✓"
                        : `short ${currency.format(g.shortBy)}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pieSlices.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 font-semibold text-white">
              Where each paycheck goes
            </h2>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* The plan */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  The plan
                </p>
                <div className="flex flex-wrap items-center gap-6">
                  <PaycheckPie slices={pieSlices} paycheck={typicalPaycheck} />
                  <ul className="min-w-44 flex-1 space-y-2 text-sm">
                    {pieSlices.map((s) => (
                      <li key={s.name} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-slate-200">
                          <span
                            className="inline-block h-3 w-3 rounded-sm"
                            style={{ backgroundColor: s.color }}
                            aria-hidden
                          />
                          {s.name}
                        </span>
                        <span className="text-slate-400">
                          {`${currency.format(s.amount)} · ${s.share}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* The reality, so far this cycle */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {spend
                    ? `This cycle so far (since ${spend.since})`
                    : "This cycle so far"}
                </p>
                {spentSlices.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-6">
                    <PaycheckPie slices={spentSlices} paycheck={typicalPaycheck} />
                    <ul className="min-w-44 flex-1 space-y-2 text-sm">
                      {spentRows.map((r) => (
                        <li key={r.name} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-slate-200">
                            <span
                              className="inline-block h-3 w-3 rounded-sm"
                              style={{ backgroundColor: r.color ?? "#334155" }}
                              aria-hidden
                            />
                            {`Spent from ${r.name}`}
                          </span>
                          {r.amount > 0 ? (
                            <span className="font-semibold text-red-300">
                              {`−${currencyCents.format(r.amount)} · ${r.share}%`}
                            </span>
                          ) : (
                            <span className="text-slate-500">$0 so far</span>
                          )}
                        </li>
                      ))}
                      {unspent > 0 && (
                        <li className="flex items-center justify-between gap-3 border-t border-slate-800 pt-2">
                          <span className="flex items-center gap-2 text-slate-200">
                            <span
                              className="inline-block h-3 w-3 rounded-sm"
                              style={{ backgroundColor: UNSPENT_GREEN }}
                              aria-hidden
                            />
                            Left unspent
                          </span>
                          <span className="font-semibold text-emerald-300">
                            {`${currencyCents.format(unspent)} · ${pct(unspent)}%`}
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <p className="py-10 text-sm text-slate-500">
                    Nothing spent yet this cycle — the whole check is intact.
                    As bills come due, this chart fills in so you can compare
                    it against the plan.
                  </p>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              The two lists line up row for row: the plan&apos;s share on the
              left, what you&apos;ve actually spent (in red) on the right.
              Green is money still standing; red is money gone.
            </p>
          </div>
        )}

        {heatmap.total > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-white">Last 13 weeks, day by day</h2>
                <p className="text-sm text-slate-400">
                  {`${currencyCents.format(heatmap.total)} total`}
                </p>
              </div>
              <p className="mb-3 mt-1 text-xs text-slate-500">
                Darker red, heavier day. Hover any square for the damage.
              </p>
              <div className="grid grid-flow-col grid-rows-7 gap-[3px] overflow-x-auto">
                {heatmap.days.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${currencyCents.format(d.total)}`}
                    className="h-3.5 w-3.5 rounded-sm"
                    style={{
                      backgroundColor:
                        d.total <= 0
                          ? "#1e293b"
                          : `rgba(239, 68, 68, ${(0.25 + 0.75 * (d.total / heatmap.max)).toFixed(2)})`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="font-semibold text-white">Six months, by category</h2>
              <p className="mb-3 mt-1 text-xs text-slate-500">
                Where the money has actually been going, month over month. The
                current month is partial — it only counts what&apos;s already
                gone.
              </p>
              <div className="flex h-40 items-end gap-3">
                {trend.map((m, i) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-t"
                      style={{ height: `${Math.round((m.total / trendMax) * 100)}%` }}
                      title={`${m.label}: ${currencyCents.format(m.total)}`}
                    >
                      {trendCategories.map((cat) =>
                        (m.byCategory[cat] ?? 0) > 0 && m.total > 0 ? (
                          <div
                            key={cat}
                            style={{
                              height: `${(m.byCategory[cat] / m.total) * 100}%`,
                              backgroundColor: categoryColor(cat),
                            }}
                            title={`${m.label} · ${cat}: ${currencyCents.format(m.byCategory[cat])}`}
                          />
                        ) : null,
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{m.label}</span>
                    <span className="text-xs font-semibold text-slate-300">
                      {m.total > 0 ? currencyCents.format(m.total) : "—"}
                    </span>
                    {savingsRates[i]?.ratePct !== null &&
                      savingsRates[i] !== undefined && (
                        <span
                          className={`text-xs font-semibold ${
                            savingsRates[i].ratePct! >= 0
                              ? "text-emerald-300"
                              : "text-red-300"
                          }`}
                        >
                          {`kept ${savingsRates[i].ratePct}%`}
                        </span>
                      )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                &ldquo;Kept&rdquo; is your savings rate — the share of that
                month&apos;s income that didn&apos;t leave. Negative means the
                month spent money you didn&apos;t earn in it.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {trendCategories.map((cat) => (
                  <span key={cat} className="flex items-center gap-1.5 text-slate-400">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: categoryColor(cat) }}
                    />
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {subAudit.rows.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-white">
                What your repeating bills really cost
              </h2>
              <p className="text-sm font-bold text-red-300">
                {`${currencyCents.format(subAudit.yearlyTotal)}/yr`}
                {subAudit.pctOfIncome !== null && (
                  <span className="ml-1 font-normal text-slate-400">
                    {`— ${subAudit.pctOfIncome}% of your income`}
                  </span>
                )}
              </p>
            </div>
            <p className="mb-3 mt-1 text-xs text-slate-500">
              Nobody multiplies by 12 in their head. This is the yearly bill
              for everything that renews itself.
            </p>
            <ul className="space-y-1">
              {subAudit.rows.map((r) => (
                <li
                  key={r.expenseId}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-1.5 text-sm ${
                    r.isPaused ? "opacity-50" : ""
                  }`}
                >
                  <span className="text-slate-200">
                    {r.name}
                    <span className="ml-2 text-xs text-slate-500">
                      {`${currencyCents.format(r.amount)} ${
                        r.cadence === "monthly"
                          ? "× 12"
                          : r.cadence === "quarterly"
                            ? "× 4"
                            : "× 1"
                      }`}
                    </span>
                    {r.cancelCandidate && !r.isPaused && (
                      <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-300">
                        cancel candidate 🔪
                      </span>
                    )}
                    {r.isPaused && (
                      <span className="ml-2 rounded bg-slate-500/30 px-1.5 py-0.5 text-xs text-slate-300">
                        paused ⏸
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-slate-300">
                    {`${currencyCents.format(r.yearlyCost)}/yr`}
                  </span>
                </li>
              ))}
            </ul>
            {subAudit.rows.some((r) => r.cancelCandidate && !r.isPaused) && (
              <p className="mt-3 text-xs text-slate-500">
                🔪 Cancel candidates feed fun-money buckets — the first place
                to look when this number needs to shrink. Pausing one in Bills
                below removes it from the total instantly.
              </p>
            )}
          </div>
        )}

        {process.env.ANTHROPIC_API_KEY && <CoachRecap />}

        {pastCycles.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-1 font-semibold text-white">Past cycles</h2>
            <p className="mb-3 text-xs text-slate-500">
              Every completed pay cycle, planned vs. actual. Patterns only show
              up over time — a single cycle over plan is a bad week; several
              in a row is where to look.
            </p>
            {pastStreaks.length > 0 && (
              <ul className="mb-3 space-y-1">
                {pastStreaks.map((s) => (
                  <li
                    key={s.bucketId ?? "savings"}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-200"
                  >
                    {`⚠️ ${s.bucketName} has run over plan ${s.overCycles} cycles straight.`}
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2">
              {pastCycles.map((c) => {
                const overRows = c.buckets.filter((b) => b.overBy > 0);
                return (
                  <details
                    key={c.cycleStart}
                    className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
                  >
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-300">
                        {`${c.cycleStart} → ${c.cycleEnd}`}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-slate-400">
                          {`${currency.format(c.totalActual)} of ${currency.format(c.totalPlanned)} planned`}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                            c.keptPlan
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {c.keptPlan ? "kept the plan" : "went over"}
                        </span>
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 pl-1 text-xs">
                      {c.buckets.map((b) => (
                        <li
                          key={b.bucketId ?? "savings"}
                          className="flex items-center justify-between text-slate-400"
                        >
                          <span>{b.bucketName}</span>
                          <span className={b.overBy > 0 ? "text-red-300" : ""}>
                            {`${currency.format(b.actual)} / ${currency.format(b.planned)} planned`}
                            {b.overBy > 0 ? ` · over by ${currency.format(b.overBy)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {overRows.length === 0 && (
                      <p className="mt-2 pl-1 text-xs text-emerald-300">
                        Every bucket stayed inside its plan this cycle.
                      </p>
                    )}
                  </details>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <IncomePanel
            data={data}
            typicalPaycheck={typicalPaycheck}
            shortfalls={shortfalls}
            funBucket={funBucket}
            todayISO={todayISO}
          />
          <BucketsPanel
            data={data}
            balances={balances}
            perCheck={perCheck}
            colors={bucketColors}
            pace={paceMap}
          />
          <ExpensesPanel
            data={data}
            balances={balances}
            todayISO={todayISO}
            sharedPrefill={sharedPrefill}
            searchQuery={q ?? ""}
          />
          <GoalsPanel data={data} />
          <WhatIfPanel data={data} />
          <IncomeShock
            income={engineIncome}
            buckets={engineBuckets}
            expenses={engineExpenses}
            incomeEntries={engineEntries}
            transfers={engineTransfers}
            startingSavings={balances?.[""] ?? 0}
            savingsBucketId={savingsBucket?.id ?? null}
            todayISO={todayISO}
          />
        </div>
      </div>
      <LegalFooter />
    </AppShell>
  );
}
