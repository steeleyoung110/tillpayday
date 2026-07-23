import { describe, expect, it } from "vitest";
import { paydayRecap } from "./celebration";
import type { Bucket, Expense, IncomeSource } from "./types";

// Biweekly $1,400 with the anchor set to the FUTURE next payday (Jul 24).
// Today Jul 22 → last payday Jul 10, the cycle before it started Jun 26.
const job: IncomeSource = {
  id: "job",
  name: "Job",
  amount: 1400,
  frequency: "biweekly",
  kind: "paycheck",
  anchorDate: "2026-07-24",
};

const buckets: Bucket[] = [
  { id: "fun", name: "Fun", allocationType: "fixed", allocationValue: 140, isSavings: false, priority: 0, isFlexible: true },
  { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
];

describe("paydayRecap", () => {
  it("reports what the last payday swept and the savings total today", () => {
    const expenses: Expense[] = [
      // Came due inside the Jun 26 → Jul 10 cycle: Fun 140 − 35 = 105 left.
      { id: "e", name: "Takeout", amount: 35, bucketId: "fun", dueDate: "2026-07-05", cadence: "monthly" },
    ];
    const r = paydayRecap([job], buckets, expenses, 500, "2026-07-22")!;
    expect(r.payday).toBe("2026-07-10");
    expect(r.swept).toBe(105);
    // Savings: 500 start + Jun 26 leftover (1400−140) + Jul 10 sweep 105 +
    // Jul 10 leftover 1260 = 3125.
    expect(r.savingsTotal).toBe(500 + 1260 + 105 + 1260);
  });

  it("sweeps nothing when the whole flexible pot was spent", () => {
    const expenses: Expense[] = [
      { id: "e", name: "Blowout", amount: 140, bucketId: "fun", dueDate: "2026-07-08", cadence: "one_time" },
    ];
    const r = paydayRecap([job], buckets, expenses, 0, "2026-07-22")!;
    expect(r.swept).toBe(0);
  });

  it("reports a negative sweep after an overdraft (savings covered it)", () => {
    const expenses: Expense[] = [
      { id: "e", name: "Overdraft", amount: 200, bucketId: "fun", dueDate: "2026-07-08", cadence: "one_time" },
    ];
    const r = paydayRecap([job], buckets, expenses, 0, "2026-07-22")!;
    expect(r.swept).toBe(-60);
  });

  it("works on payday itself (celebrates today's payday)", () => {
    const r = paydayRecap([job], buckets, [], 0, "2026-07-24")!;
    expect(r.payday).toBe("2026-07-24");
    expect(r.swept).toBe(140); // untouched Fun refill from Jul 10
  });

  it("returns null with no paycheck income", () => {
    expect(paydayRecap([], buckets, [], 0, "2026-07-22")).toBeNull();
  });
});
