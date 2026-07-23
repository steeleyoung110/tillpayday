"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

export function ProjectionChart({
  data,
  series,
  granularity,
}: {
  data: ChartRow[];
  series: ChartSeries[];
  granularity: TickGranularity;
}) {
  const nameByKey = new Map(series.map((s) => [s.key, s.name]));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#1e293b" vertical={false} />
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
