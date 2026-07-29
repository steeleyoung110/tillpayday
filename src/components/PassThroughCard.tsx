/**
 * Pass-through cash flow: for income that exists to pay a specific bill —
 * rentals being the classic case — does each pair actually cover itself?
 * Blended into a personal budget this question disappears. Here it's the
 * only question, answered per property, worst first.
 */
import type { PassThroughSummary } from "@/lib/passThrough";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function PassThroughCard({ summary }: { summary: PassThroughSummary }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-white">Does it pay for itself? 🏘️</h2>
        <p
          className={`text-sm font-bold ${summary.net >= 0 ? "text-emerald-300" : "text-red-300"}`}
        >
          {`${summary.net >= 0 ? "+" : "−"}${cents.format(Math.abs(summary.net))}/mo combined`}
        </p>
      </div>
      <p className="mb-3 mt-1 text-xs text-slate-500">
        Income you&apos;ve tied to a specific bill, each pair standing on its
        own. This money never touches your bucket split — it comes in and goes
        straight back out.
      </p>

      <ul className="space-y-2">
        {summary.pairs.map((p) => (
          <li
            key={p.incomeId}
            className={`rounded-xl px-3 py-2.5 ${
              p.net < 0 ? "bg-red-500/10" : "bg-emerald-500/10"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-slate-100">{p.name}</span>
              <span
                className={`text-sm font-bold ${p.net < 0 ? "text-red-300" : "text-emerald-300"}`}
              >
                {`${p.net >= 0 ? "+" : "−"}${cents.format(Math.abs(p.net))}/mo`}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {`${cents.format(p.monthlyIn)} in · ${cents.format(p.monthlyOut)} out (${p.bills.map((b) => b.name).join(", ")})`}
            </p>
            {p.net < 0 && (
              <p className="mt-1 text-xs text-red-200/80">
                {`You cover ${cents.format(Math.abs(p.net))} of this every month out of your own income — ${currency.format(Math.abs(p.net) * 12)} a year, before taxes, insurance, repairs, or a single vacant month.`}
              </p>
            )}
          </li>
        ))}
      </ul>

      {summary.underwater.length > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          {`${summary.underwater.length} of ${summary.pairs.length} don't cover themselves. That's not a reason to panic — it's a number to decide with, and now you have it.`}
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          Every pair covers itself. The rest of your budget is genuinely
          separate from these.
        </p>
      )}
    </div>
  );
}
