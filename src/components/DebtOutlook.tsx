/**
 * Dashboard debt card: every liability with a rate and a monthly payment gets
 * a real payoff date and its total interest cost — the Grow tab's honest
 * amortization math applied to your actual loans, not hypotheticals. A debt
 * whose payment doesn't cover its own interest is called out for what it is.
 */
import Link from "next/link";
import { addMonths, parseISO, toISO } from "@/lib/engine";
import { amortize } from "@/lib/grow";
import type { LiabilityRow } from "@/lib/rows";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtMonths(m: number): string {
  const y = Math.floor(m / 12);
  const rest = m % 12;
  if (y === 0) return `${m} month${m === 1 ? "" : "s"}`;
  if (rest === 0) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y} yr ${rest} mo`;
}

export function DebtOutlook({
  liabilities,
  todayISO,
}: {
  liabilities: LiabilityRow[];
  todayISO: string;
}) {
  const active = liabilities.filter(
    (l) => !l.is_archived && Number(l.current_balance) > 0,
  );
  if (active.length === 0) return null;

  const totalDebt = active.reduce((s, l) => s + Number(l.current_balance), 0);
  const rows = active.map((l) => {
    const balance = Number(l.current_balance);
    const rate = l.interest_rate !== null ? Number(l.interest_rate) : null;
    const payment = Number(l.minimum_payment);
    if (rate === null || payment <= 0) {
      return { l, balance, kind: "incomplete" as const };
    }
    const am = amortize(balance, rate, payment);
    if (am.neverPaysOff || am.months === null) {
      return { l, balance, kind: "never" as const, payment, rate };
    }
    return {
      l,
      balance,
      kind: "payoff" as const,
      months: am.months,
      payoffISO: toISO(addMonths(parseISO(todayISO), am.months)),
      totalInterest: am.totalInterest,
    };
  });

  const latest = rows
    .filter((r) => r.kind === "payoff")
    .reduce<string | null>(
      (max, r) => (r.kind === "payoff" && (max === null || r.payoffISO > max) ? r.payoffISO : max),
      null,
    );
  const anyNever = rows.some((r) => r.kind === "never");

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-white">Your debt, honestly</h2>
        <span className="text-sm text-slate-400">
          {`${currency.format(totalDebt)} total`}
        </span>
      </div>
      {latest && !anyNever && (
        <p className="mt-1 text-sm text-emerald-300">
          {`At your current payments, debt-free ${latest.slice(0, 7)}.`}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li
            key={r.l.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              r.kind === "never" ? "bg-red-500/10" : "bg-slate-800/60"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-200">
                {r.l.name}{" "}
                <span className="text-slate-400">{`— ${currency.format(r.balance)}`}</span>
              </span>
              {r.kind === "payoff" && (
                <span className="text-xs text-slate-400">
                  {`paid off in ${fmtMonths(r.months)} (${r.payoffISO.slice(0, 7)}) · ${currency.format(r.totalInterest)} in interest to go`}
                </span>
              )}
              {r.kind === "never" && (
                <span className="text-xs font-semibold text-red-300">
                  {`${currency.format(r.payment)}/mo doesn't cover the interest at ${r.rate}% — this balance grows forever at this payment.`}
                </span>
              )}
              {r.kind === "incomplete" && (
                <Link
                  href="/net-worth"
                  className="text-xs text-sky-300 transition hover:text-sky-200"
                >
                  add its rate + monthly payment to see a payoff date →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        {"Same math as the Grow tab. Want to see what an extra $50/month does? "}
        <Link href="/grow" className="text-sky-300 transition hover:text-sky-200">
          Run it in Grow →
        </Link>
      </p>
    </div>
  );
}
