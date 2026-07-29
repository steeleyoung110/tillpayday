import { describe, expect, it } from "vitest";
import { merchantKey, merchantLeaderboard } from "./merchants";

const TODAY = "2026-08-03";
const spend = (name: string, amount: number, due_date: string, cadence = "one_time") => ({
  name,
  amount,
  due_date,
  cadence,
});

describe("merchantKey", () => {
  it("collapses store numbers and case", () => {
    expect(merchantKey("KROGER #221")).toBe(merchantKey("Kroger #354"));
    expect(merchantKey("SHELL OIL 1023")).toBe(merchantKey("Shell Oil 2210"));
    expect(merchantKey("McDonald's")).toBe(merchantKey("MCDONALD'S"));
  });
});

describe("merchantLeaderboard", () => {
  it("groups, totals, and ranks by total", () => {
    const rows = merchantLeaderboard(
      [
        spend("KROGER #221", 84.12, "2026-07-20"),
        spend("Kroger #354", 45.5, "2026-07-01"),
        spend("DoorDash", 28, "2026-07-25"),
        spend("DoorDash", 31, "2026-07-28"),
        spend("DoorDash", 24, "2026-08-01"),
      ],
      TODAY,
    );
    expect(rows[0]).toEqual({ name: "KROGER #221", total: 129.62, count: 2 });
    expect(rows[1]).toEqual({ name: "DoorDash", total: 83, count: 3 });
  });

  it("excludes recurring bills, paused rows, and spends outside the window", () => {
    const rows = merchantLeaderboard(
      [
        spend("Netflix", 15.49, "2026-07-25", "monthly"),
        spend("Old thing", 99, "2026-04-01"),
        { ...spend("Paused", 50, "2026-07-25"), is_paused: true },
        spend("Coffee", 6, "2026-07-30"),
      ],
      TODAY,
    );
    expect(rows).toEqual([{ name: "Coffee", total: 6, count: 1 }]);
  });

  it("caps at top N", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      spend(`Shop ${String.fromCharCode(65 + i)}`, 10 + i, "2026-07-30"),
    );
    expect(merchantLeaderboard(many, TODAY, 90, 8)).toHaveLength(8);
  });
});
