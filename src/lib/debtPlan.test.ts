import { describe, expect, it } from "vitest";
import { compareStrategies, planDebts, type PlanDebt } from "./debtPlan";
import { amortize } from "./grow";

const debt = (id: string, balance: number, apr: number, min: number): PlanDebt => ({
  id,
  name: id,
  balance,
  aprPercent: apr,
  minPayment: min,
});

describe("planDebts", () => {
  it("a single debt matches the amortization engine's month count and interest", () => {
    const plan = planDebts([debt("car", 10000, 10, 300)], 0, "avalanche");
    const ref = amortize(10000, 10, 300);
    expect(plan.months).toBe(ref.months);
    expect(plan.totalInterest).toBeCloseTo(ref.totalInterest, 0);
  });

  it("snowball targets the smallest balance; avalanche's targeting shows up as less interest", () => {
    const debts = [
      debt("big-cheap", 8000, 5, 200),
      debt("small-expensive", 2000, 24, 50),
    ];
    const snow = planDebts(debts, 100, "snowball");
    const aval = planDebts(debts, 100, "avalanche");
    // Here smallest balance IS the highest rate — both strategies kill it first.
    expect(snow.order[0].id).toBe("small-expensive");
    expect(aval.order[0].id).toBe("small-expensive");

    // When they disagree, the death ORDER can match (a small cheap debt
    // still self-destructs via its own minimum) — the targeting difference
    // shows up where it matters: avalanche pays less interest, sooner.
    const debts2 = [
      debt("small-cheap", 1000, 3, 50),
      debt("big-expensive", 9000, 24, 200),
    ];
    const snow2 = planDebts(debts2, 100, "snowball");
    const aval2 = planDebts(debts2, 100, "avalanche");
    expect(snow2.order[0].id).toBe("small-cheap");
    expect(aval2.totalInterest).toBeLessThan(snow2.totalInterest);
    expect(aval2.months!).toBeLessThanOrEqual(snow2.months!);
  });

  it("a dead debt's payment rolls into the next target (debt-free date beats no-extra math)", () => {
    const debts = [debt("a", 1000, 12, 100), debt("b", 5000, 12, 100)];
    const plan = planDebts(debts, 0, "avalanche");
    // Without rollover, b alone at $100/mo would take ~62 months; with a's
    // $100 rolling in after ~month 11, the whole thing finishes far sooner.
    expect(plan.months).not.toBeNull();
    expect(plan.months!).toBeLessThan(45);
  });

  it("flags never-pays-off when the budget can't beat the interest", () => {
    // $10k at 24% accrues $200/mo; $150 total budget loses ground forever.
    const plan = planDebts([debt("visa", 10000, 24, 150)], 0, "snowball");
    expect(plan.neverPaysOff).toBe(true);
    expect(plan.months).toBeNull();
    expect(plan.totalInterest).toBe(Infinity);
  });

  it("no debts means already free", () => {
    const plan = planDebts([], 100, "snowball");
    expect(plan.months).toBe(0);
    expect(plan.neverPaysOff).toBe(false);
  });
});

describe("compareStrategies", () => {
  it("avalanche never pays more interest than snowball", () => {
    const debts = [
      debt("small-cheap", 1000, 3, 50),
      debt("big-expensive", 9000, 24, 200),
    ];
    const cmp = compareStrategies(debts, 150);
    expect(cmp.avalanche.totalInterest).toBeLessThanOrEqual(cmp.snowball.totalInterest);
    expect(cmp.snowballCosts).toBeGreaterThan(0); // the feel-good order has a price here
  });

  it("identical-rate debts make the strategies a tie", () => {
    const debts = [debt("a", 2000, 10, 60), debt("b", 6000, 10, 150)];
    const cmp = compareStrategies(debts, 100);
    expect(cmp.snowballCosts).toBeLessThan(5); // rounding noise at most
  });
});
