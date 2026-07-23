import { redirect } from "next/navigation";
import {
  addAsset,
  addLiability,
  toggleArchived,
  toggleNetWorthBridge,
  undoRestore,
} from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { InlineValue } from "@/components/InlineValue";
import { InstantAction } from "@/components/InstantAction";
import { LegalFooter } from "@/components/LegalFooter";
import { NetWorthChart } from "@/components/NetWorthChart";
import { getDashboardData, getNetWorthData } from "@/lib/data";
import { paydayRecap } from "@/lib/engine";
import { computeTotals } from "@/lib/netWorth";
import {
  LIQUID_CATEGORIES,
  bucketToEngine,
  expenseToEngine,
  incomeEntryToEngine,
  incomeToEngine,
  type AssetCategory,
  type AssetRow,
  type LiabilityCategory,
  type LiabilityRow,
} from "@/lib/rows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const ASSET_LABELS: Record<AssetCategory, string> = {
  cash: "Cash & checking",
  savings: "Savings",
  investment: "Investments",
  retirement: "Retirement",
  property: "Home & property",
  vehicle: "Vehicles",
  other: "Other things you own",
};

const LIABILITY_LABELS: Record<LiabilityCategory, string> = {
  credit_card: "Credit cards",
  auto_loan: "Car loans",
  student_loan: "Student loans",
  mortgage: "Mortgage",
  personal_loan: "Personal loans",
  other: "Other debts",
};

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";
const btnCls =
  "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

export default async function NetWorthPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [nw, dash] = await Promise.all([getNetWorthData(), getDashboardData()]);
  const todayISO = new Date().toISOString().slice(0, 10);

  // 9D bridge: budget savings as a read-only asset, only when opted in.
  const savingsBucket = dash.buckets.find((b) => b.is_savings);
  const bridgeOn = Boolean(savingsBucket?.include_in_net_worth);
  let bridge = 0;
  if (bridgeOn && savingsBucket) {
    const liquid = dash.netWorth
      .filter((i) => i.kind === "asset" && LIQUID_CATEGORIES.includes(i.category))
      .reduce((s, i) => s + Number(i.amount), 0);
    const startingSavings =
      Number(savingsBucket.starting_balance) > 0
        ? Number(savingsBucket.starting_balance)
        : liquid;
    const recap = paydayRecap(
      dash.income.map(incomeToEngine),
      dash.buckets.map(bucketToEngine),
      dash.expenses.map(expenseToEngine),
      startingSavings,
      todayISO,
      dash.incomeEntries.map(incomeEntryToEngine),
    );
    bridge = Math.max(0, recap?.savingsTotal ?? startingSavings);
  }

  const activeAssets = nw.assets.filter((a) => !a.is_archived);
  const activeLiabilities = nw.liabilities.filter((l) => !l.is_archived);
  const archived = [
    ...nw.assets.filter((a) => a.is_archived).map((a) => ({ ...a, table: "assets" as const })),
    ...nw.liabilities.filter((l) => l.is_archived).map((l) => ({ ...l, table: "liabilities" as const })),
  ];
  const totals = computeTotals(nw.assets, nw.liabilities, bridge);

  const assetsByCat = (Object.keys(ASSET_LABELS) as AssetCategory[])
    .map((c) => ({ cat: c, items: activeAssets.filter((a) => a.category === c) }))
    .filter((g) => g.items.length > 0);
  const liabilitiesByCat = (Object.keys(LIABILITY_LABELS) as LiabilityCategory[])
    .map((c) => ({ cat: c, items: activeLiabilities.filter((l) => l.category === c) }))
    .filter((g) => g.items.length > 0);

  const itemRow = (
    table: "assets" | "liabilities",
    item: AssetRow | LiabilityRow,
    value: number,
  ) => (
    <li
      key={item.id}
      className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
    >
      <span className="text-slate-200">
        {item.name}
        {"interest_rate" in item && item.interest_rate !== null && (
          <span className="ml-2 text-xs text-slate-500">{`${Number(item.interest_rate)}% interest`}</span>
        )}
        {item.notes && (
          <span className="ml-2 text-xs text-slate-500">{item.notes}</span>
        )}
      </span>
      <span className="flex items-center gap-3">
        <InlineValue table={table} id={item.id} name={item.name} value={value} />
        <InstantAction
          action={toggleArchived}
          undoAction={undoRestore}
          values={{ table, id: item.id, archived: "true" }}
          message={`${item.name} archived — it keeps its history, just doesn't count anymore.`}
          className="text-xs text-slate-500 transition hover:text-amber-300"
          title="Archive — stops counting toward your total but keeps the history."
        >
          archive
        </InstantAction>
      </span>
    </li>
  );

  return (
    <AppShell active="networth">
      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-6">
        {/* Hero */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-6">
          <p className="text-sm text-slate-400">Your net worth today</p>
          <p
            className={`mt-1 text-6xl font-black tracking-tight sm:text-7xl ${
              totals.netWorth >= 0 ? "text-white" : "text-red-300"
            }`}
          >
            {currency.format(totals.netWorth)}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {`${currency.format(totals.totalAssets)} you own − ${currency.format(totals.totalLiabilities)} you owe`}
          </p>
        </div>

        <NetWorthChart snapshots={nw.snapshots} todayISO={todayISO} />

        {/* 9D bridge */}
        {savingsBucket && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <form action={toggleNetWorthBridge} className="flex flex-wrap items-center justify-between gap-3">
              <input type="hidden" name="id" value={savingsBucket.id} />
              <input type="hidden" name="enabled" value={bridgeOn ? "false" : "true"} />
              <span className="text-sm text-slate-300">
                {bridgeOn
                  ? `Your budget savings (${currency.format(bridge)}) is counted as an asset here.`
                  : "Count your budget savings as an asset here? Your two views stay independent either way."}
              </span>
              <button className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 transition hover:border-emerald-400">
                {bridgeOn ? "Stop counting it" : "Include in net worth"}
              </button>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Assets */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 font-semibold text-white">What you own</h2>
            {bridgeOn && (
              <ul className="mb-3 space-y-2">
                <li className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm">
                  <span className="text-slate-200">
                    Budget savings
                    <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs text-emerald-300">
                      from your budget
                    </span>
                  </span>
                  <span className="font-semibold text-white">{currency.format(bridge)}</span>
                </li>
              </ul>
            )}
            {assetsByCat.map((g) => (
              <div key={g.cat} className="mb-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {ASSET_LABELS[g.cat]}
                </p>
                <ul className="space-y-2">
                  {g.items.map((a) => itemRow("assets", a, Number(a.current_value)))}
                </ul>
              </div>
            ))}
            {activeAssets.length === 0 && !bridgeOn && (
              <p className="mb-4 text-sm text-slate-500">
                Start with whatever's easy — your checking balance counts.
              </p>
            )}
            <form action={addAsset} className="grid grid-cols-2 gap-2">
              <input name="name" placeholder="e.g. Ally savings" required className={`${inputCls} col-span-2`} />
              <input name="current_value" type="number" step="0.01" min="0" placeholder="What it's worth" required className={inputCls} />
              <select name="category" className={inputCls} defaultValue="cash">
                {(Object.keys(ASSET_LABELS) as AssetCategory[]).map((c) => (
                  <option key={c} value={c}>{ASSET_LABELS[c]}</option>
                ))}
              </select>
              <input name="notes" placeholder="Note (optional)" className={`${inputCls} col-span-2`} />
              <button className={`${btnCls} col-span-2`}>Add to what you own</button>
            </form>
          </div>

          {/* Liabilities */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 font-semibold text-white">What you owe</h2>
            {liabilitiesByCat.map((g) => (
              <div key={g.cat} className="mb-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {LIABILITY_LABELS[g.cat]}
                </p>
                <ul className="space-y-2">
                  {g.items.map((l) => itemRow("liabilities", l, Number(l.current_balance)))}
                </ul>
              </div>
            ))}
            {activeLiabilities.length === 0 && (
              <p className="mb-4 text-sm text-slate-500">
                Cards, loans, anything you&apos;re paying down. No judgment —
                just a starting point.
              </p>
            )}
            <form action={addLiability} className="grid grid-cols-2 gap-2">
              <input name="name" placeholder="e.g. Visa card" required className={`${inputCls} col-span-2`} />
              <input name="current_balance" type="number" step="0.01" min="0" placeholder="What's left on it" required className={inputCls} />
              <select name="category" className={inputCls} defaultValue="credit_card">
                {(Object.keys(LIABILITY_LABELS) as LiabilityCategory[]).map((c) => (
                  <option key={c} value={c}>{LIABILITY_LABELS[c]}</option>
                ))}
              </select>
              <input name="interest_rate" type="number" step="0.001" min="0" placeholder="Interest % (optional)" className={inputCls} />
              <input name="notes" placeholder="Note (optional)" className={inputCls} />
              <button className={`${btnCls} col-span-2`}>Add to what you owe</button>
            </form>
          </div>
        </div>

        {/* Archived */}
        {archived.length > 0 && (
          <details className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm">
            <summary className="cursor-pointer text-slate-400">
              {`Archived (${archived.length}) — kept for history, not counted`}
            </summary>
            <ul className="mt-3 space-y-2">
              {archived.map((item) => (
                <li key={item.id} className="flex items-center justify-between text-slate-500">
                  <span>
                    {item.name} ·{" "}
                    {currency.format(
                      Number(
                        "current_value" in item ? item.current_value : item.current_balance,
                      ),
                    )}
                  </span>
                  <InstantAction
                    action={toggleArchived}
                    undoAction={undoRestore}
                    values={{ table: item.table, id: item.id, archived: "false" }}
                    message={`${item.name} is back in your totals.`}
                    className="text-xs text-slate-500 transition hover:text-emerald-300"
                  >
                    bring back
                  </InstantAction>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <LegalFooter />
    </AppShell>
  );
}
