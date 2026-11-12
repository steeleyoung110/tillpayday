import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LazyHoldingsDonut, LazyValueChart } from "@/components/lazy/LazyCharts";
import { AddLotForm, GoalForm, LotEditor } from "@/components/stocks/StockForms";
import {
  BROKER_LABELS,
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
  pctText,
  shares,
  shortDate,
} from "@/components/stocks/StocksUI";
import { pieSlices } from "@/lib/stocks/view";
import { loadStocks } from "../load";

const SUBTITLES: Record<string, string> = {
  brokerage: "Long-term income and growth. View only: this app reads Robinhood once a day and can't trade.",
  agentic: "The active trading account. View only here: this app reads Robinhood once a day and can't trade.",
  espp: "Copart employee stock purchase plan (Morgan Stanley at Work). Updated when you tell Claude about a purchase or sale.",
};

/** One account: its value, moves, pie, holdings, and (ESPP) purchases. */
export default async function StockAccountPage({ params }: { params: Promise<{ account: string }> }) {
  const [{ account: key }, view] = await Promise.all([params, loadStocks()]);
  const a = view.accounts.find((x) => x.key === key);
  if (!a) notFound();
  const { asOf, liveAt } = view;
  const stockValue = a.holdings.reduce((s, h) => s + h.value, 0);
  const slices = pieSlices(a.holdings.map((h) => ({ label: h.symbol, value: h.value })));
  const upcoming = view.dividends.upcoming.filter((p) => p.accountKey === a.key).slice(0, 6);
  const isEspp = a.kind === "espp";
  const unpricedLots = a.lots.filter((l) => !l.sold && l.purchasePrice === null).length;
  const broker = BROKER_LABELS[a.broker] ?? "";
  const held = a.holdings[0];
  const breakEven = isEspp && held?.avgCost ? held.avgCost : null;
  const hasSales = a.lots.some((l) => l.sold);

  return (
    <AppShell active="stocks">
      <div className="mx-auto max-w-screen-xl space-y-6 px-4 pt-6 sm:px-6">
        <StocksHeader
          title={`${a.name}${a.last4 ? ` ••${a.last4}` : ""}`}
          subtitle={`${broker ? `${broker} · ` : ""}${SUBTITLES[a.kind] ?? ""}`}
          active={a.key}
          accounts={view.accounts}
          asOf={asOf}
          liveAt={liveAt}
        />
        {!asOf ? (
          <NoStocksYet />
        ) : (
          <>
            {isEspp ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Account value" hint={held ? `${shares(held.shares)} shares × ${money(held.price ?? 0, true)}` : undefined}>
                  {money(a.value)}
                </StatCard>
                <StatCard
                  label={a.gain !== null && a.gain < 0 ? "Loss on shares held" : "Profit on shares held"}
                  hint={a.gain === null ? `${unpricedLots} purchase${unpricedLots === 1 ? "" : "s"} still need the price paid` : `Paid ${money(a.cost ?? 0)} in all`}
                >
                  <Gain value={a.gain} base={a.cost} />
                </StatCard>
                <StatCard
                  label="Break-even price"
                  hint={
                    breakEven && held?.price
                      ? held.price >= breakEven
                        ? `CPRT is ${money(held.price - breakEven, true)} above it`
                        : `CPRT needs ${money(breakEven - held.price, true)} more (${pctText((breakEven - held.price) / held.price)})`
                      : "Average price paid per share"
                  }
                >
                  {breakEven ? money(breakEven, true) : "—"}
                </StatCard>
                <StatCard label={hasSales ? "Profit from sales" : "Sold so far"} hint={hasSales ? "Locked in when you sold" : "Nothing sold yet"}>
                  {hasSales ? <Gain value={a.realized} /> : money(0, true)}
                </StatCard>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Account value" hint={a.syncedAt ? `Synced ${longDate(a.syncedAt.slice(0, 10))}` : undefined}>
                  {money(a.value)}
                </StatCard>
                <StatCard label="Gain since bought" hint={a.cost ? `Paid ${money(a.cost)}` : "No cost on file"}>
                  <Gain value={a.gain} base={a.cost} />
                </StatCard>
                <StatCard label="Dividends per year" hint={<Link href="/stocks/dividends" className="hover:underline">At today&apos;s shares →</Link>}>
                  {money(a.annualIncome, true)}
                </StatCard>
                <StatCard label="Cash & crypto" hint="Not in the pie">
                  {money(a.cash + a.crypto, true)}
                </StatCard>
              </div>
            )}

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
              <Panel title="Purchases and sales" aside="Tell Claude when you buy or sell and it's updated here">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="py-2 pr-3 font-semibold">Bought</th>
                        <th className="px-3 py-2 text-right font-semibold">Shares</th>
                        <th className="px-3 py-2 text-right font-semibold">Price paid</th>
                        <th className="px-3 py-2 text-right font-semibold">Worth now</th>
                        <th className="px-3 py-2 text-right font-semibold">Profit / loss</th>
                        <th className="py-2 pl-3 font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {a.lots.map((l) => (
                        <tr key={l.id} className="border-b border-slate-800/60 align-top last:border-0">
                          <td className="py-2 pr-3 text-slate-200">
                            {l.purchaseDate ? longDate(l.purchaseDate) : "Earlier purchases"}
                            {l.note ? <p className="text-xs text-slate-500">{l.note}</p> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{shares(l.shares)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                            {l.purchasePrice === null ? "—" : money(l.purchasePrice, true)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.sold ? (
                              <span className="text-xs text-slate-400">
                                {`Sold${l.saleDate ? ` ${shortDate(l.saleDate)}` : ""}${l.salePrice !== null ? ` at ${money(l.salePrice, true)}` : ""}`}
                              </span>
                            ) : (
                              <span className="font-semibold text-white">{money(l.value)}</span>
                            )}
                          </td>
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
                <details className="mt-4 border-t border-slate-800 pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200">Add a purchase yourself</summary>
                  <div className="mt-3">
                    <AddLotForm account={a.key} />
                  </div>
                </details>
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
