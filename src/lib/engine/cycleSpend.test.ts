import { describe, expect, it } from "vitest";
import { cycleSpending } from "./cycleSpend";
import type { Expense, IncomeSource } from "./types";

// Biweekly $1,000 anchored to the FUTURE next payday: today Jul 23 →
// cycle runs Jul 10 → Jul 24 (13 days-ish left, Jayden-style).
const job: IncomeSource = {
  id: "job",
  name: "Job",
  amount: 1000,
  frequency: "biweekly",
  kind: "paycheck",
  anchorDate: "2026-07-24",
};
const TODAY = "2026-07-23";

const expense = (over: Partial<Expense>): Expense => ({
  id: "e",
  name: "Spend",
  amount: 100,
  bucketId: null,
  dueDate: "2026-07-15",
  cadence: "one_time",
  ...over,
});

describe("cycleSpending", () => {
  it("Jayden's story: $360 spent of a $1,000 check = 36%, 64% left", () => {
    const s = cycleSpending(
      [job],
      [
        expense({ id: "a", name: "Bull Moose", amount: 140, bucketId: "fun", dueDate: "2026-07-22" }),
        expense({ id: "b", name: "Groceries", amount: 220, bucketId: "food", dueDate: "2026-07-18" }),
      ],
      TODAY,
    )!;
    expect(s.since).toBe("2026-07-10");
    expect(s.total).toBe(360);
    expect(Math.round((s.total / job.amount) * 100)).toBe(36); // 36% spent
    expect(s.byBucket).toEqual([
      { bucketId: "food", amount: 220 },
      { bucketId: "fun", amount: 140 },
    ]);
  });

  it("only counts expenses due inside the current cycle", () => {
    const s = cycleSpending(
      [job],
      [
        expense({ id: "before", dueDate: "2026-07-09" }), // last cycle
        expense({ id: "future", dueDate: "2026-07-24" }), // next cycle
        expense({ id: "in", dueDate: "2026-07-10" }), // cycle start counts
      ],
      TODAY,
    )!;
    expect(s.total).toBe(100);
  });

  it("monthly bills count once when their due day falls in the cycle", () => {
    const s = cycleSpending(
      [job],
      [expense({ id: "rent", amount: 650, cadence: "monthly", dueDate: "2026-01-15" })],
      TODAY,
    )!;
    expect(s.total).toBe(650); // Jul 15 occurrence
  });

  it("paused expenses don't count as spending", () => {
    const s = cycleSpending([job], [expense({ isPaused: true })], TODAY)!;
    expect(s.total).toBe(0);
    expect(s.byBucket).toEqual([]);
  });

  it("no paycheck income → no cycle to measure", () => {
    expect(cycleSpending([], [expense({})], TODAY)).toBeNull();
  });
});
