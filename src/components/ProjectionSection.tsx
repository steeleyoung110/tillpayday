"use client";

import { useMemo, useState } from "react";
import {
  UNALLOCATED_KEY,
  evaluateWhatIf,
  runProjection,
  type ProjectionInput,
  type ProjectionResult,
} from "@/lib/engine";
import {
  LIQUID_CATEGORIES,
  bucketToEngine,
  expenseToEngine,
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

const HORIZONS = [1, 3, 5, 10] as const;
type Horizon = (typeof HORIZONS)[number];

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

/**
 * Sample the daily points down to sparse rows so the chart stays light: weekly
 * for a 1-year view, monthly for 10 years. Always keeps the last day.
 */
function toChartRows(
  baseline: ProjectionResult,
  withPurchase: ProjectionResult | null,
  lines: BucketLine[],
  years: Horizon,
): ChartRow[] {
  const step = years === 1 ? 7 : years <= 3 ? 14 : 30;
  const pts = baseline.points;
  const rows: ChartRow[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    if (i % step !== 0 && i !== pts.length - 1) continue;
    const row: ChartRow = { date: pts[i].date, [TOTAL_KEY]: pts[i].total };
    for (const line of lines) {
      row[line.key] = line.ids.reduce(
        (sum, id) => sum + (pts[i].buckets[id] ?? 0),
        0,
      );
    }
    if (withPurchase) row[WHATIF_KEY] = withPurchase.points[i]?.savings;
    rows.push(row);
  }
  return rows;
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
  const [years, setYears] = useState<Horizon>(5);
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
      months: years * 12,
      startingBalances: { [savings ? savings.id : UNALLOCATED_KEY]: startingSavings },
      incomeSources: data.income.map(incomeToEngine),
      buckets,
      expenses: data.expenses.map(expenseToEngine),
    }),
    [data, todayISO, years, buckets, savings, startingSavings],
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
  const chartRows = toChartRows(baseline, withPurchase, lines, years);
  const hasIncome = data.income.length > 0;
  const yearsLabel = years === 1 ? "1 year" : `${years} years`;

  // Cash accumulated over the horizon, added to today's net worth. (Whatever
  // seeded the projection's start is already counted inside endingTotal.)
  const projectedNetWorth = netWorthNow + baseline.endingTotal - startingSavings;

  return (
    <section className="space-y-4">
      {/* Headline stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Projected savings in {yearsLabel}</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {currency.format(baseline.endingSavings)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Total on hand in {yearsLabel}</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {currency.format(baseline.endingTotal)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Projected net worth in {yearsLabel}</p>
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
            {`${yearsLabel} projection — every bucket's route`}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-slate-700 p-0.5 text-sm">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setYears(h)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    years === h
                      ? "bg-emerald-500 font-semibold text-slate-950"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  {h}y
                </button>
              ))}
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
            <ProjectionChart data={chartRows} series={series} multiYear={years > 1} />
            <p className="mt-2 text-xs text-slate-500">
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
              {`${currency.format(verdict.endingWithout)} in ${yearsLabel} — it sets you back `}
              <strong>{verdict.setbackLabel}</strong>.
              {verdict.causesNegative &&
                " ⚠️ It also pushes a bucket into the red at some point — see warnings below."}
            </p>
          </div>
        )}
      </div>

      {/* Underfunded + shortfall warnings */}
      {(withPurchase ?? baseline).warnings.length > 0 && hasIncome && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
          <h3 className="font-semibold text-red-300">Heads up — your plan doesn&apos;t quite fit</h3>
          <ul className="mt-2 space-y-1 text-sm text-red-200">
            {(withPurchase ?? baseline).warnings.map((w) => (
              <li key={`${w.type}-${w.bucketId}-${w.date}`}>
                {w.type === "underfunded" ? (
                  <>
                    <strong>{w.bucketName}</strong>
                    {` only gets ${currency.format(w.funded)} of its ${currency.format(w.requested)} on paydays (first on ${w.date}) — a paycheck can't stretch that far.`}
                  </>
                ) : (
                  <>
                    <strong>{w.bucketName}</strong>
                    {` comes up ${currency.format(w.amount)} short in ${w.month}.`}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
