import { describe, expect, it } from "vitest";
import { checksToTarget, efundStatus, monthlyBillLoad } from "./efund";

describe("monthlyBillLoad", () => {
  it("normalizes cadences to monthly and skips paused/one-time", () => {
    expect(
      monthlyBillLoad([
        { amount: 900, cadence: "monthly" },
        { amount: 300, cadence: "quarterly" }, // 100/mo
        { amount: 600, cadence: "yearly" }, // 50/mo
        { amount: 75, cadence: "one_time" },
        { amount: 200, cadence: "monthly", is_paused: true },
      ]),
    ).toBe(1050);
  });
});

describe("efundStatus", () => {
  it("computes target, gap, progress, months covered", () => {
    const s = efundStatus(1050, 3, 1200)!;
    expect(s.target).toBe(3150);
    expect(s.gap).toBe(1950);
    expect(s.pct).toBe(38);
    expect(s.monthsCovered).toBe(1.1);
  });

  it("funded target caps at 100% and 0 gap", () => {
    const s = efundStatus(1000, 1, 2500)!;
    expect(s.pct).toBe(100);
    expect(s.gap).toBe(0);
  });

  it("negative liquid counts as zero saved", () => {
    const s = efundStatus(1000, 1, -300)!;
    expect(s.gap).toBe(1000);
    expect(s.pct).toBe(0);
  });

  it("null when there is no bill load to measure against", () => {
    expect(efundStatus(0, 3, 500)).toBeNull();
  });
});

describe("checksToTarget", () => {
  it("rounds up and handles edges", () => {
    expect(checksToTarget(1950, 50)).toBe(39);
    expect(checksToTarget(1950, 100)).toBe(20);
    expect(checksToTarget(0, 50)).toBe(0);
    expect(checksToTarget(100, 0)).toBeNull();
  });
});
