/**
 * Full-screen payday celebration, shown exactly once per payday: what the sweep
 * banked, the new savings total, and progress toward the savings goal.
 * Dismissing it records the payday in `celebrated_paydays` via a Server Action,
 * which is what guarantees the "exactly once".
 */
import { celebratePayday } from "@/app/actions";
import type { PaydayRecap } from "@/lib/engine";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function CelebrationOverlay({
  recap,
  goal,
}: {
  recap: PaydayRecap;
  /** Savings goal amount (0 = no goal set). */
  goal: number;
}) {
  const pct =
    goal > 0 ? Math.min(100, Math.max(0, (recap.savingsTotal / goal) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-emerald-500/40 bg-slate-900 p-8 text-center shadow-2xl shadow-emerald-500/10">
        <p className="animate-bounce text-6xl">🎉</p>
        <h2 className="mt-2 text-3xl font-black text-white">Payday!</h2>
        <p className="mt-1 text-sm text-slate-400">{prettyDate(recap.payday)}</p>

        {recap.swept > 0 ? (
          <p className="mt-6 text-lg text-slate-200">
            {`You didn't spend ${currency.format(recap.swept)} last cycle — `}
            <span className="font-semibold text-emerald-300">
              it&apos;s in savings now.
            </span>
          </p>
        ) : recap.swept < 0 ? (
          <p className="mt-6 text-lg text-slate-200">
            {`Last cycle ran ${currency.format(Math.abs(recap.swept))} over — savings covered it. Fresh buckets, fresh start.`}
          </p>
        ) : (
          <p className="mt-6 text-lg text-slate-200">
            Right on budget last cycle. Your buckets are refilled.
          </p>
        )}

        <div className="mt-6 rounded-2xl bg-slate-800/60 p-5">
          <p className="text-sm text-slate-400">New savings total</p>
          <p className="mt-1 text-4xl font-black text-emerald-400">
            {currency.format(recap.savingsTotal)}
          </p>

          {goal > 0 && (
            <div className="mt-4">
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {`${Math.floor(pct)}% of your ${currency.format(goal)} goal`}
              </p>
            </div>
          )}
        </div>

        <form action={celebratePayday} className="mt-6">
          <input type="hidden" name="payday" value={recap.payday} />
          <button className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 transition hover:bg-emerald-400">
            Nice — keep going
          </button>
        </form>
      </div>
    </div>
  );
}
