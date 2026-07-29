import { describe, expect, it } from "vitest";
import { yearWrapped } from "./yearWrapped";
import type { Expense, IncomeSource } from "@/lib/engine";

const income: IncomeSource[] = [
  {
    id: "i1",
    name: "Job",
    amount: 1000,
    frequency: "monthly",
    kind: "paycheck",
    anchorDate: "2025-01-15",
  },
];
const expenses: Expense[] = [
  { id: "r", name: "Rent", amount: 700, bucketId: null, dueDate: "2025-01-01", cadence: "monthly" },
];

describe("yearWrapped", () => {
  it("aggregates a complete year", () => {
    const y = yearWrapped(income, expenses, [], [], [], 2025, "2026-08-03");
    expect(y.complete).toBe(true);
    expect(y.months).toHaveLength(12);
    expect(y.moneyIn).toBe(12000);
    expect(y.moneyOut).toBe(8400);
    expect(y.kept).toBe(3600);
    expect(y.keptPct).toBe(30);
    expect(y.paydayCount).toBe(12);
  });

  it("in-progress year only counts through today", () => {
    const y = yearWrapped(income, expenses, [], [], [], 2026, "2026-03-20");
    expect(y.complete).toBe(false);
    expect(y.months).toHaveLength(3);
    // Jan, Feb full + March through the 20th (payday on the 15th landed).
    expect(y.paydayCount).toBe(3);
    expect(y.moneyOut).toBe(2100);
  });

  it("logged income and best/worst months", () => {
    const y = yearWrapped(
      income,
      expenses,
      [{ amount: 500, receivedDate: "2025-06-10" }],
      [],
      [],
      2025,
      "2026-08-03",
    );
    expect(y.best!.key).toBe("2025-06"); // the windfall month kept the most
    expect(y.best!.kept).toBe(800);
    expect(y.worst!.kept).toBe(300);
  });

  it("interest paid vs earned at today's balances", () => {
    const y = yearWrapped(
      income,
      [],
      [],
      [
        { balance: 10000, rate: 24 },
        { balance: 5000, rate: 6 },
      ],
      [{ balance: 8000, apy: 4 }],
      2025,
      "2026-08-03",
    );
    expect(y.interestPaidYearly).toBe(2700);
    expect(y.interestEarnedYearly).toBe(320);
  });
});
