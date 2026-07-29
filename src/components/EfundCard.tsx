/**
 * Emergency fund builder: runway's fix-it sibling. Target = N months of the
 * user's REAL bill load; progress from actual liquid money; per-check math
 * to close the gap. Server component — the month buttons post a server
 * action, everything else is arithmetic already done upstream.
 */
import Link from "next/link";
import { setEfundTarget } from "@/app/actions";
import { checksToTarget, type EfundStatus } from "@/lib/efund";

const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function EfundCard({
  status,
  months,
  monthlyLoad,
  velocity = null,
}: {
  status: EfundStatus;
  months: number;
  monthlyLoad: number;
  /** Kept-per-cycle pace, for the "next $1,000" projection. */
  velocity?: { keptPerCycle: number; cyclesToNextThousand: number | null } | null;
}) {
  const suggestions = [25, 50, 100]
    .map((perCheck) => ({ perCheck, checks: checksToTarget(status.gap, perCheck) }))
    .filter((s) => s.checks !== null && s.checks! > 0);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-white">Emergency fund 🛟</p>
        <form action={setEfundTarget} className="flex items-center gap-1 text-xs">
          {[1, 3, 6].map((m) => (
            <button
              key={m}
              name="months"
              value={m}
              className={`rounded px-2 py-0.5 transition ${
                m === months
                  ? "bg-emerald-500 font-semibold text-slate-950"
                  : "border border-slate-700 text-slate-400 hover:border-emerald-400"
              }`}
            >
              {`${m} mo`}
            </button>
          ))}
        </form>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${status.pct >= 100 ? "bg-emerald-400" : "bg-sky-400"}`}
          style={{ width: `${status.pct}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-slate-300">
        {status.gap === 0
          ? `Funded: you're holding ${months} month${months === 1 ? "" : "s"} of bills (${cents.format(status.target)}). That's real security, not vibes.`
          : `You're at ${status.monthsCovered} month${status.monthsCovered === 1 ? "" : "s"} of bills — ${status.pct}% of the ${cents.format(status.target)} that covers ${months}. ${cents.format(status.gap)} to go.`}
      </p>
      {status.gap > 0 && suggestions.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {suggestions
            .map((s) => `${cents.format(s.perCheck)}/check → ${s.checks} checks`)
            .join(" · ")}
        </p>
      )}
      {velocity && (
        <p className="mt-1 text-xs text-slate-500">
          {velocity.cyclesToNextThousand !== null
            ? `Your real pace: you keep ~${cents.format(velocity.keptPerCycle)}/cycle — the next $1,000 lands in about ${velocity.cyclesToNextThousand} cycle${velocity.cyclesToNextThousand === 1 ? "" : "s"} at that speed.`
            : `Your real pace: recent cycles spent MORE than they earned — the fund can't grow until a cycle ends in the black.`}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        {`Target computed from your actual bills (${cents.format(monthlyLoad)}/month) — not a made-up number. `}
        <Link href="/crisis" className="text-sky-300 transition hover:text-sky-200">
          Worst-case plan →
        </Link>
      </p>
    </div>
  );
}
