"use client";

/**
 * Donut of how one typical paycheck splits across buckets. Colors match the
 * projection chart's per-bucket lines so the two charts read as one system.
 * The breakdown list next to it is server-rendered by the Budget page.
 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export interface PieSlice {
  name: string;
  amount: number;
  percent: number;
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
            data={slices}
            dataKey="amount"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="#0f172a"
            strokeWidth={2}
            isAnimationActive={false}
            label={({ percent, name }) =>
              Number(percent) >= 0.08 ? `${name} ${Math.round(Number(percent) * 100)}%` : ""
            }
            labelLine={false}
            fontSize={12}
          >
            {slices.map((s) => (
              <Cell key={s.name} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name, entry) => [
              `${currency.format(Number(value))} (${(entry?.payload as PieSlice)?.percent}%)`,
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
