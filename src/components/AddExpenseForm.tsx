"use client";

/**
 * Add-a-bill form with the overdraft moment: if the bill is bigger than
 * what's sitting in its bucket, you don't get to look away — a popup makes
 * you choose which pot the money really comes from. Buckets can never go
 * red: the engine empties the bill's bucket, then raids the others (fun
 * money first), and only savings absorbs a negative — after everything
 * else is at zero. This popup shows you that chain before you commit.
 */
import { useState, useTransition } from "react";
import { addExpense } from "@/app/actions";
import { showToast } from "@/components/InstantAction";

const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export interface BucketOption {
  /** "" = savings / leftover. */
  id: string;
  name: string;
  /** Current balance today (undefined = unknown, no gate). */
  balance?: number;
}

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";
const btnCls =
  "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

export function AddExpenseForm({
  options,
  todayISO,
}: {
  options: BucketOption[];
  todayISO: string;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [dueDate, setDueDate] = useState(todayISO);
  const [bucketId, setBucketId] = useState("");
  const [decideOpen, setDecideOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const value = Number(amount) || 0;
  const chosen = options.find((o) => o.id === bucketId);

  const submit = (finalBucketId: string) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("amount", amount);
      fd.append("cadence", cadence);
      fd.append("due_date", dueDate);
      fd.append("bucket_id", finalBucketId);
      await addExpense(fd);
      const finalName =
        options.find((o) => o.id === finalBucketId)?.name ?? "Savings / leftover";
      showToast(`Added ${name} — comes out of ${finalName}.`);
      setName("");
      setAmount("");
      setDecideOpen(false);
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(value > 0) || !name || !dueDate) return;
    // The gate: only bills due THIS cycle drain today's balances; future
    // cycles get refilled first. Unknown balances pass through ungated.
    const bal = chosen?.balance;
    if (typeof bal === "number" && value > bal) {
      setDecideOpen(true);
    } else {
      submit(bucketId);
    }
  };

  return (
    <>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-2 sm:max-w-md">
        <input
          placeholder="Expense (e.g. Rent)"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputCls} col-span-2`}
        />
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="Amount"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputCls}
        />
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          className={inputCls}
        >
          <option value="one_time">Just once</option>
          <option value="monthly">Every month</option>
          <option value="quarterly">Every 3 months</option>
          <option value="yearly">Once a year</option>
        </select>
        <label className="text-xs text-slate-400">
          First due date
          <input
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="text-xs text-slate-400">
          Comes out of
          <select
            value={bucketId}
            onChange={(e) => setBucketId(e.target.value)}
            className={`${inputCls} mt-1`}
          >
            {options.map((o) => (
              <option key={o.id || "savings"} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={pending} className={`${btnCls} col-span-2`}>
          Add expense
        </button>
      </form>

      {decideOpen && chosen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-500/40 bg-slate-900 p-7 shadow-2xl">
            <h2 className="text-xl font-black text-white">
              {`${chosen.name} doesn't have that much`}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {`This ${cents.format(value)} bill is more than the ${cents.format(chosen.balance ?? 0)} sitting in ${chosen.name} right now. The money has to come from somewhere — pick what you're giving up:`}
            </p>
            <ul className="mt-4 space-y-2">
              {options
                .filter((o) => o.id !== bucketId && typeof o.balance === "number")
                .sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))
                .map((o) => (
                  <li key={o.id || "savings"}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => submit(o.id)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-sm transition hover:border-amber-400/60"
                    >
                      <span className="text-slate-200">{`Take it from ${o.name}`}</span>
                      <span
                        className={
                          (o.balance ?? 0) >= value
                            ? "text-slate-400"
                            : "text-red-300"
                        }
                      >
                        {`${cents.format(o.balance ?? 0)} → ${cents.format((o.balance ?? 0) - value)}`}
                      </span>
                    </button>
                  </li>
                ))}
              <li>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit(bucketId)}
                  className="w-full rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-left text-sm text-red-200 transition hover:border-red-400"
                >
                  <span className="font-semibold">
                    {bucketId === ""
                      ? `Add it anyway — your other buckets empty first, then savings goes red`
                      : `Add it anyway — ${chosen.name} empties to $0 and the missing ${cents.format(value - (chosen.balance ?? 0))} raids your other buckets, fun money first`}
                  </span>
                  <span className="mt-0.5 block text-xs text-red-200/70">
                    Buckets never go negative here. Savings takes the final
                    hit — and only after everything else is drained to zero.
                  </span>
                </button>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setDecideOpen(false)}
              className="mt-4 w-full text-sm text-slate-500 transition hover:text-slate-300"
            >
              Never mind — rethink this bill
            </button>
          </div>
        </div>
      )}
    </>
  );
}
