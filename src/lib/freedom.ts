/**
 * Financial freedom %: FIRE-lite. Your bills define your freedom number —
 * the invested pile whose 4%/yr safely covers them — and your investable
 * net worth is some percentage of the way there. Brutal at first glance,
 * which is the point: it turns net worth into a number with meaning.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const SAFE_WITHDRAWAL_RATE = 0.04;

export interface FreedomStatus {
  /** Invested dollars whose 4%/yr covers the bills forever. */
  freedomNumber: number;
  /** How far along the pile is, 0–100+ (can exceed 100). */
  pct: number;
  /** What the current pile covers per month at 4%/yr. */
  coveredMonthly: number;
  monthlyBills: number;
  investable: number;
}

export function freedomStatus(
  monthlyBills: number,
  investable: number,
): FreedomStatus | null {
  if (!(monthlyBills > 0)) return null;
  const freedomNumber = round2((monthlyBills * 12) / SAFE_WITHDRAWAL_RATE);
  const held = Math.max(investable, 0);
  return {
    freedomNumber,
    pct: Math.round((held / freedomNumber) * 1000) / 10,
    coveredMonthly: round2((held * SAFE_WITHDRAWAL_RATE) / 12),
    monthlyBills: round2(monthlyBills),
    investable: round2(held),
  };
}
