"use client";

/**
 * The income shock's optimistic twin: what a raise actually does. Runs your
 * real bucket split on the bigger check — so it's honest about where the
 * extra money would go under your CURRENT plan, not where you hope it goes.
 */
import { useState } from "react";
import { splitPaycheck, type Bucket } from "@/lib/engine";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const CHECKS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export function RaiseSim({
  buckets,
  typicalPaycheck,
  frequency,
}: {
  buckets: Bucket[];
  typicalPaycheck: number;
  frequency: string;
}) {
  const [raise, setRaise] = useState(50);
  if (typicalPaycheck <= 0) return null;

  const perYear = CHECKS_PER_YEAR[frequency] ?? 26;
  const before = splitPaycheck(buckets, typicalPaycheck);
  const after = splitPaycheck(buckets, typicalPaycheck + raise);
  const beforeBy = new Map(before.map((s) => [s.bucketId, s.amount]));
  const deltas = after
    .map((s) => ({
      name: s.name,
      delta: Math.round((s.amount - (beforeBy.get(s.bucketId) ?? 0)) * 100) / 100,
    }))
    .filter((d) => d.delta > 0.009);
  const savingsSlice = after[after.length - 1];
  const savingsDelta =
    Math.round(((savingsSlice?.amount ?? 0) - (beforeBy.get(savingsSlice?.bucketId ?? null) ?? 0)) * 100) / 100;
  const pctToSavings = raise > 0 ? Math.round((savingsDelta / raise) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-semibold text-white">What would a raise do? 📈</h2>
      <p className="mt-1 text-xs text-slate-500">
        Your real split, run on a bigger check — where the extra money goes
        under the plan you have today.
      </p>
      <label className="mt-3 block text-xs text-slate-400">
        {`Raise: +${currency.format(raise)} per check (+${((raise / typicalPaycheck) * 100).toFixed(1)}%)`}
        <input
          type="range"
          min="10"
          max="500"
          step="10"
          value={raise}
          onChange={(e) => setRaise(Number(e.target.value))}
          className="mt-1 w-full accent-emerald-500"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {deltas.map((d) => (
          <span
            key={d.name}
            className="rounded-lg bg-slate-800/70 px-2.5 py-1 text-xs text-slate-200"
          >
            {`${d.name} +${currency.format(d.delta)}`}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-300">
        {`That's ${currency.format(raise * perYear)} more per year. Under your current split, ${pctToSavings}% of every raise dollar lands in savings — the rest gets spent by default. If that number bothers you, the fix is the split, not the salary.`}
      </p>
    </div>
  );
}
