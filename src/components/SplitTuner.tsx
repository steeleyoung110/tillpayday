"use client";

/**
 * Split tuner: sliders over your bucket allocations with the consequences
 * computed live — what each bucket gets per check, what savings keeps, and
 * what that difference compounds to over a year. Commit applies every
 * changed bucket in one undoable action.
 */
import { useMemo, useState, useTransition } from "react";
import { applySplitTune, undoRestore } from "@/app/actions";
import { showToast } from "@/components/InstantAction";
import { splitPaycheck, type Bucket } from "@/lib/engine";
import { CHECKS_PER_YEAR, isPayFrequency } from "@/lib/salary";

const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function SplitTuner({
  buckets,
  typicalPaycheck,
  frequency,
}: {
  buckets: Bucket[];
  typicalPaycheck: number;
  frequency: string;
}) {
  const tunable = buckets.filter((b) => !b.isSavings && !b.isPaused);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(tunable.map((b) => [b.id, b.allocationValue])),
  );
  const [pending, startTransition] = useTransition();
  const checksPerYear = isPayFrequency(frequency) ? CHECKS_PER_YEAR[frequency] : 26;

  const { baseline, tuned } = useMemo(() => {
    const withValues = (vals: Record<string, number> | null): Map<string | null, number> => {
      const bs = vals
        ? buckets.map((b) => (b.id in vals ? { ...b, allocationValue: vals[b.id] } : b))
        : buckets;
      return new Map(splitPaycheck(bs, typicalPaycheck).map((s) => [s.bucketId, s.amount]));
    };
    return { baseline: withValues(null), tuned: withValues(values) };
  }, [buckets, typicalPaycheck, values]);

  const savingsBucket = buckets.find((b) => b.isSavings);
  const savingsKey = savingsBucket?.id ?? null;
  const savingsBase = baseline.get(savingsKey) ?? 0;
  const savingsTuned = tuned.get(savingsKey) ?? 0;
  const savingsDelta = Math.round((savingsTuned - savingsBase) * 100) / 100;
  const yearlyDelta = Math.round(savingsDelta * checksPerYear);
  const changed = tunable.filter((b) => values[b.id] !== b.allocationValue);

  if (tunable.length === 0 || typicalPaycheck <= 0) return null;

  const commit = () =>
    startTransition(async () => {
      const fd = new FormData();
      fd.append(
        "changes",
        JSON.stringify(changed.map((b) => ({ id: b.id, value: values[b.id] }))),
      );
      const recipe = await applySplitTune(fd);
      showToast(
        `Split updated — savings now gets ${cents.format(savingsTuned)}/check.`,
        recipe
          ? () => {
              const f = new FormData();
              f.append("payload", JSON.stringify(recipe));
              void undoRestore(f);
            }
          : undefined,
      );
    });

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-semibold text-white">Tune your split 🎛️</h2>
      <p className="mb-3 mt-1 text-xs text-slate-500">
        Drag and watch the consequences before committing. Every dollar you
        pull from a bucket lands in savings — the leftovers are the point.
      </p>
      <div className="space-y-3">
        {tunable.map((b) => {
          const isFixed = b.allocationType === "fixed";
          const max = isFixed ? Math.max(typicalPaycheck, b.allocationValue) : 100;
          const perCheck = tuned.get(b.id) ?? 0;
          return (
            <div key={b.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-200">{b.name}</span>
                <span className="text-slate-400">
                  {isFixed
                    ? `${cents.format(values[b.id])}/check`
                    : `${values[b.id]}% → ${cents.format(perCheck)}/check`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max={max}
                step={isFixed ? 5 : 1}
                value={values[b.id]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [b.id]: Number(e.target.value) }))
                }
                className="w-full accent-emerald-500"
              />
            </div>
          );
        })}
      </div>

      <div
        className={`mt-3 rounded-xl px-4 py-3 text-sm ${
          savingsDelta > 0
            ? "bg-emerald-500/10 text-emerald-200"
            : savingsDelta < 0
              ? "bg-red-500/10 text-red-200"
              : "bg-slate-800/60 text-slate-300"
        }`}
      >
        {`Savings gets ${cents.format(savingsTuned)}/check (was ${cents.format(savingsBase)})`}
        {savingsDelta !== 0 &&
          ` — that's ${savingsDelta > 0 ? "+" : "−"}${cents.format(Math.abs(yearlyDelta))} a year ${savingsDelta > 0 ? "INTO savings" : "OUT of savings"}.`}
      </div>

      {changed.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={commit}
            disabled={pending}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {pending ? "Applying…" : `Apply ${changed.length} change${changed.length === 1 ? "" : "s"}`}
          </button>
          <button
            onClick={() =>
              setValues(Object.fromEntries(tunable.map((b) => [b.id, b.allocationValue])))
            }
            className="text-sm text-slate-500 transition hover:text-slate-300"
          >
            reset
          </button>
        </div>
      )}
    </div>
  );
}
