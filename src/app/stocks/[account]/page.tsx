import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LazyHoldingsDonut, LazyValueChart } from "@/components/lazy/LazyCharts";
import { AddLotForm, GoalForm, LotEditor } from "@/components/stocks/StockForms";
import {
  Gain,
  GoalBar,
  HoldingsTable,
  MoveCards,
  NoStocksYet,
  Panel,
  SliceLegend,
  StatCard,
  StocksHeader,
  longDate,
  money,
  shares,
  shortDate,
} from "@/components/stocks/StocksUI";
import { pieSlices } from "@/lib/stocks/view";
import { loadStocks } from "../load";

const SUBTITLES: Record<string, string> = {
  brokerage: "Long-term income and growth. View only: this app reads Robinhood once a day and can't trade.",
  agentic: "The active trading account. View only here: this app reads Robinhood once a day and can't trade.",
  espp: "Copart employee stock purchase plan at Fidelity. Entered by hand; priced from the daily CPRT close.",
};

/** One account: its value, moves, pie, holdings, and (ESPP) purchases. */
export default async function StockAccountPage({ params }: { params: Promise<{ account: string }> }) {
  const [{ account: key }, view] = await Promise.all([params, loadStocks()]);
  const a = view.accounts.find((x) => x.key === key);
  if (!a) notFound();
  const { asOf } = view;
  const stockValue = a.holdings.reduce((s, h) => s + h.value, 0);
  const slices = pieSlices(a.holdings.map((h) => ({ label: h.symbol, value: h.value })));
  const upcoming = view.dividends.upcoming.filter((p) => p.accountKey === a.key).slice(0, 6);
  const isEspp = a.kind === "espp";
  const discount = a.lots.filter((l) => !l.sold && l.discount !== null).reduce((s, l) => s + (l.discount ?? 0), 0);
  const unpricedLots = a.lots.filter((l) => !l.sold && l.purchasePrice === null).length;
  const broker = a.broker === "fidelity" ? "Fidelity" : "Robinhood";

  return (
    <AppShell active="stocks">
      <div className="mx-auto max-w-screen-xl space-y-6 px-4 pt-6 sm:px-6">
        <StocksHeader
          title={`${a.name}${a.last4 ? ` ••${a.last4}` : ""}`}
          subtitle={`${broker} · ${SUBTITLES[a.kind] ?? ""}`}
          active={a.key}
          accounts={view.accounts}
          asOf={asOf}
        />
        {!asOf ? (
          <NoStocksYet />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Account value" hint={a.syncedAt ? `Synced ${longDate(a.syncedAt.slice(0, 10))}` : isEspp ? "From your purchases × CPRT close" : undefined}>
                {money(a.value)}
              </StatCard>
              <StatCard
                label="Gain since bought"
                hint={a.gain === null ? (unpricedLots ? `${unpricedLots} purchase${unpricedLots === 1 ? "" : "s"} still need the price you paid` : "No cost on file") : a.cost ? `Paid ${money(a.cost)}` : undefined}
              >
                <Gain value={a.gain} base={a.cost} />
              </StatCard>
              {isEspp ? (
                <StatCard label="Shares held" hint={discount > 0 ? `ESPP discount was worth ${money(discount)} on purchase days` : "CPRT pays no dividend"}>
                  {shares(a.holdings.reduce((s, h) => s + h.shares, 0))}
                </StatCard>
              ) : (
                <StatCard label="Dividends per year" hint={<Link href="/stocks/dividends" className="hover:underline">At today&apos;s shares →</Link>}>
                  {money(a.annualIncome, true)}
                </StatCard>
              )}
              <StatCard label={isEspp ? "CPRT price" : "Cash & crypto"} hint={isEspp ? `Close on ${shortDate(asOf)}` : "Not in the pie"}>
                {isEspp ? money(a.holdings[0]?.price ?? 0, true) : money(a.cash + a.crypto, true)}
              </StatCard>
            </div>

            {a.goal ? <GoalBar value={a.value} goal={a.goal} /> : null}
            <div className="-mt-3">
              <GoalForm account={a.key} amount={a.goal?.amount ?? null} date={a.goal?.date ?? null} />
            </div>

            <MoveCards changes={a.changes} asOf={asOf} />

            <div className="grid gap-4 lg:grid-cols-2">
              {slices.length > 1 ? (
                <Panel title="Breakdown by stock">
                  <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <LazyHoldingsDonut slices={slices} centerLabel="Stocks" centerValue={money(stockValue)} />
                    <SliceLegend slices={slices} />
                  </div>
                </Panel>
              ) : null}
              <Panel title="Value over time" aside={a.series.length ? `Since ${shortDate(a.series[0].day)}` : undefined}>
                {a.series.length >= 2 ? (
                  <LazyValueChart points={a.series} goal={a.goal?.amount ?? null} />
                ) : (
                  <p className="py-16 text-center text-sm text-slate-400">The chart fills in as the daily sync runs.</p>
                )}
                {!isEspp && a.series.some((p) => p.backfilled) ? (
                  <p className="mt-2 text-xs text-slate-500">Days before syncing started are worked out from today&apos;s shares.</p>
                ) : null}
              </Panel>
              {isEspp ? (
                <Panel title="Dividends">
                  <p className="text-sm text-slate-300">
                    Copart doesn&apos;t pay a dividend, so this account grows only with the CPRT price and new purchases.
                  </p>
                </Panel>
              ) : null}
            </div>

            {isEspp ? (
              <Panel title="Purchases" aside="Fidelity → Stock Plans → Purchase history">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="py-2 pr-3 font-semibold">Date</th>
                        <th className="px-3 py-2 text-right font-semibold">Shares</th>
                        <th className="px-3 py-2 text-right font-semibold">Paid</th>
                        <th className="px-3 py-2 text-right font-semibold">Value now</th>
                        <th className="px-3 py-2 text-right font-semibold">Gain</th>
                        <th className="py-2 pl-3 font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {a.lots.map((l) => (
                        <tr key={l.id} className={`border-b border-slate-800/60 align-top last:border-0 ${l.sold ? "opacity-50" : ""}`}>
                          <td className="py-2 pr-3 text-slate-200">
                            {l.purchaseDate ? longDate(l.purchaseDate) : "Starting balance"}
                            {l.sold ? <span className="ml-2 text-xs text-slate-400">sold</span> : null}
                            {l.note ? <p className="text-xs text-slate-500">{l.note}</p> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{shares(l.shares)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                            {l.purchasePrice === null ? "—" : `${money(l.purchasePrice, true)} / sh`}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-white">{money(l.value)}</td>
                          <td className="px-3 py-2 text-right">
                            <Gain value={l.gain} base={l.cost} />
                          </td>
                          <td className="py-2 pl-3">
                            <LotEditor lot={l} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-5 border-t border-slate-800 pt-4">
                  <p className="mb-3 text-sm font-semibold text-white">Add a purchase</p>
                  <AddLotForm account={a.key} />
                  <p className="mt-2 text-xs text-slate-500">
                    Enter each purchase from Fidelity to get exact gains. Once they add up to your shares, remove the starting balance.
                  </p>
                </div>
              </Panel>
            ) : (
              <>
                {upcoming.length ? (
                  <Panel title="Dividends coming up" aside={<Link href="/stocks/dividends" className="hover:underline">All dividends →</Link>}>
                    <ul className="divide-y divide-slate-800 text-sm">
                      {upcoming.map((p) => (
                        <li key={`${p.symbol}-${p.payDate}`} className="flex items-center justify-between gap-3 py-2">
                          <span className="font-semibold text-white">{p.symbol}</span>
                          <span className="flex-1 text-slate-400">{`${shortDate(p.payDate)}${p.declared ? "" : " (expected)"}`}</span>
                          <span className="tabular-nums text-slate-200">{money(p.amount, true)}</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ) : null}
                <section className="space-y-3">
                  <h2 className="text-base font-bold text-white">Holdings</h2>
                  <HoldingsTable holdings={a.holdings} total={stockValue} />
                </section>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
