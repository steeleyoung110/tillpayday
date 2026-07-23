"use client";

import { useMemo, useState } from "react";
import { applyShortfallFix, rightSizeBucket } from "@/app/actions";
import {
  PRESET_MONTHS,
  presetLabel,
  presetWindow,
  sampleWindow,
  sanitizeWindow,
  windowPlan,
  type ChartViewWindow,
} from "@/lib/chartWindow";
import {
  UNALLOCATED_KEY,
  evaluateWhatIf,
  runProjection,
  type ProjectionInput,
  type ProjectionPoint,
} from "@/lib/engine";
import {
  LIQUID_CATEGORIES,
  bucketToEngine,
  expenseToEngine,
  incomeEntryToEngine,
  incomeToEngine,
  type DashboardData,
} from "@/lib/rows";
import {
  BUCKET_COLORS,
  ProjectionChart,
  TOTAL_COLOR,
  type ChartRow,
  type ChartSeries,
} from "./ProjectionChart";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Preset pill labels: 1m, 3m, 1y, 3y, 5y, 10y. */
function pillLabel(months: number): string {
  return months < 12 ? `${months}m` : `${months / 12}y`;
}

const TOTAL_KEY = "__total__";
const WHATIF_KEY = "__whatif__";
const OTHER_KEY = "__other__";

/** At most this many individual bucket lines; extras fold into "Other buckets". */
const MAX_BUCKET_LINES = 8;

interface BucketLine {
  /** Bucket ids whose balances sum into this line (1 except for "Other"). */
  ids: string[];
  key: string;
  name: string;
  color: string;
  isSavings: boolean;
}

/** Turn already-windowed projection points into chart rows. */
function toChartRows(
  windowPoints: ProjectionPoint[],
  whatifByDate: Map<string, number> | null,
  lines: BucketLine[],
): ChartRow[] {
  return windowPoints.map((p) => {
    const row: ChartRow = { date: p.date, [TOTAL_KEY]: p.total };
    for (const line of lines) {
      row[line.key] = line.ids.reduce(
        (sum, id) => sum + (p.buckets[id] ?? 0),
        0,
      );
    }
    if (whatifByDate) row[WHATIF_KEY] = whatifByDate.get(p.date);
    return row;
  });
}

export function ProjectionSection({
  data,
  todayISO,
}: {
  data: DashboardData;
  todayISO: string;
}) {
  const considering = data.whatIf.filter((w) => w.status === "considering");
  const [selectedId, setSelectedId] = useState<string>("");
  // View window: zoom presets (1 month … 10 years) or a custom date range.
  const [win, setWin] = useState<ChartViewWindow & { preset: number | null }>(
    () => ({ ...presetWindow(todayISO, 60), preset: 60 }),
  );
  const plan = windowPlan(win, todayISO);
  const selected =
    considering.find((w) => w.id === selectedId) ?? considering[0] ?? null;

  const buckets = useMemo(() => data.buckets.map(bucketToEngine), [data.buckets]);
  const savings = buckets.find((b) => b.isSavings);

  // Starting savings for the mid-cycle start: the explicit starting balance on
  // the savings bucket wins; otherwise fall back to liquid net worth (cash +
  // savings accounts), so the projection begins from real money either way.
  const liquid = data.netWorth
    .filter((i) => i.kind === "asset" && LIQUID_CATEGORIES.includes(i.category))
    .reduce((sum, i) => sum + Number(i.amount), 0);
  const startingSavings =
    savings && (savings.startingBalance ?? 0) > 0 ? savings.startingBalance! : liquid;
  const netWorthNow = data.netWorth.reduce(
    (sum, i) => sum + (i.kind === "asset" ? 1 : -1) * Number(i.amount),
    0,
  );

  const input: ProjectionInput = useMemo(
    () => ({
      startDate: todayISO,
      months: plan.monthsToProject,
      startingBalances: { [savings ? savings.id : UNALLOCATED_KEY]: startingSavings },
      incomeSources: data.income.map(incomeToEngine),
      buckets,
      expenses: data.expenses.map(expenseToEngine),
      incomeEntries: data.incomeEntries.map(incomeEntryToEngine),
    }),
    [data, todayISO, plan.monthsToProject, buckets, savings, startingSavings],
  );

  const result = useMemo(() => {
    if (selected) {
      return evaluateWhatIf(input, {
        id: selected.id,
        name: selected.name,
        amount: Number(selected.amount),
        targetDate: selected.target_date,
        bucketId: selected.bucket_id,
      });
    }
    return { baseline: runProjection(input), withPurchase: null, verdict: null };
  }, [input, selected]);

  // One line per bucket in stored order (savings included), plus the implicit
  // unallocated pool when no savings bucket exists. Colors are assigned by
  // position from the validated palette; past the cap, buckets fold into
  // a single "Other buckets" line.
  const lines: BucketLine[] = useMemo(() => {
    const entries = buckets.map((b) => ({
      id: b.id,
      name: b.isSavings ? `${b.name} (savings)` : b.name,
      isSavings: b.isSavings,
    }));
    if (!savings) {
      entries.push({ id: UNALLOCATED_KEY, name: "Unallocated", isSavings: false });
    }
    const shown =
      entries.length > MAX_BUCKET_LINES ? entries.slice(0, MAX_BUCKET_LINES - 1) : entries;
    const folded = entries.slice(shown.length);
    const out: BucketLine[] = shown.map((e, i) => ({
      ids: [e.id],
      key: e.id,
      name: e.name,
      color: BUCKET_COLORS[i % BUCKET_COLORS.length],
      isSavings: e.isSavings,
    }));
    if (folded.length > 0) {
      out.push({
        ids: folded.map((e) => e.id),
        key: OTHER_KEY,
        name: `Other buckets (${folded.length})`,
        color: "#64748b",
        isSavings: false,
      });
    }
    return out;
  }, [buckets, savings]);

  const savingsLine = lines.find((l) => l.isSavings);

  const series: ChartSeries[] = useMemo(() => {
    const out: ChartSeries[] = lines.map((l) => ({
      key: l.key,
      name: l.name,
      color: l.color,
      emphasis: l.isSavings,
    }));
    out.push({ key: TOTAL_KEY, name: "Total on hand", color: TOTAL_COLOR, emphasis: true });
    if (result.withPurchase && selected) {
      out.push({
        key: WHATIF_KEY,
        // Same hue as the savings line, dashed — it's that line's hypothetical twin.
        name: `Savings if you buy "${selected.name}"`,
        color: savingsLine?.color ?? "#38bdf8",
        dashed: true,
      });
    }
    return out;
  }, [lines, result.withPurchase, selected, savingsLine]);

  const savedByNo = data.whatIf
    .filter((w) => w.status === "skipped")
    .reduce((sum, w) => sum + Number(w.amount), 0);

  const { baseline, withPurchase, verdict } = result;
  const windowPoints = sampleWindow(baseline.points, win, plan.stepDays);
  const whatifByDate = withPurchase
    ? new Map(withPurchase.points.map((p) => [p.date, p.savings]))
    : null;
  const chartRows = toChartRows(windowPoints, whatifByDate, lines);
  const hasIncome = data.income.length > 0;

  // Stats read from the end of the visible window, so zooming re-frames them.
  const windowEnd =
    windowPoints[windowPoints.length - 1] ??
    baseline.points[baseline.points.length - 1];
  const windowLabel = win.preset
    ? `in ${presetLabel(win.preset)}`
    : `by ${prettyDate(win.to)}`;

  // Cash accumulated by the window's end, added to today's net worth. (Whatever
  // seeded the projection's start is already counted inside the total.)
  const projectedNetWorth = netWorthNow + (windowEnd?.total ?? 0) - startingSavings;

  return (
    <section className="space-y-4">
      {/* Headline stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">{`Projected savings ${windowLabel}`}</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {currency.format(windowEnd?.savings ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">{`Total on hand ${windowLabel}`}</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {currency.format(windowEnd?.total ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">{`Projected net worth ${windowLabel}`}</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {currency.format(projectedNetWorth)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Saved by saying no 🎉</p>
          <p className="mt-1 text-3xl font-bold text-emerald-400">
            {currency.format(savedByNo)}
          </p>
        </div>
      </div>

      {/* Chart card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-white">
            Projection — every bucket&apos;s route
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-slate-700 p-0.5 text-sm">
              {PRESET_MONTHS.map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    setWin({ ...presetWindow(todayISO, m), preset: m })
                  }
                  className={`rounded-md px-2.5 py-1 transition ${
                    win.preset === m
                      ? "bg-emerald-500 font-semibold text-slate-950"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  {pillLabel(m)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="date"
                value={win.from}
                min={todayISO}
                onChange={(e) =>
                  setWin({
                    ...sanitizeWindow(e.target.value, win.to, todayISO),
                    preset: null,
                  })
                }
                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-white"
                aria-label="Chart start date"
              />
              →
              <input
                type="date"
                value={win.to}
                min={todayISO}
                onChange={(e) =>
                  setWin({
                    ...sanitizeWindow(win.from, e.target.value, todayISO),
                    preset: null,
                  })
                }
                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-white"
                aria-label="Chart end date"
              />
            </div>
            {considering.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                Previewing:
                <select
                  value={selected?.id ?? ""}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-white"
                >
                  {considering.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({currency.format(Number(w.amount))})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {hasIncome ? (
          <>
            <ProjectionChart data={chartRows} series={series} granularity={plan.granularity} />
            <p className="mt-2 text-xs text-slate-500">
              {baseline.irregularWeekly !== null &&
                `Based on your typical income — about ${currency.format(baseline.irregularWeekly)}/week from what you've logged, counted at a careful 85%. `}
              {liquid > 0
                ? `Starts from ${currency.format(liquid)} — your cash + savings from the net-worth section. `
                : "Add your cash and savings accounts in the net-worth section above to start the projection from what you actually have. "}
              {savings && (savings.apy ?? 0) > 0
                ? `Savings compounds at ${savings.apy}% APY.`
                : "Set your savings bucket's APY below so interest compounds in the projection."}
            </p>
          </>
        ) : (
          <p className="py-16 text-center text-slate-400">
            Add an income source below to see your projection.
          </p>
        )}

        {/* What-if verdict */}
        {verdict && selected && (
          <div
            className={`mt-4 rounded-xl border p-4 text-sm ${
              verdict.causesNegative
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-sky-500/40 bg-sky-500/10 text-sky-200"
            }`}
          >
            <p>
              <strong>Buying &ldquo;{selected.name}&rdquo;</strong> leaves you with{" "}
              {currency.format(verdict.endingWith)} instead of{" "}
              {`${currency.format(verdict.endingWithout)} ${windowLabel} — it sets you back `}
              <strong>{verdict.setbackLabel}</strong>.
              {verdict.causesNegative &&
                " ⚠️ It also pushes a bucket into the red at some point — see warnings below."}
            </p>
          </div>
        )}
      </div>

      {/* Warnings — every problem arrives with its fix (8D) */}
      {(withPurchase ?? baseline).warnings.length > 0 && hasIncome && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h3 className="font-semibold text-amber-300">
            Heads up — a few things to smooth out
          </h3>
          <ul className="mt-3 space-y-3 text-sm text-amber-100">
            {(withPurchase ?? baseline).warnings.map((w) => {
              const bucketRow = data.buckets.find((b) => b.id === w.bucketId);
              const savingsTarget = !bucketRow || bucketRow.is_savings;
              return (
                <li
                  key={`${w.type}-${w.bucketId}-${w.date}`}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  {w.type === "shortfall" ? (
                    <>
                      <span>
                        <strong>{w.bucketName}</strong>
                        {` will be ${currency.format(w.amount)} short in ${w.month}`}
                        {w.fixPerPaycheck !== null
                          ? ` — setting aside ${currency.format(w.fixPerPaycheck)} from each paycheck starting now covers it.`
                          : ` — no paycheck lands before then, so it needs money moved in today.`}
                      </span>
                      {w.fixPerPaycheck !== null && !savingsTarget && (
                        <form action={applyShortfallFix}>
                          <input type="hidden" name="bucket_id" value={w.bucketId} />
                          <input type="hidden" name="extra" value={w.fixPerPaycheck} />
                          <button className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400">
                            {`Set aside ${currency.format(w.fixPerPaycheck)}/paycheck`}
                          </button>
                        </form>
                      )}
                    </>
                  ) : (
                    <>
                      <span>
                        <strong>{w.bucketName}</strong>
                        {` asks for ${currency.format(w.requested)} but paychecks run out at ${currency.format(w.funded)} (first on ${w.date}).`}
                        {bucketRow?.allocation_type === "percent" &&
                          " Your percentages add up past what a check can cover — trimming one brings it back in line."}
                      </span>
                      {bucketRow?.allocation_type === "fixed" && (
                        <form action={rightSizeBucket}>
                          <input type="hidden" name="bucket_id" value={w.bucketId} />
                          <input type="hidden" name="value" value={w.funded} />
                          <button className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400">
                            {`Right-size to ${currency.format(w.funded)}`}
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
