"use client";

/**
 * "Can I afford it?" — type a price, get the straight answer. All the inputs
 * are computed server-side by the dashboard (flexible balance, savings, the
 * danger-day low); this widget just runs the verdict math live as you type.
 */
import { useState } from "react";
import { canIAfford } from "@/lib/afford";

const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function AffordCheck({
  flexibleBalance,
  daysUntilPayday,
  nextPayday,
  savingsBalance,
  dangerLow,
  dangerDate,
  hourlyWage,
}: {
  flexibleBalance: number;
  daysUntilPayday: number;
  nextPayday: string;
  savingsBalance: number;
  dangerLow: number | null;
  dangerDate: string | null;
  hourlyWage: number | null;
}) {
  const [price, setPrice] = useState("");
  const value = Number(price) || 0;
  const verdict = canIAfford({
    price: value,
    flexibleBalance,
    daysUntilPayday,
    savingsBalance,
    dangerLow,
    dangerDate,
  });

  const hours = hourlyWage && value > 0 ? (value / hourlyWage).toFixed(1) : null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold text-white">Can I afford…</p>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="$ 0.00"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-400"
        />
        {hours && (
          <span className="text-xs text-slate-500">{`≈ ${hours}h of work`}</span>
        )}
      </div>

      {verdict && (
        <div
          className={`mt-3 rounded-xl border px-4 py-3 ${
            verdict.answer === "yes"
              ? "border-emerald-500/40 bg-emerald-500/10"
              : verdict.answer === "tight"
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-red-500/40 bg-red-500/10"
          }`}
        >
          {verdict.answer === "yes" && (
            <>
              <p className="font-bold text-emerald-300">Yes.</p>
              <p className="mt-1 text-sm text-emerald-100/80">
                {`It fits your flexible money — ${cents.format(verdict.remainingFlexible)} left after it, ${cents.format(verdict.newPerDay)}/day until payday (${nextPayday}).`}
                {verdict.dangerAfter !== null &&
                  dangerDate &&
                  ` Your tightest day (${dangerDate}) still clears with ${cents.format(verdict.dangerAfter)}.`}
              </p>
            </>
          )}
          {verdict.answer === "tight" && (
            <>
              <p className="font-bold text-amber-300">Yes, but.</p>
              <p className="mt-1 text-sm text-amber-100/80">
                {`It empties your flexible money and pulls ${cents.format(verdict.savingsDip)} out of savings. Nothing left for fun until payday (${nextPayday}) — your call whether it's worth that.`}
              </p>
            </>
          )}
          {verdict.answer === "no" && (
            <>
              <p className="font-bold text-red-300">No.</p>
              <p className="mt-1 text-sm text-red-100/80">
                {verdict.breaksDangerDay && dangerDate
                  ? `It fits today, but on ${dangerDate} your total would go ${cents.format(Math.abs(verdict.dangerAfter ?? 0))} negative when your bills land. You'd be spending money a bill already owns.`
                  : `You're ${cents.format(verdict.shortBy)} short even after draining flexible money and savings. This one is a "not yet."`}
              </p>
            </>
          )}
        </div>
      )}

      {!verdict && (
        <p className="mt-2 text-xs text-slate-500">
          The honest version of &ldquo;treat yourself&rdquo; — checked against
          your flexible money, savings, and the bills already scheduled before
          payday.
        </p>
      )}
    </div>
  );
}
