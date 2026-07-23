import { describe, expect, it } from "vitest";
import { debtVsInvest, loanPayoff, padCurve, savingsGrowth } from "./grow";

describe("padCurve", () => {
  it("holds the final value out to the horizon (paid-off loans stay at $0)", () => {
    const paidOff = loanPayoff(10000, 10, 400); // ~28 months
    const padded = padCurve(paidOff.points, 40);
    expect(padded[padded.length - 1]).toEqual({ month: 40, value: 0 });
    // Every padded month sits at zero — the visible "freedom" tail.
    const tail = padded.filter((p) => p.month > paidOff.months!);
    expect(tail.every((p) => p.value === 0)).toBe(true);
  });

  it("leaves curves alone when they already reach the horizon", () => {
    const res = loanPayoff(10000, 10, 300);
    expect(padCurve(res.points, 10)).toEqual(res.points);
  });
});

describe("loanPayoff", () => {
  it("matches the closed-form payoff month count", () => {
    // n = -log(1 - rB/P) / log(1+r), rounded up.
    const B = 10000, apr = 10, P = 300;
    const r = apr / 100 / 12;
    const closedForm = Math.ceil(-Math.log(1 - (r * B) / P) / Math.log(1 + r));
    const sim = loanPayoff(B, apr, P);
    expect(sim.months).toBe(closedForm); // 37 months
    expect(sim.neverPaysOff).toBe(false);
  });

  it("computes total interest that reconciles with total paid", () => {
    const B = 5000, apr = 18, P = 250;
    const res = loanPayoff(B, apr, P);
    // Total paid = balance + interest; last payment is partial, so total paid
    // is between (months-1)*P and months*P.
    const totalPaid = B + res.totalInterest;
    expect(totalPaid).toBeGreaterThan((res.months! - 1) * P);
    expect(totalPaid).toBeLessThanOrEqual(res.months! * P + 0.01);
  });

  it("a higher rate on the same loan costs more interest and more months", () => {
    const at8 = loanPayoff(10000, 8, 300);
    const at10 = loanPayoff(10000, 10, 300);
    expect(at10.totalInterest).toBeGreaterThan(at8.totalInterest);
    expect(at10.months!).toBeGreaterThanOrEqual(at8.months!);
  });

  it("flags the never-pays-off edge: payment below monthly interest", () => {
    // $10,000 at 24% = $200/month interest; paying $150 loses ground forever.
    const res = loanPayoff(10000, 24, 150);
    expect(res.neverPaysOff).toBe(true);
    expect(res.months).toBeNull();
    expect(res.firstMonthInterest).toBe(200);
    // The chart shows the balance GROWING — the whole lesson.
    expect(res.points[res.points.length - 1].value).toBeGreaterThan(10000);
  });

  it("extra payments shorten the loan and cut interest", () => {
    const base = loanPayoff(10000, 10, 300);
    const extra = loanPayoff(10000, 10, 350);
    expect(extra.months!).toBeLessThan(base.months!);
    expect(extra.totalInterest).toBeLessThan(base.totalInterest);
  });
});

describe("savingsGrowth", () => {
  it("matches the closed-form future value", () => {
    const start = 1000, monthly = 200, apy = 3, years = 10;
    const r = Math.pow(1 + apy / 100, 1 / 12) - 1;
    const n = years * 12;
    const closedForm =
      start * Math.pow(1 + r, n) + monthly * ((Math.pow(1 + r, n) - 1) / r);
    const sim = savingsGrowth(start, monthly, apy, years);
    expect(sim.ending).toBeCloseTo(closedForm, 1);
  });

  it("the better rate earns more on identical deposits", () => {
    const hy = savingsGrowth(1000, 200, 3, 10);
    const std = savingsGrowth(1000, 200, 0.4, 10);
    expect(hy.contributed).toBe(std.contributed); // same deposits
    expect(hy.ending).toBeGreaterThan(std.ending);
    expect(hy.interestEarned).toBeGreaterThan(std.interestEarned);
  });

  it("zero rate is just the deposits", () => {
    const res = savingsGrowth(500, 100, 0, 2);
    expect(res.ending).toBe(500 + 100 * 24);
    expect(res.interestEarned).toBe(0);
  });
});

describe("debtVsInvest", () => {
  it("high-APR debt beats the assumed return — kill it first", () => {
    const res = debtVsInvest(200, 8000, 24, 7, 10);
    expect(res.winner).toBe("debt");
    expect(res.payoffMonth).not.toBeNull();
  });

  it("cheap debt loses to a higher assumed return over time", () => {
    const res = debtVsInvest(200, 8000, 3, 8, 20);
    expect(res.winner).toBe("invest");
  });

  it("both paths start from the same net position and spend the same budget", () => {
    const res = debtVsInvest(150, 5000, 12, 6, 10);
    expect(res.debtFirst[0].value).toBe(res.investFirst[0].value);
    expect(res.debtFirst[0].value).toBe(-5000);
  });

  it("crossover: the winner is genuinely ahead at the horizon", () => {
    const res = debtVsInvest(200, 8000, 24, 7, 10);
    expect(res.netDebtFirst).toBeGreaterThan(res.netInvestFirst);
    expect(res.winnerMargin).toBeCloseTo(
      Math.abs(res.netDebtFirst - res.netInvestFirst),
      2,
    );
  });

  it("identical rates land close to a tie", () => {
    const res = debtVsInvest(200, 8000, 6, 6, 10);
    // Same rate on both sides: the two paths track each other closely.
    expect(Math.abs(res.netDebtFirst - res.netInvestFirst)).toBeLessThan(
      0.01 * Math.abs(res.netDebtFirst),
    );
  });
});
