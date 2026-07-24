import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LegalFooter } from "@/components/LegalFooter";
import { PaycheckPie, type PieSlice } from "@/components/PaycheckPie";
import { BUCKET_COLORS } from "@/components/ProjectionChart";
import {
  BucketsPanel,
  ExpensesPanel,
  GoalsPanel,
  IncomePanel,
  WhatIfPanel,
} from "@/components/panels";
import { getDashboardData } from "@/lib/data";
import {
  UNALLOCATED_KEY,
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
} from "@/lib/rows";
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

  // The paycheck pie: how one typical check splits, colored to match the
  // projection chart's per-bucket lines (same order-based palette).
  const colorFor = (bucketId: string | null) => {
    const i = data.buckets.findIndex((b) => b.id === bucketId);
    return i >= 0 ? BUCKET_COLORS[i % BUCKET_COLORS.length] : "#64748b";
  };
  const pieSlices: PieSlice[] = splitPaycheck(engineBuckets, typicalPaycheck).map(
    (s) => ({
      name: s.name,
      amount: s.amount,
      share: s.percent,
      color: colorFor(s.bucketId),
    }),
  );

  // The comparison donut: what actually left the buckets this cycle vs the
  // plan — same bucket colors so the two charts line up visually.
  const spend = cycleSpending(engineIncome, engineExpenses, todayISO);
  const bucketNameFor = (id: string | null) =>
    id === null
      ? "Savings / leftover"
      : data.buckets.find((b) => b.id === id)?.name ?? "Other";
  const spentSlices: PieSlice[] = (spend?.byBucket ?? []).map((s) => ({
    name: bucketNameFor(s.bucketId),
    amount: s.amount,
    share:
      typicalPaycheck > 0
        ? Math.round((s.amount / typicalPaycheck) * 1000) / 10
        : 0,
    color: colorFor(s.bucketId),
  }));
  const unspent =
    typicalPaycheck > 0 ? Math.max(0, typicalPaycheck - (spend?.total ?? 0)) : 0;
  if (unspent > 0 && spentSlices.length > 0) {
    spentSlices.push({
      name: "Still unspent",
      amount: Math.round(unspent * 100) / 100,
      share: Math.round((unspent / typicalPaycheck) * 1000) / 10,
      color: "#475569",
    });
  }

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  // Today's balance per bucket (this cycle's replay) — powers the overdraft
  // decision popup when a new bill outsizes its bucket.
  const savingsBucket = data.buckets.find((b) => b.is_savings);
  const liquidNow = data.netWorth
    .filter((i) => i.kind === "asset" && ["cash", "savings"].includes(i.category))
    .reduce((s, i) => s + Number(i.amount), 0);
  const startingSavings =
    savingsBucket && Number(savingsBucket.starting_balance) > 0
      ? Number(savingsBucket.starting_balance)
      : liquidNow;
  const cycle = currentPayCycle(engineIncome, todayISO);
  let balances: Record<string, number> | undefined;
  if (cycle) {
    const replay = runProjection({
      startDate: cycle.lastPayday,
      months: 1,
      startingBalances: {
        [savingsBucket ? savingsBucket.id : UNALLOCATED_KEY]: startingSavings,
      },
      incomeSources: engineIncome,
      buckets: engineBuckets,
      expenses: engineExpenses,
      incomeEntries: engineEntries,
    });
    const todayPoint =
      replay.points.find((p) => p.date === todayISO) ?? replay.points[0];
    balances = {};
    for (const b of data.buckets) {
      if (b.is_savings) continue;
      balances[b.id] = todayPoint.buckets[b.id] ?? 0;
    }
    balances[""] = savingsBucket
      ? todayPoint.buckets[savingsBucket.id] ?? 0
      : todayPoint.buckets[UNALLOCATED_KEY] ?? 0;
  }

  return (
    <AppShell active="budget">
      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Your budget</h2>
          <p className="text-sm text-slate-400">
            Income, buckets, bills, and maybe-purchases — change anything here
            and the Dashboard updates instantly.
          </p>
        </div>
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
                      {spentSlices.map((s) => (
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
              Matching colors, same bucket — when a slice on the right outgrows
              its twin on the left, that bucket is running ahead of plan.
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
          <BucketsPanel data={data} />
          <GoalsPanel data={data} />
          <ExpensesPanel data={data} balances={balances} todayISO={todayISO} />
          <WhatIfPanel data={data} />
        </div>
      </div>
      <LegalFooter />
    </AppShell>
  );
}
