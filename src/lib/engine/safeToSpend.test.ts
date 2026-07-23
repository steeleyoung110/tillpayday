import { describe, expect, it } from "vitest";
import { currentPayCycle, safeToSpend } from "./safeToSpend";
import type { Bucket, Expense, IncomeSource } from "./types";

const job = (over: Partial<IncomeSource>): IncomeSource => ({
  id: "job",
  name: "Job",
  amount: 1400,
  frequency: "biweekly",
  kind: "paycheck",
  anchorDate: "2026-07-24",
  ...over,
});

describe("currentPayCycle", () => {
  it("brackets today even when the anchor is the FUTURE next payday", () => {
    // Anchor Fri Jul 24 (future); today Wed Jul 22 → last payday was Jul 10.
    const c = currentPayCycle([job({})], "2026-07-22")!;
    expect(c.lastPayday).toBe("2026-07-10");
    expect(c.nextPayday).toBe("2026-07-24");
    expect(c.daysUntilPayday).toBe(2);
  });

  it("treats payday itself as the cycle start", () => {
    const c = currentPayCycle([job({})], "2026-07-24")!;
    expect(c.lastPayday).toBe("2026-07-24");
    expect(c.nextPayday).toBe("2026-08-07");
    expect(c.daysUntilPayday).toBe(14);
  });

  it("handles semimonthly (1st/15th) and monthly", () => {
    const semi = currentPayCycle(
      [job({ frequency: "semimonthly" })],
      "2026-07-22",
    )!;
    expect(semi.lastPayday).toBe("2026-07-15");
    expect(semi.nextPayday).toBe("2026-08-01");

    const monthly = currentPayCycle(
      [job({ frequency: "monthly", anchorDate: "2026-01-05" })],
      "2026-07-22",
    )!;
    expect(monthly.lastPayday).toBe("2026-07-05");
    expect(monthly.nextPayday).toBe("2026-08-05");
  });

  it("uses the earliest upcoming payday across multiple jobs", () => {
    const c = currentPayCycle(
      [job({}), job({ id: "j2", frequency: "semimonthly" })],
      "2026-07-22",
    )!;
    expect(c.nextPayday).toBe("2026-07-24"); // biweekly beats Aug 1
    expect(c.lastPayday).toBe("2026-07-15"); // semimonthly beats Jul 10
  });

  it("returns null with no paycheck income (side income is not a payday)", () => {
    expect(currentPayCycle([], "2026-07-22")).toBeNull();
    expect(currentPayCycle([job({ kind: "side" })], "2026-07-22")).toBeNull();
  });
});

describe("safeToSpend", () => {
  const buckets: Bucket[] = [
    { id: "rent", name: "Rent", allocationType: "fixed", allocationValue: 700, isSavings: false, priority: 0 },
    { id: "fun", name: "Fun", allocationType: "fixed", allocationValue: 140, isSavings: false, priority: 1, isFlexible: true },
    { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
  ];

  it("divides the flexible balance by days remaining until payday", () => {
    // Last payday Jul 10 refills Fun to 140; no expenses. Jul 22 → 2 days left.
    const s = safeToSpend([job({})], buckets, [], "2026-07-22")!;
    expect(s.flexibleBalance).toBe(140);
    expect(s.daysUntilPayday).toBe(2);
    expect(s.perDay).toBe(70);
    expect(s.nextPayday).toBe("2026-07-24");
    expect(s.hasFlexibleBuckets).toBe(true);
  });

  it("subtracts planned expenses already due this cycle", () => {
    const expenses: Expense[] = [
      { id: "e", name: "Takeout", amount: 35, bucketId: "fun", dueDate: "2026-07-15", cadence: "monthly" },
    ];
    const s = safeToSpend([job({})], buckets, expenses, "2026-07-22")!;
    expect(s.flexibleBalance).toBe(105);
    expect(s.perDay).toBe(52.5);
  });

  it("underspending raises tomorrow's number (same pot, fewer days)", () => {
    const s7 = safeToSpend([job({})], buckets, [], "2026-07-17")!; // 7 days left
    const s2 = safeToSpend([job({})], buckets, [], "2026-07-22")!; // 2 days left
    expect(s7.perDay).toBe(20);
    expect(s2.perDay).toBe(70);
    expect(s2.perDay).toBeGreaterThan(s7.perDay);
  });

  it("floors to the cent and never goes below zero", () => {
    const oddBuckets: Bucket[] = [
      { id: "fun", name: "Fun", allocationType: "fixed", allocationValue: 100, isSavings: false, isFlexible: true },
      { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
    ];
    // 100 over 3 days (Jul 21 → Jul 24) = 33.333… → 33.33.
    const s = safeToSpend([job({})], oddBuckets, [], "2026-07-21")!;
    expect(s.perDay).toBe(33.33);

    const overdrawn = safeToSpend(
      [job({})],
      oddBuckets,
      [{ id: "e", name: "Blowout", amount: 500, bucketId: "fun", dueDate: "2026-07-20", cadence: "one_time" }],
      "2026-07-21",
    )!;
    expect(overdrawn.flexibleBalance).toBe(-400);
    expect(overdrawn.perDay).toBe(0);
  });

  it("ignores non-flexible and savings buckets", () => {
    const s = safeToSpend([job({})], buckets, [], "2026-07-22")!;
    // Rent (700) and swept savings are not part of the number.
    expect(s.flexibleBalance).toBe(140);
  });

  it("flags when nothing is marked flexible", () => {
    const none = buckets.map((b) => ({ ...b, isFlexible: false }));
    const s = safeToSpend([job({})], none, [], "2026-07-22")!;
    expect(s.hasFlexibleBuckets).toBe(false);
    expect(s.perDay).toBe(0);
  });

  it("returns null without a pay cycle", () => {
    expect(safeToSpend([], buckets, [], "2026-07-22")).toBeNull();
  });
});
