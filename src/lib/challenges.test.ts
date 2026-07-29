import { describe, expect, it } from "vitest";
import { noSpendStatus, week52Status } from "./challenges";

describe("week52Status", () => {
  it("tracks the ladder week and targets", () => {
    const s = week52Status("2026-01-05", "2026-01-20")!; // day 15 → week 3
    expect(s.week).toBe(3);
    expect(s.dueThisWeek).toBe(3);
    expect(s.targetToDate).toBe(6);
    expect(s.totalTarget).toBe(1378);
    expect(s.complete).toBe(false);
  });
  it("completes after 52 weeks", () => {
    const s = week52Status("2025-01-06", "2026-01-20")!;
    expect(s.complete).toBe(true);
    expect(s.targetToDate).toBe(1378);
  });
  it("future start → null", () => {
    expect(week52Status("2026-09-01", "2026-08-01")).toBeNull();
  });
});

describe("noSpendStatus", () => {
  it("clean days count up and complete after the 7th", () => {
    const mid = noSpendStatus("2026-08-01", "2026-08-04", [])!;
    expect(mid.daysDone).toBe(4);
    expect(mid.failed).toBe(false);
    expect(mid.complete).toBe(false);

    const done = noSpendStatus("2026-08-01", "2026-08-08", [])!;
    expect(done.complete).toBe(true);
  });
  it("a fun spend inside the window fails it, keeping the clean-day count", () => {
    const s = noSpendStatus("2026-08-01", "2026-08-06", ["2026-08-04", "2026-07-20"])!;
    expect(s.failed).toBe(true);
    expect(s.failDate).toBe("2026-08-04");
    expect(s.daysDone).toBe(3);
  });
  it("spends outside the window don't count", () => {
    const s = noSpendStatus("2026-08-01", "2026-08-03", ["2026-07-31", "2026-08-09"])!;
    expect(s.failed).toBe(false);
  });
});
