/**
 * Goal priority ladder: one savings pot honestly serving several goals.
 * Savings is earmarked down the ladder (soonest target date first), so
 * three goals can't all claim the same dollars. Fixes the double-counting
 * where every goal's progress bar showed the full savings balance.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface GoalEarmark {
  goalId: string;
  /** Dollars of the pool assigned to this goal (0..target). */
  earmarked: number;
  /** earmarked / target as 0–100. */
  pct: number;
  fullyCovered: boolean;
}

export function earmarkGoals(
  savingsNow: number,
  goals: { id: string; target_amount: number; target_date: string }[],
): Map<string, GoalEarmark> {
  const ladder = [...goals].sort((a, b) =>
    a.target_date < b.target_date ? -1 : a.target_date > b.target_date ? 1 : 0,
  );
  let pool = Math.max(savingsNow, 0);
  const out = new Map<string, GoalEarmark>();
  for (const g of ladder) {
    const target = Math.max(Number(g.target_amount), 0);
    const earmarked = round2(Math.min(pool, target));
    pool = round2(pool - earmarked);
    out.set(g.id, {
      goalId: g.id,
      earmarked,
      pct: target > 0 ? Math.min(100, Math.round((earmarked / target) * 100)) : 100,
      fullyCovered: earmarked >= target - 0.005,
    });
  }
  return out;
}
