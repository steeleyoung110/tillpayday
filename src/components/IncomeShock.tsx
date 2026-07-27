"use client";

/**
 * "What if my income changed?" — the what-if panel's missing half. Model a
 * stopped or cut paycheck for N weeks and see exactly when savings hits $0.
 * Instant client-side math on the same engine the dashboard runs.
 */
import { useState } from "react";
import {
  addDays,
  parseISO,
  runProjection,
  toISO,
  type Bucket,
  type Expense,
  type IncomeEntry,
  type IncomeSource,
  type Transfer,
} from "@/lib/engine";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const SCENARIOS = [
  { label: "Paycheck stops", factor: 0 },
  { label: "Cut in half", factor: 0.5 },
  { label: "20% cut", factor: 0.8 },
] as const;

export function IncomeShock({
  income,
  buckets,
  expenses,
  incomeEntries,
  transfers,
  startingSavings,
  savingsBucketId,
  todayISO,
}: {
  income: IncomeSource[];
  buckets: Bucket[];
  expenses: Expense[];
  incomeEntries: IncomeEntry[];
  transfers: Transfer[];
  /** Savings balance today — the cushion the shock eats into. */
  startingSavings: number;
  savingsBucketId: string | null;
  todayISO: string;
}) {
  const [factor, setFactor] = useState<number>(0);
  const [weeks, setWeeks] = useState(8);

  if (income.filter((s) => s.kind === "paycheck").length === 0) return null;

  const endISO = toISO(addDays(parseISO(todayISO), weeks * 7));
  const base = {
    startDate: todayISO,
    months: 12,
    startingBalances: savingsBucketId
      ? { [savingsBucketId]: startingSavings }
      : undefined,
    incomeSources: income,
    buckets,
    expenses,
    incomeEntries,
    transfers,
  };
  const baseline = runProjection(base);
  const shocked = runProjection({
    ...base,
    incomeShock: { startDate: todayISO, endDate: endISO, factor },
  });

  const broke = shocked.points.find((p) => p.savings < 0);
  const minSavings = Math.min(...shocked.points.map((p) => p.savings));
  const endingGap = Math.round(baseline.endingTotal - shocked.endingTotal);
  const daysToBroke = broke
    ? Math.round(
        (parseISO(broke.date).getTime() - parseISO(todayISO).getTime()) / 86400000,
      )
    : null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
      <h2 className="font-semibold text-white">What if my income changed?</h2>
      <p className="mt-1 text-xs text-slate-500">
        The other half of what-if: not a purchase, a paycheck. Same engine,
        same honest math.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div className="flex rounded-xl border border-slate-700 p-1">
          {SCENARIOS.map((s) => (
            <button
              key={s.label}
              onClick={() => setFactor(s.factor)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                factor === s.factor
                  ? "bg-amber-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="text-xs text-slate-400">
          {`For ${weeks} week${weeks === 1 ? "" : "s"}, starting today`}
          <input
            type="range"
            min="2"
            max="26"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="mt-1 block w-56 accent-amber-500"
          />
        </label>
      </div>

      <div
        className={`mt-4 rounded-xl border p-4 text-sm ${
          broke
            ? "border-red-500/40 bg-red-500/10 text-red-100"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
        }`}
      >
        {broke ? (
          <>
            <p className="font-semibold">
              {`Savings hits $0 on ${broke.date} — ${daysToBroke} days in.`}
            </p>
            <p className="mt-1 opacity-90">
              {`From that day every bill lands on money you don't have. Bottom of the hole: ${currency.format(minSavings)}. A year out you'd be ${currency.format(endingGap)} behind where you're headed now.`}
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">
              {`You'd survive it — savings stays above $0 the whole way through.`}
            </p>
            <p className="mt-1 opacity-90">
              {`Lowest point: ${currency.format(minSavings)}. The setback still costs ${currency.format(endingGap)} a year out — surviving isn't free, it's just not fatal.`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
