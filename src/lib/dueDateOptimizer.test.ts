import { describe, expect, it } from "vitest";
import { optimizeDueDates } from "./dueDateOptimizer";
import type { Bucket, Expense, IncomeSource } from "@/lib/engine";

const TODAY = "2026-08-03";
const income: IncomeSource[] = [
  { id: "i", name: "Job", amount: 1000, frequency: "biweekly", kind: "paycheck", anchorDate: "2026-07-31" },
]; // last payday 7/31, next 8/14
const buckets: Bucket[] = [
  { id: "bills", name: "Bills", allocationType: "fixed", allocationValue: 700, isSavings: false, priority: 0 },
  { id: "sv", name: "Savings", allocationType: "percent", allocationValue: 100, isSavings: true, priority: 1 },
];

describe("optimizeDueDates", () => {
  it("suggests moving the bill that manufactures the danger day", () => {
    const expenses: Expense[] = [
      { id: "ins", name: "Insurance", amount: 600, bucketId: "bills", dueDate: "2026-08-10", cadence: "monthly" },
    ];
    const s = optimizeDueDates(income, buckets, expenses, TODAY);
    expect(s).toHaveLength(1);
    expect(s[0].name).toBe("Insurance");
    expect(s[0].currentDue).toBe("2026-08-10");
    expect(s[0].suggestedDue).toBe("2026-08-15"); // day after the 8/14 check
    expect(s[0].lift).toBeCloseTo(600, 0); // the low no longer eats the bill
    expect(s[0].newLow).toBeGreaterThan(s[0].oldLow);
  });

  it("no suggestions when nothing lands before payday", () => {
    const expenses: Expense[] = [
      { id: "ins", name: "Insurance", amount: 600, bucketId: "bills", dueDate: "2026-08-20", cadence: "monthly" },
    ];
    expect(optimizeDueDates(income, buckets, expenses, TODAY)).toHaveLength(0);
  });

  it("ignores tiny lifts and one-time spends", () => {
    const expenses: Expense[] = [
      { id: "sm", name: "Small", amount: 5, bucketId: "bills", dueDate: "2026-08-10", cadence: "monthly" },
      { id: "ot", name: "One-off", amount: 500, bucketId: "bills", dueDate: "2026-08-09", cadence: "one_time" },
    ];
    expect(optimizeDueDates(income, buckets, expenses, TODAY)).toHaveLength(0);
  });
});
