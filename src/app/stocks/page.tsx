import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { LazyHoldingsDonut, LazyValueChart } from "@/components/lazy/LazyCharts";
import {
  BROKER_LABELS,
  Gain,
  HoldingsTable,
  Move,
  MoveCards,
  NoStocksYet,
  Panel,
  SliceLegend,
  StatCard,
  StocksHeader,
  money,
  pctText,
  shortDate,
} from "@/components/stocks/StocksUI";
import { PERIODS, PERIOD_LABELS, holdingSlices } from "@/lib/stocks/view";
import { loadStocks } from "./load";

/**
 * Stocks → Portfolio: every account added together (Robinhood, Agentic and
 * the Copart ESPP), the pie by stock, and how it moved today, this week and
 * this month. Nothing here feeds the property dashboard or spreadsheets.
 */
export default async function StocksPortfolioPage() {
  const view = await loadStocks();
  const { total, accounts, asOf, dividends, liveAt } = view;
  const stockValue = total.holdings.reduce((s, h) => s + h.value, 0);
  const slices = holdingSlices(total.holdings);
  const top = total.holdings[0];
  const cashLike = accounts.reduce((s, a) => s + a.cash + a.crypto, 0);
  const missingCost = accounts.filter((a) => a.holdings.length && a.cost === null).map((a) => a.name);
  const realized = accounts.reduce((s, a) => s + a.realized, 0);

  return (
    <AppShell active="stocks">
      <div className="mx-auto max-w-screen-xl space-y-6 px-4 pt-6 sm:px-6">
        <StocksHeader title="Stocks" active="portfolio" accounts={accounts} asOf={asOf} liveAt={liveAt} />
        {!asOf ? (
          <NoStocksYet />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="All accounts" hint={`${accounts.length} accounts · ${total.holdings.length} stocks`}>
                {money(total.value)}
              </StatCard>
              <StatCard
                label="Gain since bought"
                hint={
                  missingCost.length
                    ? `Leaves out ${missingCost.join(", ")} until its purchase prices are in`
                    : realized
                      ? `Shares held, vs. what you paid · plus ${money(realized, true)} from ESPP sales`
                      : "Shares held now, vs. what you paid"
                }
              >
                {total.gain === null ? (
                  <Gain value={accounts.filter((a) => a.gain !== null).reduce((s, a) => s + (a.gain ?? 0), 0)} />
                ) : (
                  <Gain value={total.gain} base={total.cost} />
                )}
              </StatCard>
              <StatCard label="Dividends per year" hint={<Link href="/stocks/dividends" className="hover:underline">{`At today's shares · see Dividends →`}</Link>}>
                {money(dividends.annualIncome, true)}
              </StatCard>
              <StatCard label="Biggest holding" hint={top ? `${money(top.value)} of the total` : undefined}>
                {top ? `${top.symbol} ${pctText(stockValue > 0 ? top.value / stockValue : null, 0)}` : "—"}
              </StatCard>
            </div>

            <MoveCards changes={total.changes} asOf={asOf} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Breakdown by stock" aside="All accounts, CPRT counted once">
                <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
                  <LazyHoldingsDonut slices={slices} centerLabel="Stocks" centerValue={money(stockValue)} />
                  <SliceLegend slices={slices} />
                </div>
                {cashLike > 0.5 ? (
                  <p className="mt-3 text-xs text-slate-400">{`Plus ${money(cashLike, true)} in cash and crypto (not in the pie).`}</p>
                ) : null}
              </Panel>
              <Panel title="Value over time" aside={total.series.length ? `Since ${shortDate(total.series[0].day)}` : undefined}>
                {total.series.length >= 2 ? (
                  <LazyValueChart points={total.series} />
                ) : (
                  <p className="py-16 text-center text-sm text-slate-400">The chart fills in as the daily sync runs.</p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Days before syncing started are worked out from today&apos;s shares. Deposits show up here; they don&apos;t
                  count in the day / week / month moves.
                </p>
              </Panel>
            </div>

            <Panel title="Accounts">
              <div className="grid gap-3 md:grid-cols-3">
                {accounts.map((a) => (
                  <Link
                    key={a.key}
                    href={`/stocks/${a.key}`}
                    className="group rounded-xl border border-slate-800 bg-slate-950/40 p-4 transition hover:border-slate-600"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-bold text-white group-hover:underline">{a.name}</p>
                      <p className="text-xs text-slate-500">{`${BROKER_LABELS[a.broker] ?? ""}${a.last4 ? ` ••${a.last4}` : ""}`}</p>
                    </div>
                    <p className="mt-1 text-2xl font-bold text-white tabular-nums">{money(a.value)}</p>
                    <dl className="mt-2 space-y-1 text-xs">
                      {PERIODS.map((p) => (
                        <div key={p} className="flex justify-between gap-2">
                          <dt className="text-slate-400">{PERIOD_LABELS[p]}</dt>
                          <dd>
                            <Move change={a.changes[p]} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Link>
                ))}
              </div>
            </Panel>

            <section className="space-y-3">
              <h2 className="text-base font-bold text-white">Every stock</h2>
              <HoldingsTable holdings={total.holdings} total={stockValue} />
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
