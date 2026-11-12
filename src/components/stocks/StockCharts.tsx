"use client";

/**
 * Stocks charts. Loaded lazily (see LazyCharts) so Recharts stays out of the
 * first paint. Colors come in with the data (validated series palette for
 * the dark surface); text stays in the slate text tones.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SURFACE = "#0f172a";
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmt = (n: number) => (Math.abs(n) < 1000 ? usd2.format(n) : usd0.format(n));
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));

const tooltipStyle = {
  backgroundColor: SURFACE,
  border: "1px solid #334155",
  borderRadius: 12,
  color: "#e2e8f0",
  fontSize: 12,
};
const axisTick = { fill: "#94a3b8", fontSize: 11 };

export interface DonutSlice {
  label: string;
  value: number;
  share: number;
  color: string;
}

/** Breakdown by stock. 2px surface gaps between slices; hover shows each. */
export function HoldingsDonut({ slices, centerLabel, centerValue }: { slices: DonutSlice[]; centerLabel: string; centerValue: string }) {
  return (
    <div className="relative h-64 w-full" role="img" aria-label={`Breakdown by stock: ${slices.map((s) => `${s.label} ${(s.share * 100).toFixed(1)}%`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="95%"
            startAngle={90}
            endAngle={-270}
            stroke={SURFACE}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.label} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            itemStyle={{ color: "#e2e8f0" }}
            formatter={(value, name, item) => {
              const share = (item?.payload as DonutSlice | undefined)?.share ?? 0;
              return [`${fmt(Number(value))} · ${(share * 100).toFixed(1)}%`, String(name)];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{centerLabel}</span>
        <span className="text-xl font-bold text-white tabular-nums">{centerValue}</span>
      </div>
    </div>
  );
}

/** Account value over time (one series, so no legend; the panel title names it). */
export function ValueChart({ points, color = "#3987e5", goal }: { points: { day: string; value: number }[]; color?: string; goal?: number | null }) {
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values, goal && goal < Math.max(...values) * 1.3 ? goal : -Infinity);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.01, 1);
  return (
    <div className="h-56 w-full" role="img" aria-label={`Value from ${fmt(values[0] ?? 0)} to ${fmt(values[values.length - 1] ?? 0)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id={`fill-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tickFormatter={dayLabel} tick={axisTick} axisLine={{ stroke: "#334155" }} tickLine={false} minTickGap={24} />
          <YAxis
            domain={[Math.max(0, lo - pad), hi + pad]}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => usd0.format(v)}
            width={72}
          />
          {goal && goal < hi + pad ? <ReferenceLine y={goal} stroke="#64748b" strokeDasharray="4 4" /> : null}
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(l) => dayLabel(String(l))}
            formatter={(v) => [fmt(Number(v)), "Value"]}
            cursor={{ stroke: "#475569" }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#fill-${color.slice(1)})`} dot={false} activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Dividends by month: paid (solid) and expected (lighter), one bar per month. */
export function DividendMonthsChart({ months }: { months: { label: string; paid: number; expected: number }[] }) {
  return (
    <div>
    <div className="flex gap-4 pb-2 text-xs text-slate-300" aria-hidden>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-[#3987e5]" />
        Paid
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-dashed border-[#3987e5] bg-[#3987e5]/40" />
        Expected
      </span>
    </div>
    <div className="h-64 w-full" role="img" aria-label="Dividends paid and expected by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: "#334155" }} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v: number) => usd0.format(v)} width={56} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            formatter={(v, name) => [usd2.format(Number(v)), String(name)]}
          />
          <Bar dataKey="paid" name="Paid" stackId="m" fill="#3987e5" maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="expected" name="Expected" stackId="m" fill="#3987e5" fillOpacity={0.4} stroke="#3987e5" strokeOpacity={0.9} strokeDasharray="3 2" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}

/** Expected yearly dividends as recorded at each sync. */
export function IncomeTrendChart({ points }: { points: { day: string; income: number }[] }) {
  return (
    <div className="h-48 w-full" role="img" aria-label={`Expected yearly dividends from ${fmt(points[0]?.income ?? 0)} to ${fmt(points[points.length - 1]?.income ?? 0)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="day" tickFormatter={dayLabel} tick={axisTick} axisLine={{ stroke: "#334155" }} tickLine={false} minTickGap={24} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v: number) => usd0.format(v)} width={56} domain={["auto", "auto"]} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => dayLabel(String(l))} formatter={(v) => [usd2.format(Number(v)), "Per year"]} />
          <Area type="monotone" dataKey="income" stroke="#199e70" strokeWidth={2} fill="#199e70" fillOpacity={0.15} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
