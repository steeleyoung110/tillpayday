/**
 * Debt milestones: progress measured from your PEAK debt (from snapshot
 * history) down to zero, with 25/50/75% markers. Payoff is a years-long
 * grind — the milestones are the wins along the way.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface DebtProgress {
  peak: number;
  current: number;
  /** % of the peak already paid off (0–100). */
  paidPct: number;
  /** Next milestone not yet reached (null when debt-free). */
  nextMilestonePct: number | null;
  /** Balance at which the next milestone triggers. */
  nextMilestoneBalance: number | null;
  /** Milestones already crossed (e.g. [25, 50]). */
  crossed: number[];
}

export function debtProgress(
  snapshots: { total_liabilities: number }[],
  currentTotal: number,
): DebtProgress | null {
  const peak = Math.max(currentTotal, ...snapshots.map((s) => Number(s.total_liabilities)), 0);
  if (!(peak > 0)) return null;

  const current = Math.max(currentTotal, 0);
  const paidPct = Math.max(0, Math.min(100, Math.round(((peak - current) / peak) * 100)));

  const milestones = [25, 50, 75, 100];
  const crossed = milestones.filter((m) => paidPct >= m);
  const next = milestones.find((m) => paidPct < m) ?? null;

  return {
    peak: round2(peak),
    current: round2(current),
    paidPct,
    nextMilestonePct: next,
    nextMilestoneBalance: next === null ? null : round2(peak * (1 - next / 100)),
    crossed,
  };
}
