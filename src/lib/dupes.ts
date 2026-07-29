/**
 * Duplicate-spend guard: two one-time spends with the same merchant, same
 * amount, same day — almost always a double-log, and double-logs quietly
 * poison every stat downstream. Flag the newer of each pair.
 */
import { merchantKey } from "@/lib/merchants";

export interface DupeCandidate {
  /** The row to offer removing (the later-created of the pair). */
  id: string;
  name: string;
  amount: number;
  date: string;
}

export function findDuplicateSpends(
  spends: {
    id: string;
    name: string;
    amount: number;
    due_date: string;
    cadence: string;
    is_paused?: boolean;
    created_at: string;
  }[],
  windowDays = 14,
  todayISO?: string,
): DupeCandidate[] {
  const cutoff = todayISO
    ? new Date(Date.parse(todayISO) - windowDays * 86400000).toISOString().slice(0, 10)
    : null;
  const byKey = new Map<string, typeof spends>();
  for (const s of spends) {
    if (s.cadence !== "one_time" || s.is_paused) continue;
    if (cutoff && s.due_date < cutoff) continue;
    // Harder normalization than the leaderboard: "McDonald's" vs "MCDONALDS"
    // is the same double-log.
    const key = `${merchantKey(s.name).replace(/[^a-z0-9]/g, "")}|${Number(s.amount)}|${s.due_date}`;
    const list = byKey.get(key) ?? [];
    list.push(s);
    byKey.set(key, list);
  }
  const dupes: DupeCandidate[] = [];
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    for (const extra of sorted.slice(1)) {
      dupes.push({
        id: extra.id,
        name: extra.name,
        amount: Number(extra.amount),
        date: extra.due_date,
      });
    }
  }
  return dupes;
}
