/**
 * Net Worth module math (phase 9) — pure and unit-tested. The server actions
 * and UI lean on these; the database only stores what these compute.
 */
import { addMonths, parseISO } from "@/lib/engine";

export interface AssetLike {
  current_value: number | string;
  is_archived: boolean;
}
export interface LiabilityLike {
  current_balance: number | string;
  is_archived: boolean;
}
export interface SnapshotLike {
  snapshot_date: string; // YYYY-MM-DD
  net_worth: number | string;
}

export interface NetWorthTotals {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Current totals. Archived items keep their history but count for nothing.
 * `bridgeValue` is the opt-in budget-savings asset (9D); pass 0 when off.
 */
export function computeTotals(
  assets: AssetLike[],
  liabilities: LiabilityLike[],
  bridgeValue = 0,
): NetWorthTotals {
  const totalAssets = round2(
    assets
      .filter((a) => !a.is_archived)
      .reduce((s, a) => s + Number(a.current_value), 0) + Math.max(0, bridgeValue),
  );
  const totalLiabilities = round2(
    liabilities
      .filter((l) => !l.is_archived)
      .reduce((s, l) => s + Number(l.current_balance), 0),
  );
  return {
    totalAssets,
    totalLiabilities,
    netWorth: round2(totalAssets - totalLiabilities),
  };
}

/** Snapshots inside the last `months` months, oldest first. */
export function filterHorizon(
  snapshots: SnapshotLike[],
  months: number,
  todayISO: string,
): SnapshotLike[] {
  const cutoff = addMonths(parseISO(todayISO), -months);
  return [...snapshots]
    .filter((s) => parseISO(s.snapshot_date) >= cutoff)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
}

export interface SnapshotDeltas {
  /** Change vs the closest snapshot at least ~a month back (null if none). */
  sinceLastMonth: number | null;
  /** Change vs the very first snapshot ever (null with fewer than 2). */
  sinceStart: number | null;
  /** Date of that first snapshot, for "since January" phrasing. */
  startDate: string | null;
}

/** "Up $3,200 since January" material. */
export function snapshotDeltas(
  snapshots: SnapshotLike[],
  todayISO: string,
): SnapshotDeltas {
  const sorted = [...snapshots].sort((a, b) =>
    a.snapshot_date.localeCompare(b.snapshot_date),
  );
  if (sorted.length < 2) {
    return { sinceLastMonth: null, sinceStart: null, startDate: null };
  }
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];

  const monthAgo = addMonths(parseISO(todayISO), -1);
  // The most recent snapshot on or before one month ago.
  const monthRef = [...sorted]
    .reverse()
    .find((s) => parseISO(s.snapshot_date) <= monthAgo);

  return {
    sinceLastMonth: monthRef
      ? round2(Number(latest.net_worth) - Number(monthRef.net_worth))
      : null,
    sinceStart: round2(Number(latest.net_worth) - Number(first.net_worth)),
    startDate: first.snapshot_date,
  };
}
