/**
 * Lazy-money detector: savings sitting at big-bank APY while high-yield
 * accounts pay ~4%. Uses the APY the user set on their own buckets (0 by
 * default — which IS the common reality).
 */

export const HYSA_REFERENCE_APY = 4;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface LazyMoneyRow {
  bucketId: string;
  name: string;
  balance: number;
  apy: number;
  earnsYearly: number;
  atReferenceYearly: number;
  missedYearly: number;
}

export function lazyMoney(
  buckets: { id: string; name: string; is_savings: boolean; rolls_over: boolean; apy: number; is_paused: boolean }[],
  balances: Record<string, number> | null,
  minBalance = 500,
): LazyMoneyRow[] {
  if (!balances) return [];
  const rows: LazyMoneyRow[] = [];
  for (const b of buckets) {
    if (b.is_paused) continue;
    if (!b.is_savings && !b.rolls_over) continue;
    const balance = Math.max(balances[b.is_savings ? "" : b.id] ?? 0, 0);
    const apy = Number(b.apy ?? 0);
    if (balance < minBalance || apy >= 1) continue;
    const earnsYearly = round2((balance * apy) / 100);
    const atReferenceYearly = round2((balance * HYSA_REFERENCE_APY) / 100);
    rows.push({
      bucketId: b.id,
      name: b.name,
      balance: round2(balance),
      apy,
      earnsYearly,
      atReferenceYearly,
      missedYearly: round2(atReferenceYearly - earnsYearly),
    });
  }
  return rows.sort((a, b) => b.missedYearly - a.missedYearly);
}
