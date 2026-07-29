import { describe, expect, it } from "vitest";
import { freedomDay } from "./freedomDay";
import type { Expense, IncomeSource } from "@/lib/engine";

const income: IncomeSource[] = [
  { id: "i", name: "Job", amount: 1500, frequency: "biweekly", kind: "paycheck", anchorDate: "2026-08-07" },
];
const bill = (amount: number): Expense[] => [
  { id: "r", name: "Rent", amount, bucketId: null, dueDate: "2026-05-01", cadence: "monthly" },
];

describe("freedomDay", () => {
  it("bills at 60% of income → free on day 19 of a 31-day month", () => {
    // August 2026 has paydays 8/7 and 8/21 → $3000 in; $1800 rent = 60%.
    const f = freedomDay(income, bill(1800), "2026-08-03")!;
    expect(f.monthIncome).toBe(3000);
    expect(f.monthBills).toBe(1800);
    expect(f.day).toBe(19); // ceil(0.6 × 31)
    expect(f.date).toBe("2026-08-19");
    expect(f.neverFree).toBe(false);
  });

  it("bills ≥ income → no freedom day this month", () => {
    const f = freedomDay(income, bill(3200), "2026-08-03")!;
    expect(f.neverFree).toBe(true);
    expect(f.day).toBe(31);
  });

  it("one-time spends and paused bills don't count as bills", () => {
    const f = freedomDay(
      income,
      [
        ...bill(1500),
        { id: "x", name: "Coffee", amount: 500, bucketId: null, dueDate: "2026-08-05", cadence: "one_time" },
        { id: "p", name: "Paused", amount: 900, bucketId: null, dueDate: "2026-05-01", cadence: "monthly", isPaused: true },
      ],
      "2026-08-03",
    )!;
    expect(f.monthBills).toBe(1500);
  });

  it("null without scheduled income", () => {
    expect(freedomDay([], bill(1000), "2026-08-03")).toBeNull();
  });
});
