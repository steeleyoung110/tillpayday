/**
 * Net-worth milestone forecast: fit a straight line through your snapshot
 * history and name the dates you cross the next milestones — including $0,
 * which for anyone starting negative is THE date. Honest framing baked in:
 * it's "at your recent pace", and a flat-or-falling line says so instead of
 * inventing a date.
 */

const MILESTONES = [
  0, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
];

export interface NwCrossing {
  amount: number;
  date: string; // YYYY-MM-DD
}

export interface NwForecast {
  /** Dollars per day, from a least-squares fit over the snapshots. */
  slopePerDay: number;
  /** Days between first and last snapshot used. */
  windowDays: number;
  current: number;
  /** Next milestones ahead at this pace (up to 2, within the horizon). */
  crossings: NwCrossing[];
  /** Pace is flat or negative — no crossing dates are invented. */
  flatOrFalling: boolean;
}

export function nwForecast(
  snapshots: { snapshot_date: string; net_worth: number }[],
  todayISO: string,
  horizonYears = 5,
): NwForecast | null {
  const pts = [...snapshots]
    .sort((a, b) => (a.snapshot_date < b.snapshot_date ? -1 : 1))
    .map((s) => ({
      x: Date.parse(s.snapshot_date) / 86400000,
      y: Number(s.net_worth),
    }));
  if (pts.length < 3) return null;
  const windowDays = Math.round(pts[pts.length - 1].x - pts[0].x);
  if (windowDays < 21) return null;

  const n = pts.length;
  const meanX = pts.reduce((s, p) => s + p.x, 0) / n;
  const meanY = pts.reduce((s, p) => s + p.y, 0) / n;
  const slope =
    pts.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0) /
    pts.reduce((s, p) => s + (p.x - meanX) ** 2, 0);

  const current = pts[n - 1].y;
  const slopePerDay = Math.round(slope * 100) / 100;
  const flatOrFalling = slopePerDay <= 0.01;

  const crossings: NwCrossing[] = [];
  if (!flatOrFalling) {
    const todayMs = Date.parse(todayISO);
    const horizonMs = todayMs + horizonYears * 365.25 * 86400000;
    for (const m of MILESTONES) {
      if (m <= current) continue;
      const days = (m - current) / slopePerDay;
      const when = todayMs + days * 86400000;
      if (when > horizonMs) break;
      crossings.push({ amount: m, date: new Date(when).toISOString().slice(0, 10) });
      if (crossings.length === 2) break;
    }
  }

  return {
    slopePerDay,
    windowDays,
    current: Math.round(current * 100) / 100,
    crossings,
    flatOrFalling,
  };
}
