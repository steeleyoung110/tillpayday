"use client";

/**
 * Snowball vs avalanche on your real debts, side by side, with an extra-
 * payment slider. Honest verdict: what the feel-good order actually costs.
 * Needs each debt to have a rate and a monthly payment (set in Net Worth).
 */
import { useState } from "react";
import { compareStrategies, type PlanDebt } from "@/lib/debtPlan";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtMonths(m: number): string {
  const y = Math.floor(m / 12);
  const rest = m % 12;
  if (y === 0) return `${m} mo`;
  if (rest === 0) return `${y} yr`;
  return `${y} yr ${rest} mo`;
}

export function DebtStrategy({ debts }: { debts: PlanDebt[] }) {
  const [extra, setExtra] = useState(100);
  if (debts.length < 2) return null; // one debt has no ordering question

  const cmp = compareStrategies(debts, extra);
  const anyNever = cmp.snowball.neverPaysOff || cmp.avalanche.neverPaysOff;

  const column = (
    title: string,
    subtitle: string,
    r: typeof cmp.snowball,
    highlight: boolean,
  ) => (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-700 bg-slate-800/40"
      }`}
    >
      <p className="font-semibold text-white">{title}</p>
      <p className="text-xs text-slate-500">{subtitle}</p>
      {r.neverPaysOff ? (
        <p className="mt-3 text-sm font-semibold text-red-300">
          Never pays off at this budget — the interest outruns the payments.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-300">
            {`Debt-free in ${fmtMonths(r.months!)} · ${currency.format(r.totalInterest)} interest`}
          </p>
          <ol className="mt-2 space-y-1 text-xs text-slate-400">
            {r.order.map((o, i) => (
              <li key={o.id}>
                {`${i + 1}. ${o.name} — gone in ${fmtMonths(o.month)}`}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-semibold text-white">Snowball vs avalanche</h2>
      <p className="mt-1 text-xs text-slate-500">
        Same money every month — minimums plus your extra, rolling into the
        next debt as each one dies. The only difference is the order.
      </p>
      <label className="mt-3 block text-xs text-slate-400">
        {`Extra toward debt: +${currency.format(extra)}/month`}
        <input
          type="range"
          min="0"
          max="1000"
          step="25"
          value={extra}
          onChange={(e) => setExtra(Number(e.target.value))}
          className="mt-1 w-full accent-emerald-500"
        />
      </label>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {column(
          "Snowball",
          "smallest balance first — quick wins",
          cmp.snowball,
          !anyNever && cmp.snowballCosts < 1,
        )}
        {column(
          "Avalanche",
          "highest rate first — cheapest math",
          cmp.avalanche,
          !anyNever && cmp.snowballCosts >= 1,
        )}
      </div>
      {!anyNever && (
        <p className="mt-3 text-sm text-slate-300">
          {cmp.snowballCosts >= 1
            ? `The feel-good snowball order costs you ${currency.format(cmp.snowballCosts)} in extra interest${
                cmp.snowballExtraMonths > 0
                  ? ` and ${fmtMonths(cmp.snowballExtraMonths)} more in debt`
                  : ""
              } here. If quick wins are what keeps you paying, that's the honest price of the motivation — just know you're paying it.`
            : "At your balances and rates the two orders cost about the same — pick whichever keeps you motivated and don't look back."}
        </p>
      )}
    </div>
  );
}
