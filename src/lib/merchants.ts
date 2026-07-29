/**
 * Merchant leaderboard: trailing-window one-time spends grouped by merchant.
 * Nobody feels $22 at a time; everybody feels the quarterly total. Store
 * numbers ("KROGER #221" vs "#354") collapse into one merchant.
 */

export interface SpendLike {
  name: string;
  amount: number;
  due_date: string; // YYYY-MM-DD (when it was spent)
  cadence: string;
  is_paused?: boolean;
}

export interface MerchantStat {
  /** Display name (from the biggest single spend in the group). */
  name: string;
  total: number;
  count: number;
}

/** Collapse store numbers, punctuation noise, and case for grouping. */
export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/#\s*\d+/g, "") // store numbers: "kroger #221"
    .replace(/\b\d{3,}\b/g, "") // bare location codes: "shell oil 1023"
    .replace(/[^a-z0-9&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One-time spends in (today − days, today], grouped by merchant, biggest
 * total first. Recurring bills are excluded — they have their own cards
 * (subscriptions, price creep); this is about where the swipes go.
 */
export function merchantLeaderboard(
  spends: SpendLike[],
  todayISO: string,
  days = 90,
  top = 8,
): MerchantStat[] {
  const cutoff = new Date(Date.parse(todayISO) - days * 86400000)
    .toISOString()
    .slice(0, 10);

  const groups = new Map<string, { total: number; count: number; biggest: number; name: string }>();
  for (const s of spends) {
    if (s.cadence !== "one_time" || s.is_paused) continue;
    if (s.due_date <= cutoff || s.due_date > todayISO) continue;
    const amount = Number(s.amount);
    if (!(amount > 0)) continue;
    const key = merchantKey(s.name);
    if (!key) continue;
    const g = groups.get(key) ?? { total: 0, count: 0, biggest: 0, name: s.name };
    g.total = Math.round((g.total + amount) * 100) / 100;
    g.count += 1;
    if (amount > g.biggest) {
      g.biggest = amount;
      g.name = s.name;
    }
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => ({ name: g.name, total: g.total, count: g.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, top);
}
