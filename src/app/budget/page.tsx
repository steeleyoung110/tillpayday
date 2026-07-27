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
import { getDashboardData } from "@/lib/data";
import {
  currentPayCycle,
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
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Budget: everything you manage — income, buckets, bills, what-ifs.
 * The Dashboard is the glance; this is where changes happen.
 */
export default async function BudgetPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getDashboardData();
  if (data.buckets.length === 0) redirect("/"); // onboarding lives on the dashboard
  const todayISO = new Date().toISOString().slice(0, 10);

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

  return (
    <AppShell active="budget">
      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-6">
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
          />
          <ExpensesPanel data={data} balances={balances} todayISO={todayISO} />
          <GoalsPanel data={data} />
          <WhatIfPanel data={data} />
        </div>
      </div>
      <LegalFooter />
    </AppShell>
  );
}
