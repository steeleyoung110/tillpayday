"use client";

/**
 * Hand-entered parts of the Stocks tab: ESPP purchases and sales, and
 * account goals. (Usually Claude records ESPP buys and sells when told.)
 */
import { useRef, useState, useTransition } from "react";
import { showToast } from "@/components/InstantAction";
import { addStockLot, deleteStockLot, setStockGoal, updateStockLot, type ActionResult } from "@/app/stocksActions";
import type { LotView } from "@/lib/stocks/view";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-white outline-none focus:border-emerald-400";
const labelCls = "block text-xs font-semibold text-slate-400";
const buttonCls =
  "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50";
const quietCls =
  "rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 disabled:opacity-50";

function ActionForm({
  action,
  done,
  reset = false,
  className = "",
  children,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  done: string;
  reset?: boolean;
  className?: string;
  children: (pending: boolean) => React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await action(fd);
          if (!r.ok) {
            setError(r.error ?? "That didn't save.");
            return;
          }
          setError(null);
          if (reset) ref.current?.reset();
          showToast(done);
        });
      }}
    >
      {children(pending)}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function LotFields({ lot }: { lot?: LotView }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <label>
        <span className={labelCls}>Purchase date</span>
        <input type="date" name="purchase_date" min="2000-01-01" max="2100-12-31" defaultValue={lot?.purchaseDate ?? ""} className={inputCls} />
      </label>
      <label>
        <span className={labelCls}>Shares</span>
        <input name="shares" inputMode="decimal" required defaultValue={lot ? String(lot.shares) : ""} placeholder="e.g. 31.25" className={inputCls} />
      </label>
      <label>
        <span className={labelCls}>Price you paid</span>
        <input name="purchase_price" inputMode="decimal" defaultValue={lot?.purchasePrice ?? ""} placeholder="$ per share" className={inputCls} />
      </label>
      <label>
        <span className={labelCls}>Market price that day</span>
        <input name="market_price" inputMode="decimal" defaultValue={lot?.marketPrice ?? ""} placeholder="$ (optional)" className={inputCls} />
      </label>
      <label className="col-span-2 sm:col-span-1">
        <span className={labelCls}>Note</span>
        <input name="note" maxLength={200} defaultValue={lot?.note ?? ""} placeholder="optional" className={inputCls} />
      </label>
    </div>
  );
}

/** Add an ESPP purchase (Fidelity → Stock Plans → purchase history). */
export function AddLotForm({ account, symbol = "CPRT" }: { account: string; symbol?: string }) {
  return (
    <ActionForm action={addStockLot} done="Purchase added 👍" reset className="space-y-3">
      {(pending) => (
        <>
          <input type="hidden" name="account" value={account} />
          <input type="hidden" name="symbol" value={symbol} />
          <LotFields />
          <button type="submit" disabled={pending} className={buttonCls}>
            {pending ? "Saving…" : "Add purchase"}
          </button>
        </>
      )}
    </ActionForm>
  );
}

/** Edit or remove one purchase. */
export function LotEditor({ lot }: { lot: LotView }) {
  const [pending, start] = useTransition();
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-semibold text-emerald-300 hover:underline">Edit</summary>
      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <ActionForm action={updateStockLot} done="Purchase updated 👍" className="space-y-3">
          {(saving) => (
            <>
              <input type="hidden" name="id" value={lot.id} />
              <LotFields lot={lot} />
              <div className="grid grid-cols-2 gap-3 sm:w-2/5">
                <label>
                  <span className={labelCls}>Sold on (if sold)</span>
                  <input type="date" name="sale_date" min="2000-01-01" max="2100-12-31" defaultValue={lot.saleDate ?? ""} className={inputCls} />
                </label>
                <label>
                  <span className={labelCls}>Sale price</span>
                  <input name="sale_price" inputMode="decimal" defaultValue={lot.salePrice ?? ""} placeholder="$ per share" className={inputCls} />
                </label>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className={buttonCls}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={quietCls}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteStockLot(lot.id);
                      showToast(r.ok ? "Purchase removed" : (r.error ?? "That didn't save."));
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </>
          )}
        </ActionForm>
      </div>
    </details>
  );
}

/** Set or change an account's dollar goal. */
export function GoalForm({ account, amount, date }: { account: string; amount: number | null; date: string | null }) {
  return (
    <details>
      <summary className="cursor-pointer list-none text-xs font-semibold text-emerald-300 hover:underline">
        {amount ? "Change goal" : "Set a goal"}
      </summary>
      <ActionForm action={setStockGoal} done="Goal saved 👍" className="mt-3 flex flex-wrap items-end gap-3">
        {(pending) => (
          <>
            <input type="hidden" name="account" value={account} />
            <label>
              <span className={labelCls}>Goal amount</span>
              <input name="goal_amount" inputMode="decimal" defaultValue={amount ?? ""} placeholder="$" className={`${inputCls} w-32`} />
            </label>
            <label>
              <span className={labelCls}>By (optional)</span>
              <input type="date" name="goal_date" min="2000-01-01" max="2100-12-31" defaultValue={date ?? ""} className={inputCls} />
            </label>
            <button type="submit" disabled={pending} className={buttonCls}>
              {pending ? "Saving…" : "Save goal"}
            </button>
          </>
        )}
      </ActionForm>
    </details>
  );
}
