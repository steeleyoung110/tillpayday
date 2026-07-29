/**
 * Emergency fund builder: runway says how long you'd last — this is the fix.
 * Target = N months of your REAL bill load (computed from the bills you
 * actually entered, not a made-up number), then the per-check math to close
 * the gap.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface BillLike {
  amount: number;
  cadence: string; // one_time | monthly | quarterly | yearly
  is_paused?: boolean;
}

/** Recurring bills normalized to a monthly load. One-time spends excluded. */
export function monthlyBillLoad(bills: BillLike[]): number {
  let total = 0;
  for (const b of bills) {
    if (b.is_paused) continue;
    const amount = Number(b.amount);
    if (!(amount > 0)) continue;
    if (b.cadence === "monthly") total += amount;
    else if (b.cadence === "quarterly") total += amount / 3;
    else if (b.cadence === "yearly") total += amount / 12;
  }
  return round2(total);
}

export interface EfundStatus {
  /** Dollars needed for `targetMonths` months of bills. */
  target: number;
  /** Dollars still missing (0 when funded). */
  gap: number;
  /** Progress toward target, 0–100. */
  pct: number;
  /** How many months of bills the current liquid covers. */
  monthsCovered: number;
}

export function efundStatus(
  monthlyLoad: number,
  targetMonths: number,
  liquid: number,
): EfundStatus | null {
  if (!(monthlyLoad > 0) || !(targetMonths > 0)) return null;
  const target = round2(monthlyLoad * targetMonths);
  const held = Math.max(liquid, 0);
  return {
    target,
    gap: round2(Math.max(target - held, 0)),
    pct: Math.min(100, Math.round((held / target) * 100)),
    monthsCovered: Math.round((held / monthlyLoad) * 10) / 10,
  };
}

/** Checks needed to close `gap` at `perCheck` per paycheck (0 = already there). */
export function checksToTarget(gap: number, perCheck: number): number | null {
  if (gap <= 0) return 0;
  if (!(perCheck > 0)) return null;
  return Math.ceil(gap / perCheck);
}
