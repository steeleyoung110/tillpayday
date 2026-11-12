import { AppShell } from "@/components/AppShell";
import { LazyDividendMonthsChart, LazyIncomeTrendChart } from "@/components/lazy/LazyCharts";
import { NoStocksYet, Panel, StatCard, StocksHeader, longDate, money, shares, shortDate } from "@/components/stocks/StocksUI";
import { addDays } from "@/lib/ops/board";
import { FREQUENCY_LABEL, type Payment } from "@/lib/stocks/view";
import { loadStocks } from "../load";

/**
 * Stocks → Dividends: what the stocks pay a year at today's shares, what's
 * been paid, what's coming, and month by month so you can see where it's
 * heading. Past payouts are recorded by the daily sync, starting November 2026.
 */
export default async function StocksDividendsPage() {
  const view = await loadStocks();
  const { asOf, accounts, dividends: d, liveAt } = view;
  const nameOf = new Map(accounts.map((a) => [a.key, a.name]));
  const year = asOf?.slice(0, 4) ?? "";
  const soon = asOf ? d.upcoming.filter((p) => p.payDate <= addDays(asOf, 60)) : [];
  const next12 = d.upcoming.reduce((s, p) => s + p.amount, 0);
  const recent = d.history.slice(0, 40);
  const older = d.history.slice(40);

  return (
    <AppShell active="stocks">
      <div className="mx-auto max-w-screen-xl space-y-6 px-4 pt-6 sm:px-6">
        <StocksHeader
          title="Dividends"
          subtitle="What your stocks pay, what's been paid, and what's coming."
          active="dividends"
          accounts={accounts}
          asOf={asOf}
          liveAt={liveAt}
        />
        {!asOf ? (
          <NoStocksYet />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Per year" hint={`${money(d.annualIncome / 12, true)} a month on average, at today's shares`}>
                {money(d.annualIncome, true)}
              </StatCard>
              <StatCard label={`Paid in ${year}`} hint={d.historyFrom ? `Tracked since ${shortDate(d.historyFrom)}` : "Tracking starts with the first payout"}>
                {money(d.paidThisYear, true)}
              </StatCard>
              <StatCard label={`Still coming in ${year}`} hint="Announced, plus each stock's usual schedule">
                {money(d.stillThisYear, true)}
              </StatCard>
              <StatCard label={`${year} expected total`} hint="Paid since tracking started, plus still coming">
                {money(d.paidThisYear + d.stillThisYear, true)}
              </StatCard>
            </div>

            <Panel title="Month by month" aside="Past 12 months and the next 12">
              <LazyDividendMonthsChart months={d.months} />
              <p className="mt-2 text-xs text-slate-500">Paid bars start from November 2026, when tracking began, and fill in as dividends land.</p>
            </Panel>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Panel title="Where it's heading">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-950/50 p-3">
                    <dt className="text-xs text-slate-400">Last 12 months, paid</dt>
                    <dd className="mt-0.5 text-lg font-bold text-white tabular-nums">{money(d.trailing12, true)}</dd>
                  </div>
                  <div className="rounded-xl bg-slate-950/50 p-3">
                    <dt className="text-xs text-slate-400">Next 12 months, expected</dt>
                    <dd className="mt-0.5 text-lg font-bold text-white tabular-nums">{money(next12, true)}</dd>
                  </div>
                </dl>
                {d.incomeTrend.length >= 2 ? (
                  <>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Yearly dividends, as each day&apos;s shares stood</p>
                    <LazyIncomeTrendChart points={d.incomeTrend} />
                  </>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">
                    {`Tracking started ${d.incomeTrend[0] ? shortDate(d.incomeTrend[0].day) : "today"} at ${money(d.annualIncome, true)} a year. Each weekday's sync adds a point, so you'll see this line climb as reinvested dividends and new buys add shares.`}
                  </p>
                )}
                <p className="mt-3 text-xs text-slate-500">The last-12-months figure counts from when tracking started, so it grows into a full year.</p>
              </Panel>

              <Panel title="Next 60 days" aside={`${soon.length} payments · ${money(soon.reduce((s, p) => s + p.amount, 0), true)}`}>
                {soon.length ? (
                  <>
                    <UpcomingList rows={soon.slice(0, 10)} nameOf={nameOf} />
                    {soon.length > 10 ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-sm font-semibold text-emerald-300 hover:underline">{`Show ${soon.length - 10} more`}</summary>
                        <UpcomingList rows={soon.slice(10)} nameOf={nameOf} />
                      </details>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Nothing due in the next 60 days.</p>
                )}
              </Panel>
            </div>

            <Panel title="By stock" aside={`Stock prices ${liveAt ? "live" : `as of the ${shortDate(asOf)} close`} · dividends at the latest announced amount`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-3 font-semibold">Stock</th>
                      <th className="px-3 py-2 text-right font-semibold">Shares</th>
                      <th className="px-3 py-2 text-right font-semibold">Stock price</th>
                      <th className="px-3 py-2 text-right font-semibold">Value</th>
                      <th className="px-3 py-2 text-right font-semibold">Dividend / share</th>
                      <th className="px-3 py-2 font-semibold">How often</th>
                      <th className="px-3 py-2 text-right font-semibold">Per year</th>
                      <th className="px-3 py-2 text-right font-semibold">Yield</th>
                      <th className="px-3 py-2 text-right font-semibold">On your cost</th>
                      <th className="py-2 pl-3 text-right font-semibold">Next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.bySymbol.map((s) => (
                      <tr key={s.symbol} className="border-b border-slate-800/60 last:border-0">
                        <td className="py-2 pr-3 font-bold text-white">{s.symbol}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{shares(s.shares)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-200">{s.price === null ? "—" : money(s.price, true)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(s.value)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{`$${s.perShare.toFixed(s.perShare < 1 ? 4 : 2)}`}</td>
                        <td className="px-3 py-2 text-slate-300">{FREQUENCY_LABEL[s.ppy] ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-white">{money(s.annual, true)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{s.yieldPct === null ? "—" : `${s.yieldPct.toFixed(1)}%`}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{s.yieldOnCost === null ? "—" : `${s.yieldOnCost.toFixed(1)}%`}</td>
                        <td className="py-2 pl-3 text-right tabular-nums text-slate-400">
                          {s.nextPay ? `${shortDate(s.nextPay.payDate)}${s.nextPay.declared ? "" : "*"}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                * expected from the stock&apos;s usual schedule; not announced yet. Stocks that don&apos;t pay (like CPRT) aren&apos;t listed.
              </p>
            </Panel>

            <Panel title="Past payouts" aside={d.historyFrom ? `Since ${longDate(d.historyFrom)}` : undefined}>
              {d.history.length ? (
                <>
                  <PayoutList rows={recent} nameOf={nameOf} />
                  {older.length ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-300 hover:underline">{`Show ${older.length} older`}</summary>
                      <PayoutList rows={older} nameOf={nameOf} />
                    </details>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-400">No payouts recorded yet.</p>
              )}
            </Panel>

          </>
        )}
      </div>
    </AppShell>
  );
}

function UpcomingList({ rows, nameOf }: { rows: Payment[]; nameOf: Map<string, string> }) {
  return (
    <ul className="divide-y divide-slate-800 text-sm">
      {rows.map((p) => (
        <li key={`${p.accountKey}-${p.symbol}-${p.payDate}`} className="flex items-center gap-3 py-2">
          <span className="w-16 shrink-0 tabular-nums text-slate-400">{shortDate(p.payDate)}</span>
          <span className="w-14 shrink-0 font-bold text-white">{p.symbol}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {`${nameOf.get(p.accountKey) ?? p.accountKey} · ${p.declared ? "announced" : "expected"}`}
          </span>
          <span className="tabular-nums text-slate-100">{money(p.amount, true)}</span>
        </li>
      ))}
    </ul>
  );
}

function PayoutList({
  rows,
  nameOf,
}: {
  rows: { accountKey: string; symbol: string; payDate: string; amount: number; source: string }[];
  nameOf: Map<string, string>;
}) {
  return (
    <ul className="divide-y divide-slate-800 text-sm">
      {rows.map((r) => (
        <li key={`${r.accountKey}-${r.symbol}-${r.payDate}-${r.source}`} className="flex items-center gap-3 py-2">
          <span className="w-24 shrink-0 tabular-nums text-slate-400">{longDate(r.payDate)}</span>
          <span className="w-14 shrink-0 font-bold text-white">{r.symbol}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {`${nameOf.get(r.accountKey) ?? r.accountKey}${r.source === "estimated" ? " · from shares held on the pay date" : ""}`}
          </span>
          <span className="tabular-nums text-slate-100">{money(r.amount, true)}</span>
        </li>
      ))}
    </ul>
  );
}
