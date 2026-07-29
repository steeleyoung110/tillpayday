import { describe, expect, it } from "vitest";
import { crisisPlan } from "./crisisPlan";
import type { BucketRow, ExpenseRow } from "./rows";

const bucket = (id: string, name: string, flexible: boolean): BucketRow =>
  ({
    id, name, allocation_type: "fixed", allocation_value: 0, is_savings: false,
    is_flexible: flexible, rolls_over: false, is_paused: false,
    include_in_net_worth: false, sort_order: 0, apy: 0, starting_balance: 0,
    goal_amount: 0, created_at: "",
  }) as BucketRow;

const bill = (
  id: string, name: string, amount: number, bucketId: string | null,
  cadence = "monthly", paused = false,
): ExpenseRow =>
  ({
    id, name, amount, bucket_id: bucketId, due_date: "2026-01-01",
    cadence, is_paused: paused, renewal_date: null, created_by: null,
    split_ways: 1, created_at: "",
  }) as ExpenseRow;

const buckets = [bucket("b", "Bills", false), bucket("f", "Fun", true)];

describe("crisisPlan", () => {
  it("separates essentials from pause candidates and does the runway math", () => {
    const plan = crisisPlan(3000, [
      bill("rent", "Rent", 900, "b"),
      bill("ins", "Insurance", 300, "b", "quarterly"), // 100/mo essential
      bill("net", "Netflix", 15, "f"),
      bill("spot", "Spotify", 12, "f"),
      bill("gym", "Gym", 45, "f", "monthly", true), // already paused
      bill("coffee", "Coffee", 6, "f", "one_time"), // not a standing bill
    ], buckets);

    expect(plan.essentialMonthly).toBe(1000);
    expect(plan.essentialRunwayDays).toBe(91); // 3000 / (1000/30.44)
    expect(plan.candidates.map((c) => c.name)).toEqual(["Gym", "Netflix", "Spotify"]);
    expect(plan.cutMonthly).toBe(27); // unpaused candidates only
  });

  it("no essential bills → runway is null, liquid clamps at 0", () => {
    const plan = crisisPlan(-50, [], buckets);
    expect(plan.liquid).toBe(0);
    expect(plan.essentialRunwayDays).toBeNull();
  });
});
