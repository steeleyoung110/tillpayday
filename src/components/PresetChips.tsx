"use client";

/**
 * Quick-spend presets: your usual purchases as one-tap chips. Tap = logged
 * (round-up rule applies automatically via the shared action path). Manage
 * inline — no settings safari required.
 */
import { useState, useTransition } from "react";
import { addExpense, removeSpendPreset, saveSpendPreset } from "@/app/actions";
import { showToast } from "@/components/InstantAction";

const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export interface SpendPreset {
  name: string;
  amount: number;
}

export function PresetChips({
  presets,
  funBucketId,
  todayISO,
}: {
  presets: SpendPreset[];
  funBucketId: string;
  todayISO: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const log = (p: SpendPreset) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.append("name", p.name);
      fd.append("amount", String(p.amount));
      fd.append("cadence", "one_time");
      fd.append("due_date", todayISO);
      fd.append("bucket_id", funBucketId);
      await addExpense(fd);
      showToast(`Logged ${p.name} — ${cents.format(p.amount)}.`);
    });

  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <span key={p.name} className="inline-flex items-center">
            <button
              onClick={() => log(p)}
              disabled={pending}
              className="rounded-l-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {`${p.name} ${cents.format(p.amount)}`}
            </button>
            {editing ? (
              <button
                onClick={() =>
                  startTransition(async () => {
                    const fd = new FormData();
                    fd.append("name", p.name);
                    await removeSpendPreset(fd);
                  })
                }
                className="rounded-r-lg border border-l-0 border-red-500/40 bg-red-500/10 px-1.5 py-1 text-xs text-red-300"
                title="Remove this preset"
              >
                ×
              </button>
            ) : (
              <span className="rounded-r-lg border border-l-0 border-emerald-500/40 px-1 py-1 text-xs text-emerald-500/50">
                ⚡
              </span>
            )}
          </span>
        ))}
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-slate-400 transition hover:text-slate-300"
        >
          {editing ? "done" : presets.length > 0 ? "edit presets" : "add one-tap presets →"}
        </button>
      </div>

      {editing && presets.length < 6 && (
        <form
          action={(fd) => {
            startTransition(async () => {
              await saveSpendPreset(fd);
            });
          }}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <input
            name="name"
            required
            placeholder="Coffee"
            className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white outline-none focus:border-emerald-400"
          />
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="$"
            className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white outline-none focus:border-emerald-400"
          />
          <button className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30">
            save preset
          </button>
        </form>
      )}
    </div>
  );
}
