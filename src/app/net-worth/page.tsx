import { redirect } from "next/navigation";
import {
  addAsset,
  addLiability,
  setLiabilityPayment,
  toggleArchived,
  toggleNetWorthBridge,
  undoRestore,
} from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { DebtStrategy } from "@/components/DebtStrategy";
import { InlineValue } from "@/components/InlineValue";
import { InstantAction } from "@/components/InstantAction";
import { LegalFooter } from "@/components/LegalFooter";
import { NetWorthChart } from "@/components/NetWorthChart";
import { computeTodayBalances } from "@/lib/balances";
import { getDashboardData, getNetWorthData } from "@/lib/data";
import { monthlyBillLoad } from "@/lib/efund";
import { HYSA_REFERENCE_APY, lazyMoney } from "@/lib/lazyMoney";
import { paydayRecap } from "@/lib/engine";
import { freedomStatus } from "@/lib/freedom";
import { computeTotals } from "@/lib/netWorth";
import { nwForecast } from "@/lib/nwForecast";
import { expenseShare } from "@/lib/rows";
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

  // Financial freedom %: the invested pile whose 4%/yr covers the bills.
  const investable = activeAssets
    .filter((a) => ["cash", "savings", "investment", "retirement"].includes(a.category))
    .reduce((s, a) => s + Number(a.current_value), 0);
  const monthlyLoad = monthlyBillLoad(
    dash.expenses.map((e) => ({ ...e, amount: expenseShare(e) })),
  );
  const freedom = freedomStatus(monthlyLoad, investable);

  // Lazy money: savings at big-bank APY while HYSAs pay ~4%.
  const lazyRows = lazyMoney(dash.buckets, computeTodayBalances(dash, todayISO) ?? null);

  // Milestone forecast: where the trend line crosses next, honestly framed.
  const forecast = nwForecast(
    nw.snapshots.map((s) => ({
      snapshot_date: s.snapshot_date,
      net_worth: Number(s.net_worth),
    })),
    todayISO,
  );

  // Month-over-month: latest snapshot vs the closest one ≥28 days older
  // (or the oldest available when history is younger than a month).
  const snaps = nw.snapshots;
  const latest = snaps[snaps.length - 1];
  const monthAgoISO = new Date(Date.now() - 28 * 86400000)
    .toISOString()
    .slice(0, 10);
  const baseline =
    [...snaps].reverse().find((s) => s.snapshot_date <= monthAgoISO) ??
    (snaps.length > 1 ? snaps[0] : undefined);
  const delta =
    latest && baseline && baseline.snapshot_date !== latest.snapshot_date
      ? {
          since: baseline.snapshot_date,
          net: Math.round((Number(latest.net_worth) - Number(baseline.net_worth)) * 100) / 100,
          assets:
            Math.round((Number(latest.total_assets) - Number(baseline.total_assets)) * 100) / 100,
          debts:
            Math.round(
              (Number(latest.total_liabilities) - Number(baseline.total_liabilities)) * 100,
            ) / 100,
        }
      : null;

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
        {"minimum_payment" in item && Number(item.minimum_payment) > 0 && (
          <span className="ml-2 text-xs text-slate-500">{`${currency.format(Number(item.minimum_payment))}/mo`}</span>
        )}
        {item.notes && (
          <span className="ml-2 text-xs text-slate-500">{item.notes}</span>
        )}
      </span>
      <span className="flex items-center gap-3">
        {table === "liabilities" && (
          <form action={setLiabilityPayment} className="flex items-center gap-1">
            <input type="hidden" name="id" value={item.id} />
            <input
              name="minimum_payment"
              type="number"
              step="0.01"
              min="0"
              defaultValue={
                "minimum_payment" in item && Number(item.minimum_payment) > 0
                  ? Number(item.minimum_payment)
                  : undefined
              }
              placeholder="pay/mo $"
              title="What you actually pay on this each month — unlocks the payoff date on your Dashboard."
              className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-white outline-none focus:border-emerald-400"
            />
            <button className="text-xs text-slate-500 transition hover:text-emerald-300">
              set
            </button>
          </form>
        )}
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
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
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
          {delta && (
            <p
              className={`mt-3 inline-block rounded-lg px-3 py-1.5 text-sm font-semibold ${
                delta.net >= 0
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-red-500/15 text-red-300"
              }`}
            >
              {`Since ${delta.since}: ${delta.net >= 0 ? "+" : "−"}${currency.format(Math.abs(delta.net))}`}
              <span className="ml-2 font-normal opacity-80">
                {`(own ${delta.assets >= 0 ? "+" : "−"}${currency.format(Math.abs(delta.assets))} · owe ${delta.debts >= 0 ? "+" : "−"}${currency.format(Math.abs(delta.debts))})`}
              </span>
            </p>
          )}
        </div>

        {(freedom || forecast) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {freedom && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="font-semibold text-white">Financial freedom 🗽</h2>
                <p className="mt-2 text-4xl font-black tracking-tight text-emerald-300">
                  {`${freedom.pct}%`}
                </p>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${Math.min(100, freedom.pct)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  {`Your bills run ${currency.format(freedom.monthlyBills)}/mo, so ${currency.format(freedom.freedomNumber)} invested covers them forever at a 4%/yr withdrawal. Your ${currency.format(freedom.investable)} covers ${currency.format(freedom.coveredMonthly)}/mo today.`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Small number? Everyone&apos;s starts small. Every bill you
                  shrink lowers the target AND speeds the climb — that lever
                  works from both ends.
                </p>
              </div>
            )}
            {forecast && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="font-semibold text-white">At this pace… 📈</h2>
                {forecast.flatOrFalling ? (
                  <p className="mt-2 text-sm text-slate-300">
                    {`Your last ${forecast.windowDays} days of snapshots trend flat or downward — no milestone dates will be invented from that. The chart above shows what's really happening; the fix lives in the Budget.`}
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-slate-300">
                      {`You're gaining about ${currency.format(Math.round(forecast.slopePerDay * 30.44))}/month (last ${forecast.windowDays} days of snapshots).`}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {forecast.crossings.map((c) => (
                        <li
                          key={c.amount}
                          className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
                        >
                          <span className="font-semibold text-emerald-300">
                            {c.amount === 0 ? "Crossing $0 🎉" : currency.format(c.amount)}
                          </span>
                          <span className="text-slate-400">{`around ${c.date.slice(0, 7)}`}</span>
                        </li>
                      ))}
                    </ul>
                    {forecast.crossings.length === 0 && (
                      <p className="mt-2 text-sm text-slate-400">
                        The next milestone is more than 5 years out at this
                        pace — which is exactly the kind of thing worth
                        knowing early.
                      </p>
                    )}
                  </>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  A straight-line guess from your own history — markets and
                  life both wobble. Keep the snapshots coming and it sharpens.
                </p>
              </div>
            )}
          </div>
        )}

        {lazyRows.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <h2 className="font-semibold text-amber-200">Lazy money 😴</h2>
            <p className="mb-3 mt-1 text-xs text-slate-400">
              {`Savings sitting at big-bank rates while high-yield accounts pay ~${HYSA_REFERENCE_APY}%. Moving banks is a 20-minute job that pays every year.`}
            </p>
            <ul className="space-y-1">
              {lazyRows.map((r) => (
                <li
                  key={r.bucketId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/60 px-3 py-1.5 text-sm"
                >
                  <span className="text-slate-200">
                    {r.name}
                    <span className="ml-2 text-xs text-slate-500">
                      {`${currency.format(r.balance)} at ${r.apy}% APY`}
                    </span>
                  </span>
                  <span className="text-amber-200">
                    {`earns ${r.earnsYearly < 1 ? `$${r.earnsYearly.toFixed(2)}` : currency.format(r.earnsYearly)}/yr — at ${HYSA_REFERENCE_APY}% it's ${currency.format(r.atReferenceYearly)}/yr (+${currency.format(r.missedYearly)})`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Set your bucket&apos;s real APY in Budget → Buckets once you
              move it, and this card retires itself.
            </p>
          </div>
        )}

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
              <input name="minimum_payment" type="number" step="0.01" min="0" placeholder="Payment $/mo (optional)" title="What you actually pay each month — unlocks the payoff date on your Dashboard." className={inputCls} />
              <input name="notes" placeholder="Note (optional)" className={`${inputCls} col-span-2`} />
              <button className={`${btnCls} col-span-2`}>Add to what you owe</button>
            </form>
          </div>
        </div>

        <DebtStrategy
          debts={activeLiabilities
            .filter(
              (l) =>
                Number(l.current_balance) > 0 &&
                l.interest_rate !== null &&
                Number(l.minimum_payment) > 0,
            )
            .map((l) => ({
              id: l.id,
              name: l.name,
              balance: Number(l.current_balance),
              aprPercent: Number(l.interest_rate),
              minPayment: Number(l.minimum_payment),
            }))}
        />

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
