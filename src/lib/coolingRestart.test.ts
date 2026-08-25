import { describe, expect, it } from "vitest";
import { shouldRestartCooling } from "./coolingOff";

const RUNNING = "2026-08-24T12:00:00.000Z";

describe("shouldRestartCooling", () => {
  it("leaves an untouched price alone", () => {
    expect(shouldRestartCooling(249, 249, RUNNING)).toBe(false);
  });

  it("restarts when the price drops — the classic way past a pause", () => {
    expect(shouldRestartCooling(249, 199, RUNNING)).toBe(true);
  });

  it("restarts when the price rises too, so the rule stays predictable", () => {
    expect(shouldRestartCooling(249, 320, RUNNING)).toBe(true);
  });

  it("does nothing when no clock is running", () => {
    expect(shouldRestartCooling(249, 199, null)).toBe(false);
  });

  it("treats a cent as a change — the math is the math", () => {
    expect(shouldRestartCooling(249, 248.99, RUNNING)).toBe(true);
  });
});
