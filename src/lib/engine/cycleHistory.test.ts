import { describe, expect, it } from "vitest";
import { cycleHistory } from "./cycleHistory";
import type { Bucket, Expense, IncomeSource } from "./types";

const sources: IncomeSource[] = [
  { id: "job", name: "Job", amount: 1000, frequency: "biweekly", kind: "paycheck", anchorDate: "2026-01-02" },
];
const buckets: Bucket[] = [
  { id: "bills", name: "Bills", allocationType: "percent", allocationValue: 30, isSavings: false, priority: 0 },
  { id: "food", name: "Food", allocationType: "percent", allocationValue: 20, isSavings: false, priority: 1 },
  { id: "fun", name: "Fun money", allocationType: "percent", allocationValue: 10, isSavings: false, priority: 2 },
  { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
];

// Paydays land 2026-01-02, 01-16, 01-30, 02-13, 02-27, 03-13, 03-27...
// "Today" sits well after several of these so multiple cycles have closed.

describe("cycleHistory", () => {
  it("returns nothing with no paycheck income", () => {
    const h = cycleHistory([], buckets, [], "2026-01-20");
    expect(h.cycles).toEqual([]);
    expect(h.streaks).toEqual([]);
  });

  it("recaps completed cycles only - the open one is excluded, most recent first", () => {
    const h = cycleHistory(sources, buckets, [], "2026-01-20", 6);
    // Paydays land ...12-19, 01-02, 01-16, 01-30(after "today", excluded).
    // The most recently CLOSED cycle is [01-02, 01-16] - the one still open
    // on 01-20 ([01-16, 01-30]) never appears.
    expect(h.cycles).toHaveLength(6);
    expect(h.cycles[0]).toMatchObject({ cycleStart: "2026-01-02", cycleEnd: "2026-01-16" });
    expect(h.cycles.some((c) => c.cycleStart === "2026-01-16")).toBe(false);
  });

  it("planned matches splitPaycheck's math for that cycle's paycheck", () => {
    const h = cycleHistory(sources, buckets, [], "2026-01-20", 6);
    const bills = h.cycles[0].buckets.find((b) => b.bucketId === "bills")!;
    expect(bills.planned).toBe(300); // 30% of 1000
  });

  it("flags a bucket that overspent its plan, and one that didn't", () => {
    const expenses: Expense[] = [
      { id: "e1", name: "Takeout", amount: 250, bucketId: "food", dueDate: "2026-01-05", cadence: "one_time" },
    ];
    const h = cycleHistory(sources, buckets, expenses, "2026-01-20", 6);
    const food = h.cycles[0].buckets.find((b) => b.bucketId === "food")!;
    expect(food.planned).toBe(200); // 20% of 1000
    expect(food.actual).toBe(250);
    expect(food.overBy).toBe(50);
    expect(h.cycles[0].keptPlan).toBe(false);

    const bills = h.cycles[0].buckets.find((b) => b.bucketId === "bills")!;
    expect(bills.overBy).toBe(0);
  });

  it("kept the plan when nothing overspent", () => {
    const h = cycleHistory(sources, buckets, [], "2026-01-20", 6);
    expect(h.cycles[0].keptPlan).toBe(true);
  });

  it("builds a multi-cycle streak when a bucket overspends repeatedly, most recent first", () => {
    // Fun money (10% -> $100/cycle) overspent in the two most recent closed
    // cycles ([01-16,01-30] and [01-30,02-13]) but not the one before that.
    const expenses: Expense[] = [
      { id: "e1", name: "Concert", amount: 150, bucketId: "fun", dueDate: "2026-01-20", cadence: "one_time" },
      { id: "e2", name: "Bar night", amount: 130, bucketId: "fun", dueDate: "2026-02-03", cadence: "one_time" },
    ];
    const h = cycleHistory(sources, buckets, expenses, "2026-02-20", 6);
    // Cycles most-recent-first: [01-30,02-13] over, [01-16,01-30] over, [01-02,01-16] not over.
    const funStreak = h.streaks.find((s) => s.bucketId === "fun");
    expect(funStreak).toBeDefined();
    expect(funStreak!.overCycles).toBe(2);
  });

  it("a streak stops counting at the first cycle that stayed within plan", () => {
    const expenses: Expense[] = [
      // Only the most recent closed cycle overspends fun money.
      { id: "e1", name: "Concert", amount: 150, bucketId: "fun", dueDate: "2026-02-03", cadence: "one_time" },
    ];
    const h = cycleHistory(sources, buckets, expenses, "2026-02-20", 6);
    const funStreak = h.streaks.find((s) => s.bucketId === "fun");
    expect(funStreak!.overCycles).toBe(1);
  });

  it("respects the cyclesBack cap", () => {
    const h = cycleHistory(sources, buckets, [], "2026-04-01", 2);
    expect(h.cycles).toHaveLength(2);
  });
});
