/**
 * Regression tests for the side-income fix: rental income is real income.
 * Modeled on the real report that surfaced this — a semimonthly paycheck plus
 * two monthly rents, with both mortgages drawing from savings.
 */
import { describe, expect, it } from "vitest";
import { billsByCheck, dangerDay, monthGrid } from "./engine";
import { freedomDay } from "./freedomDay";
import { incomeMonthly, passThroughSummary } from "./passThrough";
import { auditSubscriptions } from "./subscriptions";
import { monthlySavingsRate } from "./spendViz";
import { yearWrapped } from "./yearWrapped";
import type { Bucket, Expense, IncomeSource } from "./engine";

const TODAY = "2026-08-03";

const income: IncomeSource[] = [
  { id: "job", name: "Copart", amount: 2337.5, frequency: "semimonthly", kind: "paycheck", anchorDate: "2026-08-07" },
  { id: "rent-a", name: "Concord Rent", amount: 2250, frequency: "monthly", kind: "side", anchorDate: "2026-07-01" },
  { id: "rent-b", name: "Rochester Rent", amount: 1600, frequency: "monthly", kind: "side", anchorDate: "2026-07-01" },
];
const buckets: Bucket[] = [
  { id: "bills", name: "Bills", allocationType: "percent", allocationValue: 50, isSavings: false, priority: 0 },
  { id: "life", name: "Life", allocationType: "percent", allocationValue: 30, isSavings: false, isFlexible: true, priority: 1 },
  { id: "save", name: "Savings", allocationType: "percent", allocationValue: 0, isSavings: true, priority: 2 },
];
// Both mortgages draw from savings (bucketId null), as entered in the report.
const expenses: Expense[] = [
  { id: "m-a", name: "Concord Mortgage", amount: 1200, bucketId: null, dueDate: "2026-07-29", cadence: "monthly" },
  { id: "m-b", name: "Rochester Mortgage", amount: 3200, bucketId: null, dueDate: "2026-07-29", cadence: "monthly" },
];

describe("side income counts as income", () => {
  it("Freedom Day uses ALL scheduled income, not just the paycheck", () => {
    const f = freedomDay(income, expenses, TODAY)!;
    // August: 2 paychecks (4,675) + 2 rents (3,850) = 8,525 in; 4,400 of bills.
    expect(f.monthIncome).toBe(8525);
    expect(f.monthBills).toBe(4400);
    expect(f.neverFree).toBe(false);
    // Bills are 52% of income → free about halfway through the month, not the 29th.
    expect(f.day).toBeLessThanOrEqual(17);
  });

  it("the money calendar shows rent inflows, separate from paychecks", () => {
    const weeks = monthGrid(income, expenses, 2026, 8, TODAY);
    const days = weeks.flat();
    const aug1 = days.find((d) => d.date === "2026-08-01")!;
    const aug15 = days.find((d) => d.date === "2026-08-15")!;
    const aug20 = days.find((d) => d.date === "2026-08-20")!;
    // Both rents land on the 1st; semimonthly pay lands the 1st and 15th.
    expect(aug1.sideTotal).toBe(3850);
    expect(aug1.paydayTotal).toBe(2337.5);
    expect(aug15.paydayTotal).toBe(2337.5);
    expect(aug15.sideTotal).toBe(0);
    expect(aug20.sideTotal).toBe(0);
  });

  it("check coverage credits side income, prorated across the window", () => {
    const groups = billsByCheck(income, buckets, expenses, TODAY, 2);
    const withMortgages = groups.find((g) => g.totalBills > 0)!;
    // ~half a month of $3,850/mo rent lands against this window.
    expect(withMortgages.sideTotal).toBeGreaterThan(1500);
    expect(withMortgages.incomeTotal).toBe(
      Math.round((withMortgages.paycheckTotal + withMortgages.sideTotal) * 100) / 100,
    );
    // Before the fix this window read "short by $2,062.50" — the whole
    // mortgage load minus one paycheck.
    expect(withMortgages.shortBy).toBeLessThan(4400 - withMortgages.paycheckTotal);
  });

  it("savings rate, subscription share, and Year Wrapped all see the rent", () => {
    const rates = monthlySavingsRate(income, [], expenses, TODAY, 2);
    expect(rates[rates.length - 1].income).toBeGreaterThan(4675);

    const audit = auditSubscriptions(
      expenses.map((e) => ({
        id: e.id, name: e.name, amount: e.amount, bucket_id: e.bucketId,
        due_date: e.dueDate, cadence: e.cadence, is_paused: false,
      })),
      [],
      income.map((s) => ({ amount: s.amount, frequency: s.frequency, kind: s.kind })),
    );
    // 8,525×12 = 102,300/yr of income, not 56,100.
    expect(audit.yearlyIncome).toBeCloseTo(102_300, 0);

    const y = yearWrapped(income, expenses, [], [], [], 2026, "2026-12-31");
    expect(y.moneyIn).toBeGreaterThan(y.moneyOut);
    // Paydays still count paychecks only — 24 semimonthly checks.
    expect(y.paydayCount).toBe(24);
  });

  it("Danger Day respects money already in the bank", () => {
    // A big bill INSIDE the current cycle (Aug 1 → Aug 15), no rent to help.
    const midCycle: Expense[] = [
      { id: "big", name: "Mortgage", amount: 5000, bucketId: null, dueDate: "2026-08-10", cadence: "monthly" },
    ];
    const paycheckOnly = [income[0]];
    const broke = dangerDay(paycheckOnly, buckets, midCycle, TODAY, [], [], 0)!;
    const funded = dangerDay(paycheckOnly, buckets, midCycle, TODAY, [], [], 12_000)!;
    expect(broke.negative).toBe(true);
    expect(broke.low).toBeCloseTo(-2662.5, 2);
    expect(funded.negative).toBe(false);
    expect(funded.low).toBeCloseTo(broke.low + 12_000, 2);
  });

  it("rent inside the cycle stops a big mid-cycle bill reading as a crisis", () => {
    const midCycle: Expense[] = [
      { id: "big", name: "Mortgage", amount: 5000, bucketId: null, dueDate: "2026-08-10", cadence: "monthly" },
    ];
    // Same bill, same $0 starting balance — but the rent that landed on the
    // 1st is real money the old code refused to count anywhere it mattered.
    const withRent = dangerDay(income, buckets, midCycle, TODAY, [], [], 0)!;
    expect(withRent.negative).toBe(false);
  });
});

describe("pass-through pairs", () => {
  const sources = income.map((s) => ({
    id: s.id, name: s.name, amount: s.amount, frequency: s.frequency, kind: s.kind,
  }));
  const bills = [
    { id: "m-a", name: "Concord Mortgage", amount: 1200, cadence: "monthly", funded_by_income_id: "rent-a" },
    { id: "m-b", name: "Rochester Mortgage", amount: 3200, cadence: "monthly", funded_by_income_id: "rent-b" },
  ];

  it("reports per-property cash flow, worst first", () => {
    const s = passThroughSummary(sources, bills)!;
    expect(s.pairs).toHaveLength(2);
    expect(s.pairs[0].name).toBe("Rochester Rent");
    expect(s.pairs[0].net).toBe(-1600);
    expect(s.pairs[1].name).toBe("Concord Rent");
    expect(s.pairs[1].net).toBe(1050);
    expect(s.net).toBe(-550);
    expect(s.underwater).toHaveLength(1);
  });

  it("null when nothing is linked; unlinked bills stay personal", () => {
    expect(
      passThroughSummary(sources, [{ ...bills[0], funded_by_income_id: null }]),
    ).toBeNull();
  });

  it("monthly income normalizes each pay frequency", () => {
    expect(incomeMonthly(sources[0])).toBeCloseTo(4675, 2); // semimonthly
    expect(incomeMonthly(sources[1])).toBe(2250); // monthly
    expect(
      incomeMonthly({ id: "x", name: "x", amount: 100, frequency: "irregular", kind: "side" }),
    ).toBe(0);
  });
});
