import { describe, expect, it } from "vitest";
import { runway, spendAnomalies } from "./insights";
import type { CycleRecord } from "./cycleHistory";
import type { CycleSpend } from "./cycleSpend";

const cycle = (
  start: string,
  end: string,
  totalActual: number,
  buckets: { bucketId: string | null; bucketName: string; actual: number }[] = [],
): CycleRecord => ({
  cycleStart: start,
  cycleEnd: end,
  paycheckTotal: 1000,
  buckets: buckets.map((b) => ({ ...b, planned: 0, overBy: 0 })),
  totalPlanned: 1000,
  totalActual,
  keptPlan: true,
});

describe("runway", () => {
  it("divides money on hand by the real daily burn", () => {
    // Two 14-day cycles, $700 spent total → $25/day. $1,000 lasts 40 days.
    const r = runway(1000, [
      cycle("2026-06-01", "2026-06-15", 350),
      cycle("2026-06-15", "2026-06-29", 350),
    ])!;
    expect(r.avgDailySpend).toBe(25);
    expect(r.days).toBe(40);
  });

  it("zero or negative liquid means zero days — not softened", () => {
    const cycles = [cycle("2026-06-01", "2026-06-15", 280)];
    expect(runway(0, cycles)!.days).toBe(0);
    expect(runway(-50, cycles)!.days).toBe(0);
  });

  it("no spending history returns null, not infinity", () => {
    expect(runway(1000, [])).toBeNull();
    expect(runway(1000, [cycle("2026-06-01", "2026-06-15", 0)])).toBeNull();
  });
});

describe("spendAnomalies", () => {
  const history = [
    cycle("2026-06-01", "2026-06-15", 300, [
      { bucketId: "food", bucketName: "Food", actual: 200 },
      { bucketId: "fun", bucketName: "Fun", actual: 100 },
    ]),
    cycle("2026-06-15", "2026-06-29", 300, [
      { bucketId: "food", bucketName: "Food", actual: 200 },
      { bucketId: "fun", bucketName: "Fun", actual: 100 },
    ]),
  ];
  const spend = (byBucket: { bucketId: string | null; amount: number }[]): CycleSpend => ({
    since: "2026-06-29",
    nextPayday: "2026-07-13",
    daysUntilPayday: 5,
    total: byBucket.reduce((s, b) => s + b.amount, 0),
    byBucket,
  });

  it("flags a bucket already ≥30% above its own average mid-cycle", () => {
    const a = spendAnomalies(spend([{ bucketId: "food", amount: 285 }]), history);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ bucketName: "Food", current: 285, average: 200 });
    expect(a[0].pctAbove).toBe(43);
  });

  it("stays quiet within the threshold or when the gap is trivial", () => {
    // 20% above → below threshold.
    expect(spendAnomalies(spend([{ bucketId: "food", amount: 240 }]), history)).toEqual([]);
    // 40% above but only a $20 gap on a $50 average → too small to shout about.
    const smallHistory = [
      cycle("2026-06-01", "2026-06-15", 50, [{ bucketId: "fun", bucketName: "Fun", actual: 50 }]),
      cycle("2026-06-15", "2026-06-29", 50, [{ bucketId: "fun", bucketName: "Fun", actual: 50 }]),
    ];
    expect(spendAnomalies(spend([{ bucketId: "fun", amount: 70 }]), smallHistory)).toEqual([]);
  });

  it("requires at least two cycles of history for a bucket", () => {
    const oneCycle = [history[0]];
    expect(spendAnomalies(spend([{ bucketId: "food", amount: 500 }]), oneCycle)).toEqual([]);
  });

  it("sorts worst offender first", () => {
    const a = spendAnomalies(
      spend([
        { bucketId: "food", amount: 300 }, // 50% above
        { bucketId: "fun", amount: 200 }, // 100% above
      ]),
      history,
    );
    expect(a.map((x) => x.bucketName)).toEqual(["Fun", "Food"]);
  });

  it("no current cycle or history → nothing", () => {
    expect(spendAnomalies(null, history)).toEqual([]);
    expect(spendAnomalies(spend([{ bucketId: "food", amount: 500 }]), [])).toEqual([]);
  });
});

import { ageOfMoney, noSpendStreak } from "./insights";
import type { Expense, IncomeSource } from "./types";

const paycheck = (amount: number, anchorDate: string): IncomeSource => ({
  id: "job", name: "Job", amount, frequency: "biweekly", kind: "paycheck", anchorDate,
});
const spend = (id: string, amount: number, dueDate: string, bucketId = "fun"): Expense => ({
  id, name: id, amount, bucketId, dueDate, cadence: "one_time",
});

describe("ageOfMoney", () => {
  it("paycheck-to-paycheck (spend it all, same day) = age 0; light spending = older money", () => {
    // 30-day window: checks land 2026-07-06 and 2026-07-20, $1000 each.
    const income = [paycheck(1000, "2026-07-20")];
    // Spend the FULL first check the day it lands, then start on the second.
    const sameDay = ageOfMoney(
      income,
      [],
      [
        spend("a", 400, "2026-07-06"),
        spend("b", 300, "2026-07-06"),
        spend("c", 300, "2026-07-06"),
        spend("d", 200, "2026-07-20"),
      ],
      "2026-07-27",
      30,
    )!;
    expect(sameDay.days).toBe(0);

    // Light spending: every outflow draws on the 07-06 check (FIFO) — the
    // dollars being spent are one to three weeks old.
    const later = ageOfMoney(
      income,
      [],
      [spend("a", 100, "2026-07-19"), spend("b", 100, "2026-07-21"), spend("c", 100, "2026-07-25")],
      "2026-07-27",
      30,
    )!;
    expect(later.days).toBeGreaterThan(10);
    expect(later.days).toBeLessThan(25);
  });

  it("needs at least 3 outflows — otherwise null, not a fake number", () => {
    const income = [paycheck(1000, "2026-07-20")];
    expect(ageOfMoney(income, [], [spend("a", 50, "2026-07-21")], "2026-07-27")).toBeNull();
    expect(ageOfMoney([], [], [], "2026-07-27")).toBeNull();
  });

  it("logged income entries count as inflows too", () => {
    const entries = [
      { id: "e1", amount: 500, receivedDate: "2026-07-01" },
      { id: "e2", amount: 500, receivedDate: "2026-07-15" },
    ];
    const r = ageOfMoney(
      [],
      entries,
      [spend("a", 100, "2026-07-02"), spend("b", 100, "2026-07-03"), spend("c", 100, "2026-07-04")],
      "2026-07-27",
    )!;
    expect(r.days).toBeGreaterThanOrEqual(1);
    expect(r.days).toBeLessThanOrEqual(3);
  });
});

describe("noSpendStreak", () => {
  const fun = new Set(["fun"]);

  it("counts days since the last fun spend, ending yesterday", () => {
    const r = noSpendStreak([spend("a", 20, "2026-07-20")], fun, "2026-07-27")!;
    expect(r.current).toBe(6); // 21st through 26th
    expect(r.brokeToday).toBe(false);
  });

  it("a spend today is called out and the current streak keeps counting from yesterday", () => {
    const r = noSpendStreak(
      [spend("a", 20, "2026-07-20"), spend("b", 15, "2026-07-27")],
      fun,
      "2026-07-27",
    )!;
    expect(r.brokeToday).toBe(true);
    expect(r.current).toBe(6);
  });

  it("best streak is the longest clean run in the window", () => {
    const r = noSpendStreak(
      [spend("a", 20, "2026-07-01"), spend("b", 20, "2026-07-21")],
      fun,
      "2026-07-27",
      60,
    )!;
    expect(r.best).toBeGreaterThanOrEqual(19); // Jul 2–20
  });

  it("bill spending doesn't touch the streak; no flexible buckets = null", () => {
    const r = noSpendStreak([spend("a", 600, "2026-07-26", "rent")], fun, "2026-07-27")!;
    expect(r.current).toBeGreaterThan(20);
    expect(noSpendStreak([], new Set(), "2026-07-27")).toBeNull();
  });
});

import { autoTune } from "./insights";
import type { Bucket } from "./types";

describe("autoTune", () => {
  const foodBucket: Bucket = {
    id: "food", name: "Food", allocationType: "fixed", allocationValue: 200, isSavings: false,
  };
  const mkCycle = (foodActual: number): ReturnType<typeof cycle> =>
    cycle("2026-06-01", "2026-06-15", foodActual, [
      { bucketId: "food", bucketName: "Food", actual: foodActual },
    ]);
  // cycle() helper zeroes planned; patch it in.
  const withPlan = (c: ReturnType<typeof cycle>, planned: number) => ({
    ...c,
    buckets: c.buckets.map((b) => ({ ...b, planned })),
  });

  it("suggests a bigger refill for a bucket over plan in 3+ cycles", () => {
    const cycles = [263, 251, 278].map((a) => withPlan(mkCycle(a), 200));
    const s = autoTune(cycles, [foodBucket], 1000);
    expect(s).toHaveLength(1);
    expect(s[0].suggestedValue).toBe(265); // avg 264 → next $5 step
    expect(s[0].overCount).toBe(3);
  });

  it("stays quiet with fewer than 3 cycles or occasional overs", () => {
    expect(autoTune([withPlan(mkCycle(300), 200)], [foodBucket], 1000)).toEqual([]);
    const mixed = [150, 300, 150, 160].map((a) => withPlan(mkCycle(a), 200));
    expect(autoTune(mixed, [foodBucket], 1000)).toEqual([]); // only 1 of 4 over
  });

  it("percent buckets get whole-point suggestions from the typical check", () => {
    const pct: Bucket = { ...foodBucket, allocationType: "percent", allocationValue: 20 };
    const cycles = [263, 251, 278].map((a) => withPlan(mkCycle(a), 200));
    const s = autoTune(cycles, [pct], 1000);
    expect(s[0].suggestedValue).toBe(27); // avg 264 / 1000 → 27%
  });

  it("savings and paused buckets are never tuned", () => {
    const cycles = [263, 251, 278].map((a) => withPlan(mkCycle(a), 200));
    expect(autoTune(cycles, [{ ...foodBucket, isSavings: true }], 1000)).toEqual([]);
    expect(autoTune(cycles, [{ ...foodBucket, isPaused: true }], 1000)).toEqual([]);
  });
});
