/**
 * Grow tab math (phase 10): compounding for and against you. Pure functions,
 * instant client-side, checked against closed-form formulas in tests.
 */

export interface CurvePoint {
  month: number;
  value: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// 10A — pay off a loan
// ---------------------------------------------------------------------------

export interface LoanResult {
  /** Months until the balance hits zero (null if it never does). */
  months: number | null;
  totalInterest: number;
  /** True when the payment doesn't even cover monthly interest. */
  neverPaysOff: boolean;
  /** Interest accrued in month one — what the payment must beat. */
  firstMonthInterest: number;
  /** Balance over time (month 0 = start). Capped for charting. */
  points: CurvePoint[];
}

const MAX_MONTHS = 600; // 50 years — beyond this we call it never

export function loanPayoff(
  balance: number,
  aprPercent: number,
  monthlyPayment: number,
  chartCapMonths = 120,
): LoanResult {
  const r = aprPercent / 100 / 12;
  const firstMonthInterest = round2(balance * r);
  const points: CurvePoint[] = [{ month: 0, value: round2(balance) }];

  if (balance <= 0) {
    return { months: 0, totalInterest: 0, neverPaysOff: false, firstMonthInterest, points };
  }
  if (monthlyPayment <= firstMonthInterest) {
    // The lesson some people need to see: the balance only grows from here.
    let bal = balance;
    for (let m = 1; m <= chartCapMonths; m += 1) {
      bal = bal + bal * r - monthlyPayment;
      points.push({ month: m, value: round2(bal) });
    }
    return {
      months: null,
      totalInterest: Infinity,
      neverPaysOff: true,
      firstMonthInterest,
      points,
    };
  }

  let bal = balance;
  let totalInterest = 0;
  let m = 0;
  while (bal > 0 && m < MAX_MONTHS) {
    m += 1;
    const interest = bal * r;
    totalInterest += interest;
    bal = bal + interest - Math.min(monthlyPayment, bal + interest);
    if (m <= chartCapMonths || bal <= 0) {
      points.push({ month: m, value: round2(Math.max(0, bal)) });
    }
  }
  return {
    months: m,
    totalInterest: round2(totalInterest),
    neverPaysOff: false,
    firstMonthInterest,
    points,
  };
}

// ---------------------------------------------------------------------------
// 10B — grow savings
// ---------------------------------------------------------------------------

export interface SavingsResult {
  ending: number;
  contributed: number;
  interestEarned: number;
  points: CurvePoint[];
}

export function savingsGrowth(
  start: number,
  monthlyContribution: number,
  apyPercent: number,
  years: number,
): SavingsResult {
  // APY is the effective annual yield — convert to the equivalent monthly rate.
  const r = Math.pow(1 + apyPercent / 100, 1 / 12) - 1;
  const months = Math.round(years * 12);
  const points: CurvePoint[] = [{ month: 0, value: round2(start) }];

  let bal = start;
  let contributed = start;
  for (let m = 1; m <= months; m += 1) {
    bal = bal * (1 + r) + monthlyContribution;
    contributed += monthlyContribution;
    points.push({ month: m, value: round2(bal) });
  }
  return {
    ending: round2(bal),
    contributed: round2(contributed),
    interestEarned: round2(bal - contributed),
    points,
  };
}

// ---------------------------------------------------------------------------
// 10C — pay off debt vs invest, same dollars head-to-head
// ---------------------------------------------------------------------------

export interface HeadToHeadResult {
  /** Net position (investments − remaining debt) over time, both paths. */
  debtFirst: CurvePoint[];
  investFirst: CurvePoint[];
  netDebtFirst: number;
  netInvestFirst: number;
  /** Which path is ahead at the horizon. */
  winner: "debt" | "invest" | "tie";
  winnerMargin: number;
  /** When the debt-first path clears the loan (null = not within horizon). */
  payoffMonth: number | null;
}

/**
 * Fair comparison: the same monthly budget in both paths — the loan's
 * first-month interest plus the extra. Debt-first sends everything beyond
 * interest at the shrinking balance (then invests the whole budget once the
 * loan dies); invest-first services interest forever and invests the extra.
 */
export function debtVsInvest(
  extraPerMonth: number,
  loanBalance: number,
  aprPercent: number,
  returnPercent: number,
  years: number,
): HeadToHeadResult {
  const months = Math.round(years * 12);
  const rLoan = aprPercent / 100 / 12;
  const rInvest = Math.pow(1 + returnPercent / 100, 1 / 12) - 1;
  const budget = loanBalance * rLoan + extraPerMonth;

  const debtFirst: CurvePoint[] = [{ month: 0, value: round2(-loanBalance) }];
  const investFirst: CurvePoint[] = [{ month: 0, value: round2(-loanBalance) }];

  let balA = loanBalance; // debt-first loan balance
  let invA = 0;
  let invB = 0; // invest-first: loan stays at loanBalance (interest serviced)
  let payoffMonth: number | null = null;

  for (let m = 1; m <= months; m += 1) {
    // Path A: interest first, remainder of the budget to principal/investing.
    if (balA > 0) {
      const interest = balA * rLoan;
      const toPrincipal = budget - interest;
      balA = Math.max(0, balA - toPrincipal);
      if (balA === 0 && payoffMonth === null) payoffMonth = m;
      invA = invA * (1 + rInvest);
    } else {
      invA = invA * (1 + rInvest) + budget;
    }
    // Path B: budget covers the (constant) interest; the extra invests.
    invB = invB * (1 + rInvest) + extraPerMonth;

    debtFirst.push({ month: m, value: round2(invA - balA) });
    investFirst.push({ month: m, value: round2(invB - loanBalance) });
  }

  const netDebtFirst = round2(invA - balA);
  const netInvestFirst = round2(invB - loanBalance);
  const margin = round2(Math.abs(netDebtFirst - netInvestFirst));
  return {
    debtFirst,
    investFirst,
    netDebtFirst,
    netInvestFirst,
    winner:
      margin < 1 ? "tie" : netDebtFirst > netInvestFirst ? "debt" : "invest",
    winnerMargin: margin,
    payoffMonth,
  };
}
