import { describe, expect, it } from "vitest";
import { goalPerCheck, type SavingsPoint } from "./goals";

const TODAY = "2026-08-03";
// Flat savings line at $200 — no organic progress toward the goal.
const flat: SavingsPoint[] = Array.from({ length: 180 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 3 + i));
  return { date: d.toISOString().slice(0, 10), savings: 200 };
});

const paydays = ["2026-08-14", "2026-08-28", "2026-09-11", "2026-09-25", "2026-10-09"];

describe("goalPerCheck", () => {
  it("splits the shortfall across remaining paychecks, rounded up to cents", () => {
    const g = goalPerCheck(
      flat,
      { targetAmount: 600, targetDate: "2026-10-01" },
      TODAY,
      paydays,
    )!;
    expect(g.paydaysLeft).toBe(4); // through 9/25
    expect(g.shortfall).toBe(400);
    expect(g.perCheck).toBe(100);
    expect(g.projectedAtTarget).toBe(200);
  });

  it("on-track goals ask for 0 per check", () => {
    const g = goalPerCheck(
      flat,
      { targetAmount: 150, targetDate: "2026-10-01" },
      TODAY,
      paydays,
    )!;
    expect(g.perCheck).toBe(0);
    expect(g.shortfall).toBeLessThan(0);
  });

  it("null when the date has passed or no paydays remain before it", () => {
    expect(
      goalPerCheck(flat, { targetAmount: 600, targetDate: "2026-08-01" }, TODAY, paydays),
    ).toBeNull();
    expect(
      goalPerCheck(flat, { targetAmount: 600, targetDate: "2026-08-10" }, TODAY, paydays),
    ).toBeNull();
  });
});
