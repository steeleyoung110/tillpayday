import Link from "next/link";
import type { AccountView, Change, Changes, Holding, Slice } from "@/lib/stocks/view";
import { LiveRefresh } from "./LiveRefresh";
import { PERIODS, PERIOD_LABELS, changePct } from "@/lib/stocks/view";

/**
 * Shared pieces for the Stocks pages. Server components: plain markup, no
 * client JS. Up is green with ▲, down is red with ▼ — never color alone.
 */

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole dollars from $1,000 up; cents below, where they matter. */
export const money = (n: number, cents?: boolean) =>
  (cents ?? Math.abs(n) < 1000) ? usd2.format(n) : usd0.format(n);
export const pctText = (p: number | null, digits = 1) => (p === null ? "" : `${(p * 100).toFixed(digits)}%`);
export const shares = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : n < 100 ? 3 : 0 });

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DATE_Y = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const shortDate = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));
export const longDate = (iso: string) => DATE_Y.format(new Date(`${iso}T00:00:00Z`));
const LIVE_TIME = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
/** "Thu 11:42 AM" in New York time. */
export const liveTime = (iso: string) => LIVE_TIME.format(new Date(iso));

export const BROKER_LABELS: Record<string, string> = {
  robinhood: "Robinhood",
  fidelity: "Fidelity",
  etrade: "E*TRADE",
  other: "",
};

/** "Prices live · Thu 11:42 AM" or "Prices as of the Nov 11, 2026 close". */
export function priceAsOf(asOf: string, liveAt: string | null) {
  return liveAt ? `Live prices · last trade ${liveTime(liveAt)}` : `Prices as of the ${longDate(asOf)} close`;
}

/** "▲ $12.34 (0.4%)" in green, "▼ $5.00 (1.2%)" in red, "— $0.00" flat. */
export function Move({ change, showPct = true, className = "" }: { change: Change; showPct?: boolean; className?: string }) {
  const a = Math.round(change.amount * 100) / 100;
  const p = changePct(change);
  const tone = a > 0 ? "text-emerald-400" : a < 0 ? "text-rose-400" : "text-slate-400";
  const arrow = a > 0 ? "▲" : a < 0 ? "▼" : "—";
  const pct = showPct && p !== null ? ` (${pctText(Math.abs(p), 2)})` : "";
  return <span className={`whitespace-nowrap font-semibold tabular-nums ${tone} ${className}`}>{`${arrow} ${money(Math.abs(a))}${pct}`}</span>;
}

/** Plus/minus money for a gain since bought. */
export function Gain({ value, base }: { value: number | null; base?: number | null }) {
  if (value === null) return <span className="text-slate-500">—</span>;
  const tone = value > 0.004 ? "text-emerald-400" : value < -0.004 ? "text-rose-400" : "text-slate-300";
  const p = base ? ` (${pctText(value / base)})` : "";
  return <span className={`tabular-nums ${tone}`}>{`${value >= 0 ? "+" : "−"}${money(Math.abs(value))}${p}`}</span>;
}

export function StatCard({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 text-2xl font-bold text-white tabular-nums">{children}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

/** Day / Week / Month moves as three cards. */
export function MoveCards({ changes, asOf }: { changes: Changes; asOf: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {PERIODS.map((p) => (
        <div key={p} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{PERIOD_LABELS[p]}</p>
          <p className="mt-1 text-base sm:text-lg">
            <Move change={changes[p]} showPct={false} />
          </p>
          <p className="text-xs text-slate-400 tabular-nums">
            {changePct(changes[p]) === null ? "no history yet" : `${pctText(changePct(changes[p]), 2)} ${p === "day" ? `on ${shortDate(asOf)}` : "change"}`}
          </p>
        </div>
      ))}
    </div>
  );
}

export type StocksTab = "portfolio" | "dividends" | string;

/** Page title, the "as of" line, and the tabs across the Stocks pages. */
export function StocksHeader({
  title,
  subtitle,
  active,
  accounts,
  asOf,
  liveAt = null,
}: {
  title: string;
  subtitle?: string;
  active: StocksTab;
  accounts: Pick<AccountView, "key" | "name">[];
  asOf: string | null;
  liveAt?: string | null;
}) {
  const tabs = [
    { key: "portfolio", href: "/stocks", label: "Portfolio" },
    { key: "dividends", href: "/stocks/dividends", label: "Dividends" },
    ...accounts.map((a) => ({ key: a.key, href: `/stocks/${a.key}`, label: a.name })),
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {subtitle ?? "Read-only view of your brokerage accounts. Kept apart from the property numbers."}
          </p>
        </div>
        {asOf ? (
          <p className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
            {liveAt ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" aria-hidden /> : null}
            {liveAt
              ? `${priceAsOf(asOf, liveAt)} · refreshes every minute while the market's open`
              : `${priceAsOf(asOf, null)} · updates every weekday after the market closes`}
          </p>
        ) : null}
        <LiveRefresh enabled={!!liveAt} />
      </div>
      <nav aria-label="Stocks pages" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active === t.key ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              active === t.key
                ? "bg-[#17675d] text-white"
                : "border border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Legend beside a pie: swatch, name, share, dollars. */
export function SliceLegend({ slices }: { slices: Slice[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {slices.map((s) => (
        <li key={s.label} className="flex items-center gap-2" title={s.members?.join(", ")}>
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-200">{s.label}</span>
          <span className="w-14 text-right tabular-nums text-slate-300">{pctText(s.share)}</span>
          <span className="w-20 text-right tabular-nums text-slate-400">{money(s.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Progress toward a dollar goal. */
export function GoalBar({ value, goal }: { value: number; goal: NonNullable<AccountView["goal"]> }) {
  const share = Math.max(0, Math.min(1, value / goal.amount));
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Goal</p>
        <p className="text-sm text-slate-300 tabular-nums">
          {`${money(value)} of ${money(goal.amount)}${goal.date ? ` by ${longDate(goal.date)}` : ""}`}
        </p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${share * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        {value >= goal.amount ? "Goal reached." : `${pctText(share, 0)} there · ${money(goal.amount - value)} to go${goal.note ? ` · ${goal.note}` : ""}`}
      </p>
    </div>
  );
}

/** Every stock in an account (or the whole portfolio). */
export function HoldingsTable({ holdings, total }: { holdings: Holding[]; total: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2.5 font-semibold">Stock</th>
            <th className="px-3 py-2.5 text-right font-semibold">Shares</th>
            <th className="px-3 py-2.5 text-right font-semibold">Price</th>
            <th className="px-3 py-2.5 text-right font-semibold">Value</th>
            <th className="px-3 py-2.5 text-right font-semibold">Share</th>
            <th className="px-3 py-2.5 text-right font-semibold">Day</th>
            <th className="px-3 py-2.5 text-right font-semibold">Month</th>
            <th className="px-4 py-2.5 text-right font-semibold">Gain since bought</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.symbol} className="border-b border-slate-800/60 last:border-0">
              <td className="px-4 py-2 font-bold text-white">{h.symbol}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-300">{shares(h.shares)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-300">{h.price === null ? "—" : money(h.price, true)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-white">{money(h.value)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-400">{pctText(total > 0 ? h.value / total : null)}</td>
              <td className="px-3 py-2 text-right">
                <Move change={h.changes.day} showPct={false} className="text-xs" />
              </td>
              <td className="px-3 py-2 text-right">
                <Move change={h.changes.month} showPct={false} className="text-xs" />
              </td>
              <td className="px-4 py-2 text-right">
                <Gain value={h.cost === null ? null : h.value - h.cost} base={h.cost} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-white">{title}</h2>
        {aside ? <div className="text-xs text-slate-400">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function NoStocksYet() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 px-6 py-16 text-center">
      <p className="text-lg font-semibold text-white">No stock data yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
        Your accounts fill in after the first daily sync, which runs every weekday after the market closes.
      </p>
    </div>
  );
}
