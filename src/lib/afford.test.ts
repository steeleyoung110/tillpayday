import { describe, expect, it } from "vitest";
import { canIAfford } from "./afford";

const base = {
  flexibleBalance: 120,
  daysUntilPayday: 6,
  savingsBalance: 400,
  dangerLow: 300,
  dangerDate: "2026-08-12",
};

describe("canIAfford", () => {
  it("yes — fits flexible money, low point survives", () => {
    const v = canIAfford({ ...base, price: 40 })!;
    expect(v.answer).toBe("yes");
    expect(v.remainingFlexible).toBe(80);
    expect(v.newPerDay).toBe(13.33);
    expect(v.savingsDip).toBe(0);
    expect(v.dangerAfter).toBe(260);
  });

  it("tight — spills out of flexible into savings", () => {
    const v = canIAfford({ ...base, price: 200 })!;
    expect(v.answer).toBe("tight");
    expect(v.remainingFlexible).toBe(0);
    expect(v.savingsDip).toBe(80);
  });

  it("no — you don't have it", () => {
    const v = canIAfford({ ...base, price: 600, dangerLow: 800 })!;
    expect(v.answer).toBe("no");
    expect(v.shortBy).toBe(80);
    expect(v.breaksDangerDay).toBe(false);
  });

  it("no — fits today but a bill drives the low point negative", () => {
    const v = canIAfford({ ...base, price: 100, dangerLow: 60 })!;
    expect(v.answer).toBe("no");
    expect(v.breaksDangerDay).toBe(true);
    expect(v.dangerAfter).toBe(-40);
    expect(v.shortBy).toBe(0);
  });

  it("negative savings never counts as spendable", () => {
    const v = canIAfford({ ...base, price: 150, savingsBalance: -50, dangerLow: null })!;
    expect(v.answer).toBe("no");
    expect(v.shortBy).toBe(30);
  });

  it("null for nonsense prices", () => {
    expect(canIAfford({ ...base, price: 0 })).toBeNull();
    expect(canIAfford({ ...base, price: -5 })).toBeNull();
  });
});
