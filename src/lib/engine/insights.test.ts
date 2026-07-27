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
