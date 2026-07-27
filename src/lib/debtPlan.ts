/**
 * Snowball vs avalanche, head to head on your real debts. Same total budget
 * every month (all minimums + your extra); when a debt dies its payment
 * rolls into the next target. The only difference is targeting order:
 *   - snowball: smallest balance first (quick wins, feels good)
 *   - avalanche: highest rate first (mathematically cheapest)
 * Honest output: what the feel-good order actually costs.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const MAX_MONTHS = 600;

export interface PlanDebt {
  id: string;
  name: string;
  balance: number;
  aprPercent: number;
  minPayment: number;
}

export interface PayoffEvent {
  id: string;
  name: string;
  /** Months from now when this debt hits zero. */
  month: number;
}

export interface StrategyResult {
  strategy: "snowball" | "avalanche";
  /** Debts in the order they die. */
  order: PayoffEvent[];
  /** Months until everything is gone (null = never at this budget). */
  months: number | null;
  totalInterest: number;
  neverPaysOff: boolean;
}

/** Next target among live debts for a strategy. */
function pickTarget(
  debts: { balance: number; aprPercent: number; idx: number }[],
  strategy: "snowball" | "avalanche",
): number {
  const alive = debts.filter((d) => d.balance > 0);
  alive.sort((a, b) =>
    strategy === "snowball"
      ? a.balance - b.balance || a.idx - b.idx
      : b.aprPercent - a.aprPercent || a.idx - b.idx,
  );
  return alive[0]?.idx ?? -1;
}

export function planDebts(
  input: PlanDebt[],
  extraPerMonth: number,
  strategy: "snowball" | "avalanche",
): StrategyResult {
  const debts = input
    .filter((d) => d.balance > 0)
    .map((d, idx) => ({ ...d, idx, balance: d.balance }));
  if (debts.length === 0) {
    return { strategy, order: [], months: 0, totalInterest: 0, neverPaysOff: false };
  }

  // The monthly budget is constant: every minimum plus the extra. As debts
  // die, their share rolls into the current target automatically.
  const budget = round2(
    debts.reduce((s, d) => s + d.minPayment, 0) + extraPerMonth,
  );

  const order: PayoffEvent[] = [];
  let totalInterest = 0;

  for (let m = 1; m <= MAX_MONTHS; m += 1) {
    // Accrue this month's interest on every live balance.
    for (const d of debts) {
      if (d.balance <= 0) continue;
      const interest = (d.balance * d.aprPercent) / 100 / 12;
      d.balance = round2(d.balance + interest);
      totalInterest = round2(totalInterest + interest);
    }

    // Pay minimums on every live debt, then everything left to the target.
    let available = budget;
    for (const d of debts) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.minPayment, d.balance, available);
      d.balance = round2(d.balance - pay);
      available = round2(available - pay);
    }
    const targetIdx = pickTarget(debts, strategy);
    if (targetIdx >= 0 && available > 0) {
      const t = debts[targetIdx];
      const pay = Math.min(available, t.balance);
      t.balance = round2(t.balance - pay);
    }

    for (const d of debts) {
      if (d.balance <= 0 && !order.some((o) => o.id === d.id)) {
        order.push({ id: d.id, name: d.name, month: m });
      }
    }
    if (debts.every((d) => d.balance <= 0)) {
      return {
        strategy,
        order,
        months: m,
        totalInterest: round2(totalInterest),
        neverPaysOff: false,
      };
    }
  }

  return { strategy, order, months: null, totalInterest: Infinity, neverPaysOff: true };
}

export interface StrategyComparison {
  snowball: StrategyResult;
  avalanche: StrategyResult;
  /** Extra interest the snowball order costs vs avalanche (0 when equal). */
  snowballCosts: number;
  /** Extra months the snowball order takes vs avalanche (0 when equal). */
  snowballExtraMonths: number;
}

export function compareStrategies(
  debts: PlanDebt[],
  extraPerMonth: number,
): StrategyComparison {
  const snowball = planDebts(debts, extraPerMonth, "snowball");
  const avalanche = planDebts(debts, extraPerMonth, "avalanche");
  const bothFinish = !snowball.neverPaysOff && !avalanche.neverPaysOff;
  return {
    snowball,
    avalanche,
    snowballCosts: bothFinish
      ? round2(Math.max(0, snowball.totalInterest - avalanche.totalInterest))
      : 0,
    snowballExtraMonths: bothFinish
      ? Math.max(0, (snowball.months ?? 0) - (avalanche.months ?? 0))
      : 0,
  };
}
