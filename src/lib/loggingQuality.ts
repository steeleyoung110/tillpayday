/**
 * Round-number bias: real receipts almost never end in .00. When most of
 * your logged spends are whole dollars, you're estimating — and estimates
 * drift the same direction every time: down. Plus savings velocity: the
 * honest pace your kept-money accumulates.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface RoundBias {
  wholeCount: number;
  total: number;
  /** % of logs that are whole dollars. */
  pct: number;
  /** True when it looks like estimating (≥60% whole, 10+ samples). */
  suspicious: boolean;
}

export function roundNumberBias(
  spends: { amount: number; cadence: string; due_date: string; is_paused?: boolean }[],
  todayISO: string,
  windowDays = 90,
): RoundBias | null {
  const cutoff = new Date(Date.parse(todayISO) - windowDays * 86400000)
    .toISOString()
    .slice(0, 10);
  const rows = spends.filter(
    (s) =>
      s.cadence === "one_time" &&
      !s.is_paused &&
      Number(s.amount) > 0 &&
      s.due_date > cutoff &&
      s.due_date <= todayISO,
  );
  if (rows.length < 10) return null;
  const wholeCount = rows.filter((s) => Number(s.amount) % 1 === 0).length;
  const pct = Math.round((wholeCount / rows.length) * 100);
  return { wholeCount, total: rows.length, pct, suspicious: pct >= 60 };
}

export interface SavingsVelocity {
  /** Average kept per completed cycle. */
  keptPerCycle: number;
  cyclesSampled: number;
  /** Cycles until the next $1,000 accumulates (null = not accumulating). */
  cyclesToNextThousand: number | null;
}

export function savingsVelocity(
  cycles: { paycheckTotal: number; totalActual: number }[],
  sample = 4,
): SavingsVelocity | null {
  const recent = cycles.slice(0, sample);
  if (recent.length < 2) return null;
  const keptPerCycle = round2(
    recent.reduce((s, c) => s + (c.paycheckTotal - c.totalActual), 0) / recent.length,
  );
  return {
    keptPerCycle,
    cyclesSampled: recent.length,
    cyclesToNextThousand:
      keptPerCycle > 0 ? Math.ceil(1000 / keptPerCycle) : null,
  };
}
