import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, getTemplate } from "./templates";

describe("starter templates", () => {
  it("offers exactly the three advertised setups", () => {
    expect(STARTER_TEMPLATES.map((t) => t.key)).toEqual([
      "simple",
      "fifty-thirty-twenty",
      "aggressive-saver",
    ]);
  });

  for (const t of STARTER_TEMPLATES) {
    describe(t.title, () => {
      it("has exactly one savings bucket", () => {
        expect(t.buckets.filter((b) => b.is_savings)).toHaveLength(1);
      });

      it("never allocates more than 100% of a paycheck", () => {
        const pct = t.buckets.reduce((s, b) => s + b.allocation_value, 0);
        expect(pct).toBeLessThanOrEqual(100);
      });

      it("marks at least one spending bucket flexible so safe-to-spend works", () => {
        expect(t.buckets.some((b) => b.is_flexible && !b.is_savings)).toBe(true);
      });

      it("has unique, ordered sort_orders for funding priority", () => {
        const orders = t.buckets.map((b) => b.sort_order);
        expect(new Set(orders).size).toBe(orders.length);
        expect(orders).toEqual([...orders].sort((a, b) => a - b));
      });

      it("the savings bucket carries no percent allocation (it takes leftovers)", () => {
        expect(t.buckets.find((b) => b.is_savings)!.allocation_value).toBe(0);
      });
    });
  }

  it("expected paycheck splits: Simple leaves 0% over, 50/30/20 leaves 20%, Aggressive 15%", () => {
    const leftover = (key: string) =>
      100 - getTemplate(key)!.buckets.reduce((s, b) => s + b.allocation_value, 0);
    expect(leftover("simple")).toBe(0);
    expect(leftover("fifty-thirty-twenty")).toBe(20);
    expect(leftover("aggressive-saver")).toBe(15);
  });

  it("getTemplate rejects unknown keys", () => {
    expect(getTemplate("yolo")).toBeUndefined();
  });
});
