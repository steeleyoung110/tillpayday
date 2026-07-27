import { describe, expect, it } from "vitest";
import { billsByCheck } from "./billCalendar";
import type { Bucket, Expense, IncomeSource } from "./types";

const sources: IncomeSource[] = [
  { id: "job", name: "Job", amount: 1000, frequency: "biweekly", kind: "paycheck", anchorDate: "2026-01-02" },
];
const buckets: Bucket[] = [
  { id: "bills", name: "Bills", allocationType: "percent", allocationValue: 30, isSavings: false, priority: 0 },
  { id: "fun", name: "Fun money", allocationType: "percent", allocationValue: 10, isSavings: false, priority: 1 },
  { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
];
// Paydays: ...2025-12-19, 2026-01-02, 2026-01-16, 2026-01-30, 2026-02-13...

describe("billsByCheck", () => {
  it("groups bills under the check that funds them, starting at the NEXT payday", () => {
    const expenses: Expense[] = [
      // Due inside [01-16, 01-30): belongs to the check landing 01-16.
      { id: "rent", name: "Rent", amount: 500, bucketId: "bills", dueDate: "2026-01-18", cadence: "one_time" },
    ];
    // "Today" sits mid-cycle (01-05): the next payday is 01-16.
    const groups = billsByCheck(sources, buckets, expenses, "2026-01-05", 4);
    expect(groups[0].payday).toBe("2026-01-16");
    expect(groups[0].bills).toHaveLength(1);
    expect(groups[0].bills[0]).toMatchObject({ name: "Rent", amount: 500, bucketName: "Bills" });
  });

  it("excludes the current, already-landed check - bills due before the next payday don't appear", () => {
    const expenses: Expense[] = [
      { id: "e", name: "Already covered", amount: 50, bucketId: "fun", dueDate: "2026-01-08", cadence: "one_time" },
    ];
    const groups = billsByCheck(sources, buckets, expenses, "2026-01-05", 4);
    expect(groups.flatMap((g) => g.bills).some((b) => b.name === "Already covered")).toBe(false);
  });

  it("flags a check that can't cover everything due against it", () => {
    const expenses: Expense[] = [
      { id: "rent", name: "Rent", amount: 500, bucketId: "bills", dueDate: "2026-01-18", cadence: "one_time" },
      { id: "concert", name: "Concert", amount: 600, bucketId: "fun", dueDate: "2026-01-20", cadence: "one_time" },
    ];
    const groups = billsByCheck(sources, buckets, expenses, "2026-01-05", 1);
    expect(groups[0].totalBills).toBe(1100);
    expect(groups[0].paycheckTotal).toBe(1000);
    expect(groups[0].fits).toBe(false);
    expect(groups[0].shortBy).toBe(100);
  });

  it("a check with room to spare fits cleanly", () => {
    const expenses: Expense[] = [
      { id: "rent", name: "Rent", amount: 500, bucketId: "bills", dueDate: "2026-01-18", cadence: "one_time" },
    ];
    const groups = billsByCheck(sources, buckets, expenses, "2026-01-05", 1);
    expect(groups[0].fits).toBe(true);
    expect(groups[0].shortBy).toBe(0);
  });

  it("returns exactly checksAhead groups, chronologically ordered", () => {
    const groups = billsByCheck(sources, buckets, [], "2026-01-05", 3);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.payday)).toEqual(["2026-01-16", "2026-01-30", "2026-02-13"]);
  });

  it("returns nothing with no paycheck income", () => {
    expect(billsByCheck([], buckets, [], "2026-01-05")).toEqual([]);
  });

  it("bills are sorted earliest-due first within a check", () => {
    const expenses: Expense[] = [
      { id: "b", name: "Later", amount: 20, bucketId: "fun", dueDate: "2026-01-25", cadence: "one_time" },
      { id: "a", name: "Earlier", amount: 10, bucketId: "fun", dueDate: "2026-01-17", cadence: "one_time" },
    ];
    const groups = billsByCheck(sources, buckets, expenses, "2026-01-05", 1);
    expect(groups[0].bills.map((b) => b.name)).toEqual(["Earlier", "Later"]);
  });
});
