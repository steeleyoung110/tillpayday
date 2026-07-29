"use client";

/**
 * Bank reconciliation: type the balance your BANK shows, see the drift
 * against what Till Payday's model believes, and book the correction as an
 * honest adjustment (unlogged spending or unlogged income). Every budget
 * model drifts; the ritual is what keeps the numbers worth obeying.
 */
import { useState, useTransition } from "react";
import { reconcile, undoRestore } from "@/app/actions";
import { showToast } from "@/components/InstantAction";

const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function ReconcileCard({ modelBalance }: { modelBalance: number }) {
  const [bank, setBank] = useState("");
  const [pending, startTransition] = useTransition();
  const value = Number(bank);
  const drift =
    bank !== "" && Number.isFinite(value)
      ? Math.round((value - modelBalance) * 100) / 100
      : null;

  const book = () => {
    if (drift === null || Math.abs(drift) < 0.01) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("bank_balance", bank);
      fd.append("model_balance", String(modelBalance));
      const res = await reconcile(fd);
      if (res.ok) {
        const recipe = res.recipe;
        showToast(
          res.drift! < 0
            ? `Booked ${cents.format(Math.abs(res.drift!))} of unlogged spending — the model matches your bank again.`
            : `Booked ${cents.format(res.drift!)} of unlogged income — the model matches your bank again.`,
          recipe
            ? () => {
                const f = new FormData();
                f.append("payload", JSON.stringify(recipe));
                void undoRestore(f);
              }
            : undefined,
        );
        setBank("");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold text-white">Reality check 🏦</p>
        <span className="text-sm text-slate-400">
          {`Till Payday thinks you have ${cents.format(modelBalance)}. My bank says…`}
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder="$ 0.00"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-400"
        />
      </div>

      {drift !== null && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-800/60 px-4 py-3 text-sm">
          {Math.abs(drift) < 0.01 ? (
            <p className="font-semibold text-emerald-300">
              Dead on. Your logging is airtight — that&apos;s rarer than you&apos;d think.
            </p>
          ) : drift < 0 ? (
            <p className="text-amber-200">
              {`Your bank is ${cents.format(Math.abs(drift))} BELOW the model — some spending never got logged. Book it as an adjustment and the numbers are honest again.`}
            </p>
          ) : (
            <p className="text-emerald-200">
              {`Your bank is ${cents.format(drift)} ABOVE the model — money arrived that never got logged. Book it and take the win.`}
            </p>
          )}
          {Math.abs(drift) >= 0.01 && (
            <button
              onClick={book}
              disabled={pending}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {pending ? "Booking…" : "Book the adjustment"}
            </button>
          )}
        </div>
      )}
      {drift === null && (
        <p className="mt-2 text-xs text-slate-500">
          Do this every week or two. A model that drifts from your bank is a
          model you&apos;ll stop trusting — and the trust is the whole product.
        </p>
      )}
    </div>
  );
}
