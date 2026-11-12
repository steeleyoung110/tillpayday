import Link from "next/link";
import type { StocksSummary } from "@/lib/stocks/view";
import { PERIODS, PERIOD_LABELS } from "@/lib/stocks/view";
import { Move, longDate, money } from "./StocksUI";

/**
 * Stocks dropdown on the Board: each account's value and how much it's up or
 * down for the day, week and month. Collapsed by default so the board stays
 * about tasks; it reads stock tables only and never changes a board number.
 */
export function BoardStocks({ summary }: { summary: StocksSummary | null }) {
  if (!summary) return null;
  const day = summary.total.changes.day;
  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-900">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-base font-bold text-teal-300">📈 Stocks</span>
        <span className="text-sm font-semibold text-white tabular-nums">{money(summary.total.value)}</span>
        <span className="text-sm">
          <Move change={day} />
          <span className="ml-1.5 text-xs text-slate-400">{`day, ${longDate(summary.asOf)} close`}</span>
        </span>
        <span className="ml-auto text-xs font-semibold text-slate-400 group-open:hidden">Show accounts ▾</span>
        <span className="ml-auto hidden text-xs font-semibold text-slate-400 group-open:inline">Hide ▴</span>
      </summary>
      <div className="border-t border-slate-800 px-4 pb-3">
        {/* Phones: one card per account */}
        <ul className="divide-y divide-slate-800/60 sm:hidden">
          {[...summary.accounts, { key: "__all", name: "All accounts", value: summary.total.value, changes: summary.total.changes }].map((a) => (
            <li key={a.key} className="py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                {a.key === "__all" ? (
                  <span className="font-bold text-slate-200">{a.name}</span>
                ) : (
                  <Link href={`/stocks/${a.key}`} className="font-semibold text-white hover:underline">
                    {a.name}
                  </Link>
                )}
                <span className="font-semibold tabular-nums text-white">{money(a.value)}</span>
              </div>
              <dl className="mt-1 grid grid-cols-3 gap-2 text-xs">
                {PERIODS.map((p) => (
                  <div key={p}>
                    <dt className="text-slate-500">{PERIOD_LABELS[p]}</dt>
                    <dd>
                      <Move change={a.changes[p]} showPct={false} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <table className="hidden w-full text-sm sm:table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3 font-semibold">Account</th>
              <th className="px-3 py-2 text-right font-semibold">Value</th>
              {PERIODS.map((p) => (
                <th key={p} className="px-3 py-2 text-right font-semibold">
                  {PERIOD_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.accounts.map((a) => (
              <tr key={a.key} className="border-t border-slate-800/60">
                <td className="py-2 pr-3">
                  <Link href={`/stocks/${a.key}`} className="font-semibold text-white hover:underline">
                    {a.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-white">{money(a.value)}</td>
                {PERIODS.map((p) => (
                  <td key={p} className="px-3 py-2 text-right">
                    <Move change={a.changes[p]} className="text-xs" />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-slate-700">
              <td className="py-2 pr-3 font-bold text-slate-200">All accounts</td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-white">{money(summary.total.value)}</td>
              {PERIODS.map((p) => (
                <td key={p} className="px-3 py-2 text-right">
                  <Move change={summary.total.changes[p]} className="text-xs" />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">
          Moves are what the market did to the shares you hold (deposits don&apos;t count).{" "}
          <Link href="/stocks" className="font-semibold text-teal-300 hover:underline">
            Open Stocks →
          </Link>
        </p>
      </div>
    </details>
  );
}
