import { describe, expect, it } from "vitest";
import { CHECKS_PER_YEAR, isPayFrequency, salaryPerCheck } from "./salary";

describe("salaryPerCheck", () => {
  it("divides by the right number of checks per frequency", () => {
    expect(salaryPerCheck(52_000, "weekly")).toBe(1000);
    expect(salaryPerCheck(52_000, "biweekly")).toBe(2000);
    expect(salaryPerCheck(60_000, "semimonthly")).toBe(2500);
    expect(salaryPerCheck(60_000, "monthly")).toBe(5000);
  });

  it("rounds to the cent", () => {
    // 65000 / 26 = 2500 exactly; 65001 / 26 = 2500.0384…
    expect(salaryPerCheck(65_001, "biweekly")).toBe(2500.04);
    // 50000 / 52 = 961.538…
    expect(salaryPerCheck(50_000, "weekly")).toBe(961.54);
  });

  it("scales by take-home percent", () => {
    expect(salaryPerCheck(52_000, "biweekly", 75)).toBe(1500);
    expect(salaryPerCheck(52_000, "biweekly", 100)).toBe(2000);
    // 60000/24 * 0.8 = 2000
    expect(salaryPerCheck(60_000, "semimonthly", 80)).toBe(2000);
  });

  it("returns 0 for nonsense so forms stay disabled", () => {
    expect(salaryPerCheck(0, "biweekly")).toBe(0);
    expect(salaryPerCheck(-50_000, "biweekly")).toBe(0);
    expect(salaryPerCheck(52_000, "biweekly", 0)).toBe(0);
    expect(salaryPerCheck(52_000, "biweekly", -5)).toBe(0);
    expect(salaryPerCheck(52_000, "biweekly", 101)).toBe(0);
    expect(salaryPerCheck(NaN, "biweekly")).toBe(0);
  });

  it("frequency guard matches the table", () => {
    for (const f of Object.keys(CHECKS_PER_YEAR)) expect(isPayFrequency(f)).toBe(true);
    expect(isPayFrequency("irregular")).toBe(false);
    expect(isPayFrequency("")).toBe(false);
  });
});
