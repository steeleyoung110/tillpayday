/**
 * "Can I afford it?" — the 5-second gut check. Given a price and the money
 * picture the dashboard already computes (flexible balance, savings, the
 * projected low point before payday), return a straight verdict:
 *
 *   yes   — fits in flexible money and the low point survives
 *   tight — fits, but drains flexible money and dips into savings
 *   no    — either you don't have it, or spending it drives the danger-day
 *           low below zero (money you don't have yet gets spent by a bill)
 *
 * Pure and blunt. The UI adds the wording; this decides.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type AffordAnswer = "yes" | "tight" | "no";

export interface AffordInput {
  price: number;
  /** What's sitting in flexible buckets right now. */
  flexibleBalance: number;
  /** Whole days until the next paycheck (≥ 1). */
  daysUntilPayday: number;
  /** Savings balance right now (may be negative). */
  savingsBalance: number;
  /** Projected lowest total before payday (null = unknown). */
  dangerLow: number | null;
  /** The day that low lands (null = unknown). */
  dangerDate: string | null;
}

export interface AffordVerdict {
  answer: AffordAnswer;
  /** Flexible money left after the purchase (floored at what's there). */
  remainingFlexible: number;
  /** New per-day safe-to-spend after the purchase (yes/tight only). */
  newPerDay: number;
  /** How much of the price spills out of flexible money into savings. */
  savingsDip: number;
  /** For "no" by shortage: dollars you simply don't have. */
  shortBy: number;
  /** Projected low point after the purchase (null = unknown). */
  dangerAfter: number | null;
  /** True when the "no" is because the low point goes negative. */
  breaksDangerDay: boolean;
}

export function canIAfford(input: AffordInput): AffordVerdict | null {
  const { price, flexibleBalance, daysUntilPayday, savingsBalance, dangerLow } = input;
  if (!(price > 0)) return null;

  const spendableSavings = Math.max(savingsBalance, 0);
  const available = round2(flexibleBalance + spendableSavings);
  const dangerAfter = dangerLow === null ? null : round2(dangerLow - price);
  const remainingFlexible = round2(Math.max(flexibleBalance - price, 0));
  const savingsDip = round2(Math.max(price - Math.max(flexibleBalance, 0), 0));
  const days = Math.max(daysUntilPayday, 1);
  const newPerDay = Math.floor((remainingFlexible / days) * 100) / 100;

  if (price > available) {
    return {
      answer: "no",
      remainingFlexible,
      newPerDay,
      savingsDip,
      shortBy: round2(price - available),
      dangerAfter,
      breaksDangerDay: false,
    };
  }

  if (dangerAfter !== null && dangerAfter < 0) {
    return {
      answer: "no",
      remainingFlexible,
      newPerDay,
      savingsDip,
      shortBy: 0,
      dangerAfter,
      breaksDangerDay: true,
    };
  }

  return {
    answer: price <= flexibleBalance ? "yes" : "tight",
    remainingFlexible,
    newPerDay,
    savingsDip,
    shortBy: 0,
    dangerAfter,
    breaksDangerDay: false,
  };
}
