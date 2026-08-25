"use client";

/**
 * Refinance what-if: same balance, same payment, different rate. Prefills
 * from real liabilities when they exist. No products, no affiliate links —
 * just the arithmetic a loan officer hopes you won't do.
 */
import { useState } from "react";
import { refinanceCompare } from "@/lib/grow";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";

export interface RefiPrefill {
  name: string;
  balance: number;
  rate: number | null;
  payment: number;
}

function fmtMonths(m: number): string {
  const y = Math.floor(m / 12);
  const rest = m % 12;
  if (y === 0) return `${m} mo`;
  if (rest === 0) return `${y} yr`;
  return `${y} yr ${rest} mo`;
}

export function RefinanceSim({ prefills }: { prefills: RefiPrefill[] }) {
  const [balance, setBalance] = useState("10000");
  const [oldRate, setOldRate] = useState("24");
  const [newRate, setNewRate] = useState("12");
  const [payment, setPayment] = useState("300");

  const result = refinanceCompare(
    Number(balance),
    Number(oldRate),
    Number(newRate),
    Number(payment),
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-semibold text-white">What would a better rate do? 🔁</h2>
      <p className="mb-3 mt-1 text-xs text-slate-400">
        The refinance math, straight: same balance, same monthly payment, a
        different rate. (Balance transfers and refis have fees — ask about
        them before believing any offer.)
      </p>

      {prefills.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {prefills.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setBalance(String(p.balance));
                if (p.rate !== null) setOldRate(String(p.rate));
                if (p.payment > 0) setPayment(String(p.payment));
              }}
              className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-emerald-400"
            >
              {`${p.name} · ${currency.format(p.balance)}${p.rate !== null ? ` @ ${p.rate}%` : ""}`}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs text-slate-400">
          Balance
          <input type="number" min="0" step="100" value={balance} onChange={(e) => setBalance(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs text-slate-400">
          Current rate %
          <input type="number" min="0" step="0.1" value={oldRate} onChange={(e) => setOldRate(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs text-slate-400">
          New rate %
          <input type="number" min="0" step="0.1" value={newRate} onChange={(e) => setNewRate(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs text-slate-400">
          Payment /mo
          <input type="number" min="0" step="10" value={payment} onChange={(e) => setPayment(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </div>

      {result && (
        <div className="mt-3 rounded-xl bg-slate-800/60 p-4 text-sm">
          {result.newNeverPaysOff ? (
            <p className="font-semibold text-red-300">
              {`At ${newRate}%, ${currency.format(Number(payment))}/mo doesn't cover the interest — that "offer" never pays off.`}
            </p>
          ) : result.oldNeverPaysOff ? (
            <p className="font-semibold text-emerald-300">
              {`Right now this balance never pays off at ${currency.format(Number(payment))}/mo — at ${newRate}% it actually dies${result.newMonths !== null ? ` in ${fmtMonths(result.newMonths)}` : ""}, with ${currency.format(result.newInterest)} total interest.`}
            </p>
          ) : (
            <>
              <p className={result.saved >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>
                {result.saved >= 0
                  ? `The ${newRate}% rate saves ${currency.format(result.saved)} in interest${result.monthsSooner && result.monthsSooner > 0 ? ` and you're done ${fmtMonths(result.monthsSooner)} sooner` : ""}.`
                  : `The ${newRate}% rate costs ${currency.format(Math.abs(result.saved))} MORE in interest. Walk away.`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {`${oldRate}%: ${currency.format(result.oldInterest)} interest${result.oldMonths !== null ? `, paid off in ${fmtMonths(result.oldMonths)}` : ""} · ${newRate}%: ${currency.format(result.newInterest)}${result.newMonths !== null ? `, ${fmtMonths(result.newMonths)}` : ""}`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
