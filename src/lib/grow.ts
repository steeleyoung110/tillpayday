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

export interface AmortRow {
  month: number;
  /** Slice of this month's payment that went to interest (the bank's cut). */
  interest: number;
  /** Slice that actually reduced the balance. */
  principal: number;
  /** Balance after the payment. */
  balance: number;
}

export interface AmortizationResult {
  /** Month-by-month payment split, capped at `capMonths` for charting. */
  schedule: AmortRow[];
  /** First month where more of the payment goes to principal than interest
   * (null when the loan never reaches that point). */
  crossoverMonth: number | null;
  totalInterest: number;
  totalPrincipal: number;
  months: number | null;
  neverPaysOff: boolean;
}

/**
 * Where each payment actually goes. Same simulation as loanPayoff, but keeps
 * the interest/principal split per month — early payments are mostly the
 * bank's, and the honest picture is watching that ratio flip (or not).
 */
export function amortize(
  balance: number,
  aprPercent: number,
  monthlyPayment: number,
  capMonths = MAX_MONTHS,
): AmortizationResult {
  const r = aprPercent / 100 / 12;
  const schedule: AmortRow[] = [];
  if (balance <= 0 || monthlyPayment <= 0) {
    return {
      schedule,
      crossoverMonth: null,
      totalInterest: 0,
      totalPrincipal: 0,
      months: balance <= 0 ? 0 : null,
      neverPaysOff: balance > 0,
    };
  }

  if (monthlyPayment <= round2(balance * r)) {
    // Payment doesn't clear the interest: every dollar of it IS interest,
    // principal never moves, and the balance still grows.
    let bal = balance;
    for (let m = 1; m <= Math.min(capMonths, 120); m += 1) {
      bal = bal + bal * r - monthlyPayment;
      schedule.push({ month: m, interest: monthlyPayment, principal: 0, balance: round2(bal) });
    }
    return {
      schedule,
      crossoverMonth: null,
      totalInterest: Infinity,
      totalPrincipal: 0,
      months: null,
      neverPaysOff: true,
    };
  }

  let bal = balance;
  let totalInterest = 0;
  let crossoverMonth: number | null = null;
  let m = 0;
  while (bal > 0 && m < MAX_MONTHS) {
    m += 1;
    const interest = bal * r;
    // Final payment is partial — never pay more than what's owed.
    const applied = Math.min(monthlyPayment, bal + interest);
    const principal = applied - interest;
    totalInterest += interest;
    bal = bal + interest - applied;
    if (crossoverMonth === null && principal > interest) crossoverMonth = m;
    if (m <= capMonths) {
      schedule.push({
        month: m,
        interest: round2(interest),
        principal: round2(principal),
        balance: round2(Math.max(0, bal)),
      });
    }
  }
  return {
    schedule,
    crossoverMonth,
    totalInterest: round2(totalInterest),
    totalPrincipal: round2(balance),
    months: m,
    neverPaysOff: false,
  };
}

/**
 * Extend a paid-off amortization schedule to a fixed horizon with $0 rows —
 * same idea as padCurve: the timeline stays pinned, so finishing early shows
 * months of nothing owed instead of the axis shrinking to hide the win.
 * Never-pays-off schedules are left alone (there is no "after").
 */
export function padSchedule(schedule: AmortRow[], horizonMonths: number): AmortRow[] {
  if (schedule.length === 0) return schedule;
  const last = schedule[schedule.length - 1];
  if (last.month >= horizonMonths || last.balance > 0) return schedule;
  const out = [...schedule];
  for (let m = last.month + 1; m <= horizonMonths; m += 1) {
    out.push({ month: m, interest: 0, principal: 0, balance: 0 });
  }
  return out;
}

/**
 * Extend a curve to a fixed horizon by holding its final value (a paid-off
 * loan stays flat at $0). Keeps the chart's timeline pinned so paying off
 * early LOOKS early instead of the axis shrinking to hide the win.
 */
export function padCurve(points: CurvePoint[], horizonMonths: number): CurvePoint[] {
  if (points.length === 0) return points;
  const last = points[points.length - 1];
  if (last.month >= horizonMonths) return points;
  const out = [...points];
  for (let m = last.month + 1; m <= horizonMonths; m += 1) {
    out.push({ month: m, value: last.value });
  }
  return out;
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
