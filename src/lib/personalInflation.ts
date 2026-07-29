/**
 * Personal inflation index: YOUR prices, not the news. Two sources:
 *  - repeat merchants (≥3 one-time spends spanning ≥60 days): average of the
 *    earliest third vs the latest third of purchases
 *  - recurring bills with amount-edit history: first price vs current
 * Only meaningful movers (|change| ≥ 3%) make the list.
 */
import { merchantKey } from "@/lib/merchants";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface InflationRow {
  label: string;
  kind: "merchant" | "bill";
  early: number;
  late: number;
  pct: number;
  /** Purchases sampled (merchants) — bills are 0. */
  samples: number;
}

export interface PersonalInflation {
  rows: InflationRow[];
  /** Spend-weighted average change across all rows, %. */
  overallPct: number;
}

export function personalInflation(
  spends: { name: string; amount: number; due_date: string; cadence: string; is_paused?: boolean }[],
  billCreeps: { name: string; first: number; last: number }[],
  todayISO: string,
  windowDays = 240,
): PersonalInflation | null {
  const cutoff = new Date(Date.parse(todayISO) - windowDays * 86400000)
    .toISOString()
    .slice(0, 10);

  const groups = new Map<string, { label: string; items: { amount: number; date: string }[] }>();
  for (const s of spends) {
    if (s.cadence !== "one_time" || s.is_paused) continue;
    if (s.due_date <= cutoff || s.due_date > todayISO) continue;
    const amount = Number(s.amount);
    if (!(amount > 0)) continue;
    const key = merchantKey(s.name);
    if (!key) continue;
    const g = groups.get(key) ?? { label: s.name, items: [] };
    g.items.push({ amount, date: s.due_date });
    groups.set(key, g);
  }

  const rows: InflationRow[] = [];
  for (const g of groups.values()) {
    if (g.items.length < 3) continue;
    const sorted = [...g.items].sort((a, b) => (a.date < b.date ? -1 : 1));
    const spanDays =
      (Date.parse(sorted[sorted.length - 1].date) - Date.parse(sorted[0].date)) / 86400000;
    if (spanDays < 60) continue;
    const third = Math.max(1, Math.floor(sorted.length / 3));
    const avg = (xs: { amount: number }[]) =>
      xs.reduce((s, x) => s + x.amount, 0) / xs.length;
    const early = round2(avg(sorted.slice(0, third)));
    const late = round2(avg(sorted.slice(-third)));
    if (!(early > 0)) continue;
    const pct = Math.round(((late - early) / early) * 100);
    if (Math.abs(pct) < 3) continue;
    rows.push({ label: g.label, kind: "merchant", early, late, pct, samples: sorted.length });
  }

  for (const c of billCreeps) {
    if (!(c.first > 0)) continue;
    const pct = Math.round(((c.last - c.first) / c.first) * 100);
    if (Math.abs(pct) < 3) continue;
    rows.push({ label: c.name, kind: "bill", early: c.first, late: c.last, pct, samples: 0 });
  }

  if (rows.length === 0) return null;
  rows.sort((a, b) => b.pct - a.pct);

  const weight = (r: InflationRow) => r.late;
  const totalWeight = rows.reduce((s, r) => s + weight(r), 0);
  const overallPct =
    totalWeight > 0
      ? Math.round((rows.reduce((s, r) => s + r.pct * weight(r), 0) / totalWeight) * 10) / 10
      : 0;

  return { rows: rows.slice(0, 8), overallPct };
}
