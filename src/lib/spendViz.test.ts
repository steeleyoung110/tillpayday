import { describe, expect, it } from "vitest";
import { dailySpendHeatmap, monthlyCategoryTotals } from "./spendViz";
import type { Expense } from "./engine";
import type { BucketRow } from "./rows";

const spend = (id: string, amount: number, dueDate: string, over: Partial<Expense> = {}): Expense => ({
  id, name: id, amount, bucketId: "food", dueDate, cadence: "one_time", ...over,
});

const bucket = (id: string, name: string, over: Partial<BucketRow> = {}): BucketRow => ({
  id, name,
  allocation_type: "percent", allocation_value: 10, is_savings: false, is_flexible: false,
  rolls_over: false, is_paused: false, include_in_net_worth: false, sort_order: 0,
  apy: 0, starting_balance: 0, goal_amount: 0, created_at: "2026-01-01",
  ...over,
});

describe("dailySpendHeatmap", () => {
  it("covers exactly the window with per-day totals and a max", () => {
    const h = dailySpendHeatmap(
      [spend("a", 40, "2026-07-25"), spend("b", 10, "2026-07-25"), spend("c", 20, "2026-07-20")],
      "2026-07-27",
      14,
    );
    expect(h.days).toHaveLength(14);
    expect(h.days[0].date).toBe("2026-07-14");
    expect(h.days[13].date).toBe("2026-07-27");
    expect(h.days.find((d) => d.date === "2026-07-25")!.total).toBe(50);
    expect(h.max).toBe(50);
    expect(h.total).toBe(70);
  });

  it("recurring bills land on their occurrence days; paused ones don't", () => {
    const h = dailySpendHeatmap(
      [
        spend("rent", 600, "2026-05-05", { cadence: "monthly" }),
        spend("paused", 99, "2026-07-20", { isPaused: true }),
      ],
      "2026-07-27",
      91,
    );
    expect(h.days.find((d) => d.date === "2026-07-05")!.total).toBe(600);
    expect(h.days.find((d) => d.date === "2026-06-05")!.total).toBe(600);
    expect(h.days.find((d) => d.date === "2026-07-20")!.total).toBe(0);
  });
});

describe("monthlyCategoryTotals", () => {
  const buckets = [
    bucket("food", "Food"),
    bucket("fun", "Fun money", { is_flexible: true }),
  ];

  it("groups by semantic category per calendar month, oldest first", () => {
    const rows = monthlyCategoryTotals(
      [
        spend("a", 100, "2026-06-10"),
        spend("b", 50, "2026-06-12", { bucketId: "fun" }),
        spend("c", 80, "2026-07-02"),
      ],
      buckets,
      "2026-07-27",
      3,
    );
    expect(rows.map((r) => r.month)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(rows[1].byCategory.food).toBe(100);
    expect(rows[1].byCategory.fun).toBe(50);
    expect(rows[1].total).toBe(150);
    expect(rows[2].byCategory.food).toBe(80);
  });

  it("null bucket counts as savings; unknown ids as other", () => {
    const rows = monthlyCategoryTotals(
      [
        spend("a", 30, "2026-07-05", { bucketId: null }),
        spend("b", 20, "2026-07-06", { bucketId: "ghost" }),
      ],
      buckets,
      "2026-07-27",
      1,
    );
    expect(rows[0].byCategory.savings).toBe(30);
    expect(rows[0].byCategory.other).toBe(20);
  });

  it("the current month is partial and only counts through today", () => {
    const rows = monthlyCategoryTotals(
      [spend("future", 500, "2026-07-30")],
      buckets,
      "2026-07-27",
      1,
    );
    expect(rows[0].total).toBe(0); // due after today — not spent yet
  });
});
