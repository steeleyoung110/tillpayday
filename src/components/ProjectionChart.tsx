"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** One line on the chart. `key` addresses the value inside each ChartRow. */
export interface ChartSeries {
  key: string;
  name: string;
  color: string;
  /** Dashed = a hypothetical variant (the what-if line). */
  dashed?: boolean;
  /** Emphasized = thicker stroke (total and savings). */
  emphasis?: boolean;
}

/** One row of chart data: a date plus one value per series key. */
export interface ChartRow {
  date: string;
  [seriesKey: string]: string | number | undefined;
}

/**
 * Categorical palette for bucket lines, validated (CVD-safe adjacent pairs,
 * ≥3:1 contrast) against the slate-900 chart surface. Assign in this fixed
 * order by bucket position — never re-color a bucket when others change.
 */
export const BUCKET_COLORS = [
  "#3987e5", // blue
  "#008300", // green
  "#d55181", // magenta
  "#c98500", // yellow
  "#199e70", // aqua
  "#d95926", // orange
  "#9085e9", // violet
  "#e66767", // red
];

/** Neutral ink for the "everything combined" total line. */
export const TOTAL_COLOR = "#e2e8f0";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export type TickGranularity = "day" | "month" | "monthYear";

function tickLabel(iso: string, granularity: TickGranularity): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  if (granularity === "day") return `${month} ${d}`;
  if (granularity === "monthYear") return `${month} '${String(y).slice(2)}`;
  return month;
}

export interface GoalLine {
  value: number;
  label: string;
}

export interface EventDot {
  /** Must match a date present in `data`. */
  x: string;
  y: number;
  color: string;
}

export function ProjectionChart({
  data,
  series,
  granularity,
  goalLines = [],
  todayMarker = null,
  eventDots = [],
  height = "h-80",
}: {
  data: ChartRow[];
  series: ChartSeries[];
  granularity: TickGranularity;
  /** Horizontal target lines (goals) — extend the domain so they're visible. */
  goalLines?: GoalLine[];
  /** Vertical "today" line (ISO date matching a data row). */
  todayMarker?: string | null;
  /** Transaction markers: dots where money left a bucket. */
  eventDots?: EventDot[];
  height?: string;
}) {
  const nameByKey = new Map(series.map((s) => [s.key, s.name]));

  return (
    <div className={`${height} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          {/* Positive/negative wash: a soft green tint above $0 and red below,
              strongest at the zero line and fading into the background so it
              orients without distracting. */}
          <defs>
            <linearGradient id="tp-positive" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
              <stop offset="45%" stopColor="#34d399" stopOpacity={0.09} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="tp-negative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
              <stop offset="45%" stopColor="#f87171" stopOpacity={0.11} />
              <stop offset="100%" stopColor="#f87171" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1e293b" vertical={false} />
          {/* Recharts v3: a missing y1 means "from the top of the domain",
              a missing y2 means "to the bottom" — so y2={0} is the positive
              region (top → zero) and y1={0} the negative (zero → bottom). */}
          {/* fillOpacity=1 overrides Recharts' default 0.5, which would halve
              the gradient and render it nearly invisible on the dark surface. */}
          <ReferenceArea y2={0} fill="url(#tp-positive)" fillOpacity={1} stroke="none" />
          <ReferenceArea y1={0} fill="url(#tp-negative)" fillOpacity={1} stroke="none" />
          <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
          {goalLines.map((g) => (
            <ReferenceLine
              key={`${g.label}-${g.value}`}
              y={g.value}
              stroke="#E4A93C"
              strokeDasharray="6 4"
              ifOverflow="extendDomain"
              label={{
                value: `🎯 ${g.label}`,
                position: "insideBottomRight",
                fill: "#E4A93C",
                fontSize: 12,
              }}
            />
          ))}
          {todayMarker && (
            <ReferenceLine
              x={todayMarker}
              stroke="#F4EEE1"
              strokeDasharray="3 3"
              label={{
                value: "today",
                position: "insideTopLeft",
                fill: "#F4EEE1",
                fontSize: 11,
              }}
            />
          )}
          {eventDots.map((d, i) => (
            <ReferenceDot
              key={`${d.x}-${i}`}
              x={d.x}
              y={d.y}
              r={4}
              fill={d.color}
              stroke="#0f172a"
              strokeWidth={1.5}
            />
          ))}
          <XAxis
            dataKey="date"
            tickFormatter={(iso: string) => tickLabel(iso, granularity)}
            interval="preserveStartEnd"
            minTickGap={granularity === "month" ? 40 : 60}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => currency.format(v)}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={78}
          />
          <Tooltip
            formatter={(value, name) => [
              currency.format(Number(value)),
              nameByKey.get(String(name)) ?? String(name),
            ]}
            labelFormatter={(iso) => String(iso)}
            labelStyle={{ color: "#e2e8f0" }}
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "0.5rem",
            }}
          />
          <Legend
            formatter={(value: string) => (
              <span className="text-sm text-slate-300">
                {nameByKey.get(value) ?? value}
              </span>
            )}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={s.emphasis ? 2.5 : 1.5}
              strokeDasharray={s.dashed ? "6 4" : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
