import { describe, expect, it } from "vitest";
import { refinanceCompare } from "./grow";

describe("refinanceCompare", () => {
  it("a lower rate saves interest and months", () => {
    const r = refinanceCompare(10_000, 24, 12, 400)!;
    expect(r.saved).toBeGreaterThan(0);
    expect(r.newInterest).toBeLessThan(r.oldInterest);
    expect(r.monthsSooner).toBeGreaterThan(0);
    expect(r.newNeverPaysOff).toBe(false);
  });

  it("honesty cuts both ways: a higher rate costs more", () => {
    const r = refinanceCompare(10_000, 12, 24, 400)!;
    expect(r.saved).toBeLessThan(0);
  });

  it("flags a payment the new rate swallows", () => {
    // $100/mo on $10k at 24% = $200/mo interest — never pays off.
    const r = refinanceCompare(10_000, 6, 24, 100)!;
    expect(r.oldNeverPaysOff).toBe(false);
    expect(r.newNeverPaysOff).toBe(true);
    expect(r.monthsSooner).toBeNull();
  });

  it("null for nonsense", () => {
    expect(refinanceCompare(0, 10, 5, 100)).toBeNull();
    expect(refinanceCompare(1000, 10, 5, 0)).toBeNull();
  });
});
