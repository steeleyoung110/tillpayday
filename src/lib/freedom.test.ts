import { describe, expect, it } from "vitest";
import { freedomStatus } from "./freedom";
import { futureValueMonthly } from "./futureValue";
import { expenseShare } from "./rows";

describe("freedomStatus", () => {
  it("computes the 4% freedom number and progress", () => {
    const f = freedomStatus(2100, 26_250)!;
    expect(f.freedomNumber).toBe(630_000); // 2100×12/0.04
    expect(f.pct).toBe(4.2);
    expect(f.coveredMonthly).toBe(87.5);
  });

  it("negative investable clamps to zero, no bills → null", () => {
    expect(freedomStatus(2100, -5000)!.pct).toBe(0);
    expect(freedomStatus(0, 10_000)).toBeNull();
  });
});

describe("futureValueMonthly", () => {
  it("10y at 7% roughly ×173 the monthly amount", () => {
    const fv = futureValueMonthly(15.49);
    expect(fv).toBeGreaterThan(2600);
    expect(fv).toBeLessThan(2750);
  });
  it("zero rate degrades to simple sum", () => {
    expect(futureValueMonthly(100, 10, 0)).toBe(12_000);
  });
  it("nonsense → 0", () => {
    expect(futureValueMonthly(0)).toBe(0);
  });
});

describe("expenseShare", () => {
  it("splits and rounds; 1 or garbage means all yours", () => {
    expect(expenseShare({ amount: 1200, split_ways: 3 })).toBe(400);
    expect(expenseShare({ amount: 100, split_ways: 3 })).toBe(33.33);
    expect(expenseShare({ amount: 1200, split_ways: 1 })).toBe(1200);
    expect(expenseShare({ amount: 1200, split_ways: 0 })).toBe(1200);
  });
});
