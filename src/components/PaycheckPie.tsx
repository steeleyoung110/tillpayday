"use client";

/**
 * Donut of how one typical paycheck splits across buckets. Colors match the
 * projection chart's per-bucket lines so the two charts read as one system.
 * The breakdown list next to it is server-rendered by the Budget page.
 */
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export interface PieSlice {
  name: string;
  amount: number;
  /** Share of the paycheck, 0–100. Named `share` because Recharts injects its
   * own `percent` (a 0–1 fraction) into label callbacks — a `percent` data key
   * shadows it and renders things like "7500%". */
  share: number;
  color: string;
}

export function PaycheckPie({
  slices,
  paycheck,
}: {
  slices: PieSlice[];
  paycheck: number;
}) {
  return (
    <div className="relative h-64 w-full max-w-xs">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            // Recharts v3 reads each sector's color from the data entry's
            // `fill` (Cells alone left everything the default gray).
            data={slices.map((s) => ({ ...s, fill: s.color }))}
            dataKey="amount"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="#0f172a"
            strokeWidth={2}
            isAnimationActive={false}
            label={(props: {
              x?: number;
              y?: number;
              textAnchor?: string;
              payload?: unknown;
            }) => {
              const slice = props.payload as PieSlice;
              if (!slice || slice.share < 8) return <g />;
              return (
                <text
                  x={props.x}
                  y={props.y}
                  textAnchor={props.textAnchor as "start" | "middle" | "end"}
                  dominantBaseline="central"
                  fill="#e2e8f0"
                  fontSize={12}
                >
                  {`${slice.name} ${Math.round(slice.share)}%`}
                </text>
              );
            }}
            labelLine={false}
          />
          <Tooltip
            formatter={(value, name, entry) => [
              `${currency.format(Number(value))} (${(entry?.payload as PieSlice)?.share}%)`,
              String(name),
            ]}
            labelStyle={{ color: "#e2e8f0" }}
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "0.5rem",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-white">{currency.format(paycheck)}</span>
        <span className="text-xs text-slate-500">per check</span>
      </div>
    </div>
  );
}
