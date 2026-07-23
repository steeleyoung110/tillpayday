"use client";

/**
 * Net worth over time (9C): a line from the automatic daily snapshots, with
 * the 3/6/12/24-month zoom (remembered per device) and plain-English deltas.
 * With fewer than two snapshots it encourages instead of charting.
 */
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { filterHorizon, snapshotDeltas } from "@/lib/netWorth";
import type { SnapshotRow } from "@/lib/rows";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const HORIZONS = [3, 6, 12, 24] as const;

function tick(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d}`;
}

function monthName(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

export function NetWorthChart({
  snapshots,
  todayISO,
}: {
  snapshots: SnapshotRow[];
  todayISO: string;
}) {
  const [months, setMonths] = useState<number>(12);
  useEffect(() => {
    const saved = Number(localStorage.getItem("tp-networth-window"));
    if ((HORIZONS as readonly number[]).includes(saved)) setMonths(saved);
  }, []);
  const pick = (m: number) => {
    setMonths(m);
    try {
      localStorage.setItem("tp-networth-window", String(m));
    } catch {}
  };

  const visible = filterHorizon(snapshots, months, todayISO) as SnapshotRow[];
  const deltas = snapshotDeltas(snapshots, todayISO);

  const deltaPhrase = (n: number) =>
    n >= 0 ? `up ${currency.format(n)}` : `down ${currency.format(Math.abs(n))}`;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-white">Your story so far</h2>
        <div className="flex rounded-lg border border-slate-700 p-0.5 text-sm">
          {HORIZONS.map((m) => (
            <button
              key={m}
              onClick={() => pick(m)}
              className={`rounded-md px-2.5 py-1 transition ${
                months === m
                  ? "bg-emerald-500 font-semibold text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {m}mo
            </button>
          ))}
        </div>
      </div>

      {snapshots.length < 2 ? (
        <div className="py-12 text-center">
          <p className="text-4xl">🌱</p>
          <p className="mt-3 text-slate-300">
            Your line starts here. Every time you check in and update a number,
            a new dot lands — come back next month and watch it grow.
          </p>
        </div>
      ) : (
        <>
          {deltas.sinceStart !== null && (
            <p className="mb-3 text-sm text-emerald-300">
              {`${deltaPhrase(deltas.sinceStart)} since ${monthName(deltas.startDate!)}`}
              {deltas.sinceLastMonth !== null &&
                ` · ${deltaPhrase(deltas.sinceLastMonth)} in the last month`}
            </p>
          )}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={visible.map((s) => ({
                  date: s.snapshot_date,
                  netWorth: Number(s.net_worth),
                }))}
                margin={{ top: 8, right: 12, bottom: 0, left: 8 }}
              >
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={tick}
                  interval="preserveStartEnd"
                  minTickGap={60}
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
                  formatter={(value) => [currency.format(Number(value)), "Net worth"]}
                  labelStyle={{ color: "#e2e8f0" }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "0.5rem",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="netWorth"
                  stroke="#34d399"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#34d399" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
