import { describe, expect, it } from "vitest";
import { dangerDay } from "./dangerDay";
import type { Bucket, Expense, IncomeSource } from "./types";

const TODAY = "2026-08-03"; // Monday
const income: IncomeSource[] = [
  {
    id: "i1",
    name: "Job",
    amount: 1000,
    frequency: "biweekly",
    kind: "paycheck",
    anchorDate: "2026-07-31", // last payday Fri 7/31; next 8/14
  },
];
const buckets: Bucket[] = [
  { id: "bills", name: "Bills", allocationType: "fixed", allocationValue: 600, isSavings: false, priority: 0 },
  { id: "fun", name: "Fun", allocationType: "fixed", allocationValue: 200, isSavings: false, isFlexible: true, priority: 1 },
  { id: "sv", name: "Savings", allocationType: "percent", allocationValue: 100, isSavings: true, priority: 2 },
];

describe("dangerDay", () => {
  it("finds the lowest day and names the bill that causes it", () => {
    const expenses: Expense[] = [
      { id: "rent", name: "Rent", amount: 550, bucketId: "bills", dueDate: "2026-08-10", cadence: "monthly" },
    ];
    const d = dangerDay(income, buckets, expenses, TODAY)!;
    expect(d).not.toBeNull();
    // Money only leaves on the 10th, so every day from the 10th onward sits at
    // the same low — the earliest such day is the danger day.
    expect(d.date).toBe("2026-08-10");
    expect(d.nextPayday).toBe("2026-08-14");
    expect(d.negative).toBe(false);
    expect(d.causes.map((c) => c.name)).toContain("Rent");
    expect(d.daysAway).toBe(7);
  });

  it("flags a negative low point", () => {
    const expenses: Expense[] = [
      { id: "rent", name: "Rent", amount: 1200, bucketId: "bills", dueDate: "2026-08-10", cadence: "monthly" },
    ];
    const d = dangerDay(income, buckets, expenses, TODAY)!;
    expect(d.negative).toBe(true);
    expect(d.low).toBeLessThan(0);
  });

  it("no bills → the low is flat and non-negative", () => {
    const d = dangerDay(income, buckets, [], TODAY)!;
    expect(d.negative).toBe(false);
    expect(d.low).toBeGreaterThanOrEqual(1000);
    expect(d.causes).toEqual([]);
  });

  it("null without a pay cycle", () => {
    expect(dangerDay([], buckets, [], TODAY)).toBeNull();
  });
});
