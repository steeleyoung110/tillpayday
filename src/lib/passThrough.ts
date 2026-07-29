/**
 * Pass-through pairs: income that exists to pay a specific bill. Rental
 * income and its mortgage are the obvious case — blending them into a
 * personal budget makes rent look like spending money and the mortgage look
 * like a crisis, when the only number that matters is whether the pair
 * covers itself.
 *
 * The honest framing: each pair reports its own monthly cash flow, and a
 * negative pair is named as a subsidy out of your own pocket — because that
 * is exactly what it is.
 */
import { CHECKS_PER_YEAR, isPayFrequency } from "@/lib/salary";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PassThroughSource {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  kind: string;
}

export interface PassThroughBill {
  id: string;
  name: string;
  amount: number;
  cadence: string;
  is_paused?: boolean;
  funded_by_income_id: string | null;
  split_ways?: number;
}

export interface PassThroughPair {
  incomeId: string;
  name: string;
  /** Income this source brings in per month. */
  monthlyIn: number;
  /** Bills linked to it, per month. */
  monthlyOut: number;
  /** monthlyIn − monthlyOut (negative = you subsidize it). */
  net: number;
  bills: { id: string; name: string; monthly: number }[];
}

export interface PassThroughSummary {
  pairs: PassThroughPair[];
  totalIn: number;
  totalOut: number;
  /** Combined net across every pair. */
  net: number;
  /** Pairs that cost more than they bring in, worst first. */
  underwater: PassThroughPair[];
}

/** Monthly value of a recurring bill (one-time bills aren't a standing pair). */
function billMonthly(b: PassThroughBill): number {
  const ways = Number(b.split_ways) >= 2 ? Number(b.split_ways) : 1;
  const amount = Number(b.amount) / ways;
  if (b.cadence === "monthly") return amount;
  if (b.cadence === "quarterly") return amount / 3;
  if (b.cadence === "yearly") return amount / 12;
  return 0;
}

/** Monthly value of an income source. */
export function incomeMonthly(s: PassThroughSource): number {
  if (s.frequency === "irregular") return 0;
  if (!isPayFrequency(s.frequency)) return 0;
  return (Number(s.amount) * CHECKS_PER_YEAR[s.frequency]) / 12;
}

export function passThroughSummary(
  sources: PassThroughSource[],
  bills: PassThroughBill[],
): PassThroughSummary | null {
  const linked = bills.filter((b) => b.funded_by_income_id && !b.is_paused);
  if (linked.length === 0) return null;

  const pairs: PassThroughPair[] = [];
  for (const src of sources) {
    const mine = linked.filter((b) => b.funded_by_income_id === src.id);
    if (mine.length === 0) continue;
    const monthlyIn = round2(incomeMonthly(src));
    const billRows = mine
      .map((b) => ({ id: b.id, name: b.name, monthly: round2(billMonthly(b)) }))
      .filter((b) => b.monthly > 0)
      .sort((a, b) => b.monthly - a.monthly);
    const monthlyOut = round2(billRows.reduce((s, b) => s + b.monthly, 0));
    pairs.push({
      incomeId: src.id,
      name: src.name,
      monthlyIn,
      monthlyOut,
      net: round2(monthlyIn - monthlyOut),
      bills: billRows,
    });
  }
  if (pairs.length === 0) return null;

  pairs.sort((a, b) => a.net - b.net); // worst first — the honest order
  const totalIn = round2(pairs.reduce((s, p) => s + p.monthlyIn, 0));
  const totalOut = round2(pairs.reduce((s, p) => s + p.monthlyOut, 0));
  return {
    pairs,
    totalIn,
    totalOut,
    net: round2(totalIn - totalOut),
    underwater: pairs.filter((p) => p.net < 0),
  };
}
