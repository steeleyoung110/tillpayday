/**
 * Short-check detector: when a logged paycheck lands noticeably below the
 * usual, say so immediately — hours got cut, a day went unpaid, whatever the
 * cause, the plan was built for a bigger number and something has to give.
 * Pure detection; the dashboard offers the one-tap fix (move fun money back
 * toward bills/savings for just this cycle).
 */
import type { IncomeEntry } from "@/lib/engine";

export interface ShortCheck {
  entryId: string;
  /** What actually landed. */
  amount: number;
  receivedDate: string;
  /** The paycheck the plan was built around. */
  typical: number;
  /** Dollars missing vs typical. */
  shortBy: number;
  /** amount as % of typical, rounded. */
  pct: number;
}

/**
 * The most recent non-windfall income entry logged this cycle (on/after
 * `lastPaydayISO`) that came in under `threshold` × typical. Null when
 * nothing qualifies — including when typical is unknown.
 */
export function detectShortCheck(
  entries: IncomeEntry[],
  typical: number,
  lastPaydayISO: string | null,
  todayISO: string,
  threshold = 0.9,
): ShortCheck | null {
  if (!(typical > 0) || !lastPaydayISO) return null;

  const candidates = entries
    .filter(
      (e) =>
        !e.isWindfall &&
        e.amount > 0 &&
        e.receivedDate >= lastPaydayISO &&
        e.receivedDate <= todayISO,
    )
    .sort((a, b) => (a.receivedDate < b.receivedDate ? 1 : -1));
  const latest = candidates[0];
  if (!latest) return null;
  if (latest.amount >= typical * threshold) return null;

  return {
    entryId: latest.id,
    amount: latest.amount,
    receivedDate: latest.receivedDate,
    typical,
    shortBy: Math.round((typical - latest.amount) * 100) / 100,
    pct: Math.round((latest.amount / typical) * 100),
  };
}
