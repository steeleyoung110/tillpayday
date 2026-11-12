"use client";

/**
 * Hand-entered parts of the Stocks tab: ESPP purchases, account goals and
 * importing past dividends from a Robinhood activity report. The CSV is read
 * in the browser; only the dividend rows are sent to the server.
 */
import { useRef, useState, useTransition } from "react";
import { showToast } from "@/components/InstantAction";
import {
  addStockLot,
  clearImportedDividends,
  deleteStockLot,
  importDividends,
  setStockGoal,
  updateStockLot,
  type ActionResult,
} from "@/app/stocksActions";
import { parseRobinhoodDividends, type CsvDividend, type LotView } from "@/lib/stocks/view";

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
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" name="sold" defaultChecked={lot.sold} className="h-4 w-4 accent-emerald-500" />
                Sold (stop counting these shares)
              </label>
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

/**
 * Past dividends from Robinhood: Account → Reports and statements →
 * Reports → generate an account activity report, then pick the CSV here.
 */
export function DividendCsvImport({ accounts }: { accounts: { key: string; name: string }[] }) {
  const [account, setAccount] = useState(accounts[0]?.key ?? "");
  const [rows, setRows] = useState<CsvDividend[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = rows?.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className={labelCls}>Account</span>
          <select value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls}>
            {accounts.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1">
          <span className={labelCls}>Robinhood activity report (.csv)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const parsed = parseRobinhoodDividends(await file.text());
              setFileName(file.name);
              setRows(parsed.rows.length ? parsed.rows : null);
              setError(parsed.error);
            }}
          />
        </label>
      </div>
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
      {rows ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
          <span>
            {`${fileName}: ${rows.length} dividend payments, $${total.toFixed(2)} total, ${rows[0].payDate} to ${rows[rows.length - 1].payDate}.`}
          </span>
          <button
            type="button"
            disabled={pending || !account}
            className={buttonCls}
            onClick={() =>
              start(async () => {
                const r = await importDividends(account, rows);
                if (!r.ok) {
                  setError(r.error ?? "That didn't save.");
                  return;
                }
                showToast(`Saved ${r.saved} payouts 👍`);
                setRows(null);
                setFileName(null);
              })
            }
          >
            {pending ? "Saving…" : "Save to history"}
          </button>
        </div>
      ) : null}
      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer font-semibold text-slate-300">Imported the wrong file?</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span>{"Remove everything imported for this account (the daily sync's own entries stay):"}</span>
          <button
            type="button"
            disabled={pending || !account}
            className={quietCls}
            onClick={() =>
              start(async () => {
                const r = await clearImportedDividends(account);
                showToast(r.ok ? "Imported payouts removed" : (r.error ?? "That didn't save."));
              })
            }
          >
            Remove imported payouts
          </button>
        </div>
      </details>
    </div>
  );
}
