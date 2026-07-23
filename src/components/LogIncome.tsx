"use client";

/**
 * Log money as it arrives (8F). Ordinary amounts save quietly. Anything above
 * the typical paycheck gets the windfall moment: a celebratory full-screen
 * "Where should this go?" with a suggested split — 50% savings, 30% toward
 * flagged shortfalls, 20% fun — adjustable with sliders before applying.
 * A win, not a form.
 */
import { useMemo, useState, useTransition } from "react";
import { logIncome } from "@/app/actions";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export interface ShortfallTarget {
  bucketId: string;
  bucketName: string;
  amount: number;
}

interface Split {
  savings: number;
  fixes: number;
  fun: number;
}

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";

function floorCent(n: number): number {
  return Math.floor((n + Number.EPSILON) * 100) / 100;
}

export function LogIncome({
  typicalPaycheck,
  shortfalls,
  funBucket,
  todayISO,
}: {
  /** Largest regular paycheck (or the irregular baseline). 0 = unknown. */
  typicalPaycheck: number;
  /** Buckets currently flagged short, with how short they are. */
  shortfalls: ShortfallTarget[];
  /** First flexible bucket — the "fun money" target — if any. */
  funBucket: { id: string; name: string } | null;
  todayISO: string;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO);
  const [note, setNote] = useState("");
  const [windfallOpen, setWindfallOpen] = useState(false);
  const [weights, setWeights] = useState<Split>({ savings: 50, fixes: 30, fun: 20 });
  const [pending, startTransition] = useTransition();

  const value = Number(amount) || 0;
  const hasFixes = shortfalls.length > 0;
  const hasFun = funBucket !== null;

  // Absent targets fold into savings, per the suggested-split spirit.
  const effective = useMemo(() => {
    const w = { ...weights };
    if (!hasFixes) {
      w.savings += w.fixes;
      w.fixes = 0;
    }
    if (!hasFun) {
      w.savings += w.fun;
      w.fun = 0;
    }
    const sum = w.savings + w.fixes + w.fun || 1;
    return {
      savings: floorCent((value * w.savings) / sum),
      fixes: floorCent((value * w.fixes) / sum),
      fun: floorCent((value * w.fun) / sum),
    };
  }, [weights, value, hasFixes, hasFun]);

  const submit = (asWindfall: boolean) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("amount", amount);
      fd.append("received_date", date);
      fd.append("note", note);
      fd.append("is_windfall", String(asWindfall));
      if (asWindfall) {
        const allocation: { bucket_id: string | null; amount: number }[] = [];
        if (effective.savings > 0)
          allocation.push({ bucket_id: null, amount: effective.savings });
        if (effective.fixes > 0 && hasFixes) {
          // Weight the fixes portion by how short each bucket is.
          const totalShort = shortfalls.reduce((s, x) => s + x.amount, 0) || 1;
          for (const s of shortfalls) {
            const part = floorCent((effective.fixes * s.amount) / totalShort);
            if (part > 0) allocation.push({ bucket_id: s.bucketId, amount: part });
          }
        }
        if (effective.fun > 0 && funBucket)
          allocation.push({ bucket_id: funBucket.id, amount: effective.fun });
        fd.append("allocation", JSON.stringify(allocation));
      }
      await logIncome(fd);
      setAmount("");
      setNote("");
      setWindfallOpen(false);
    });
  };

  const slider = (
    key: keyof Split,
    label: string,
    dollars: number,
    accent: string,
    sub?: string,
  ) => (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        <span className={`text-lg font-bold ${accent}`}>{cents.format(dollars)}</span>
      </div>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
      <input
        type="range"
        min="0"
        max="100"
        value={weights[key]}
        onChange={(e) =>
          setWeights({ ...weights, [key]: Number(e.target.value) })
        }
        className="mt-1 w-full accent-emerald-500"
      />
    </div>
  );

  return (
    <>
      <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3">
        <p className="text-xs font-semibold text-slate-300">
          💵 Money landed? Log it
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
          />
          <input
            type="date"
            value={date}
            max={todayISO}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
          <input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
          />
          <button
            type="button"
            disabled={pending || !(value > 0) || !date}
            onClick={() => {
              if (typicalPaycheck > 0 && value > typicalPaycheck) {
                setWindfallOpen(true);
              } else {
                submit(false);
              }
            }}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Log it
          </button>
        </div>
      </div>

      {windfallOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-emerald-500/40 bg-slate-900 p-8 shadow-2xl shadow-emerald-500/10">
            <p className="text-center text-5xl">💰</p>
            <h2 className="mt-2 text-center text-3xl font-black text-white">
              {`${currency.format(value)} just landed!`}
            </h2>
            <p className="mt-1 text-center text-sm text-slate-400">
              That&apos;s more than a typical paycheck. Where should it go?
            </p>

            <div className="mt-6 space-y-5">
              {slider("savings", "Savings", effective.savings, "text-emerald-300")}
              {hasFixes &&
                slider(
                  "fixes",
                  "Fix upcoming gaps",
                  effective.fixes,
                  "text-amber-300",
                  `Tops up ${shortfalls.map((s) => s.bucketName).join(", ")}`,
                )}
              {hasFun &&
                slider(
                  "fun",
                  `${funBucket!.name} (fun money)`,
                  effective.fun,
                  "text-sky-300",
                )}
            </div>

            <button
              type="button"
              disabled={pending}
              onClick={() => submit(true)}
              className="mt-8 w-full rounded-xl bg-emerald-500 px-4 py-3 text-lg font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              Stash it 💪
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setWindfallOpen(false)}
              className="mt-3 w-full text-sm text-slate-500 transition hover:text-slate-300"
            >
              Not now — back to the dashboard
            </button>
          </div>
        </div>
      )}
    </>
  );
}
