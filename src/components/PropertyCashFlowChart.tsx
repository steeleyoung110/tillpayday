"use client";

/**
 * Monthly money-in vs money-out for one year of a property (or the whole
 * portfolio), with the net cash-flow line running through it. Honest by
 * construction: "out" includes every dollar that left — expenses AND the
 * full mortgage payment.
 */
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import type { MonthFinance } from "@/lib/property/finance";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function PropertyCashFlowChart({ months }: { months: MonthFinance[] }) {
  const data = months.map((m) => ({
    name: MONTHS[m.month - 1],
    "Rent in": m.rentCollected,
    "Money out": Math.round((m.expenses + m.debtService) * 100) / 100,
    "Cash flow": m.cashFlow,
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Monthly rent in, money out, and cash flow">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => fmt(v)}
            width={70}
          />
          <Tooltip
            formatter={(value) => fmt(Number(value))}
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 12,
              color: "#e2e8f0",
              fontSize: 12,
            }}
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
          />
          <ReferenceLine y={0} stroke="#475569" />
          <Bar dataKey="Rent in" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={22} />
          <Bar dataKey="Money out" fill="#fb7185" radius={[3, 3, 0, 0]} maxBarSize={22} />
          <Line
            type="monotone"
            dataKey="Cash flow"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={{ r: 2, fill: "#38bdf8" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
