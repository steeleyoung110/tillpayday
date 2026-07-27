import { describe, expect, it } from "vitest";
import { computeNudges } from "./nudges";
import type { BucketRow, DashboardData, ExpenseRow, IncomeRow } from "./rows";

// 2026-07-27 is a Monday; biweekly anchor 2026-07-20 → last payday Jul 20,
// next Aug 3 (7 days out).
const TODAY = "2026-07-27";

const income = (over: Partial<IncomeRow> = {}): IncomeRow => ({
  id: "job",
  name: "Job",
  amount: 1000,
  frequency: "biweekly",
  kind: "paycheck",
  anchor_date: "2026-07-20",
  created_at: "2026-01-01",
  ...over,
});

const bucket = (id: string, over: Partial<BucketRow> = {}): BucketRow => ({
  id,
  name: id,
  allocation_type: "percent",
  allocation_value: 30,
  is_savings: false,
  is_flexible: false,
  rolls_over: false,
  is_paused: false,
  include_in_net_worth: false,
  sort_order: 0,
  apy: 0,
  starting_balance: 0,
  goal_amount: 0,
  created_at: "2026-01-01",
  ...over,
});

const expense = (over: Partial<ExpenseRow>): ExpenseRow => ({
  id: "e1",
  name: "Rent",
  amount: 100,
  bucket_id: null,
  due_date: TODAY,
  cadence: "one_time",
  is_paused: false,
  created_at: "2026-01-01",
  ...over,
});

const mkData = (over: Partial<DashboardData> = {}): DashboardData => ({
  income: [income()],
  buckets: [
    bucket("bills", { name: "Bills", sort_order: 0 }),
    bucket("save", { name: "Savings", allocation_type: "fixed", allocation_value: 0, is_savings: true, sort_order: 1 }),
  ],
  expenses: [],
  whatIf: [],
  netWorth: [],
  celebrated: [],
  incomeEntries: [],
  goals: [],
  transfers: [],
  ...over,
});

describe("computeNudges", () => {
  it("flags a near-due bill its bucket can't cover, naming the shortfall mechanics", () => {
    // Bills holds 30% of 1000 = $300; a $450 bill lands tomorrow.
    const data = mkData({
      expenses: [expense({ name: "Car repair", amount: 450, bucket_id: "bills", due_date: "2026-07-28" })],
    });
    const nudges = computeNudges(data, TODAY);
    const n = nudges.find((x) => x.type === "bill-underfunded");
    expect(n).toBeDefined();
    expect(n!.message).toContain("Car repair");
    expect(n!.message).toContain("$450.00");
    expect(n!.message).toContain("$300.00");
  });

  it("stays quiet when the bucket is holding enough", () => {
    const data = mkData({
      expenses: [expense({ name: "Insurance", amount: 200, bucket_id: "bills", due_date: "2026-07-28" })],
    });
    expect(computeNudges(data, TODAY).filter((n) => n.type === "bill-underfunded")).toEqual([]);
  });

  it("ignores bills beyond the daysAhead window", () => {
    const data = mkData({
      expenses: [expense({ name: "Far off", amount: 450, bucket_id: "bills", due_date: "2026-07-31" })],
    });
    expect(computeNudges(data, TODAY, 2).filter((n) => n.type === "bill-underfunded")).toEqual([]);
  });

  it("announces payday when it lands tomorrow", () => {
    // Anchor 2026-07-28 (tomorrow) — biweekly lattice puts a payday there.
    const data = mkData({ income: [income({ anchor_date: "2026-07-28" })] });
    expect(computeNudges(data, TODAY).some((n) => n.type === "payday-tomorrow")).toBe(true);
  });

  it("reports negative savings with the real number", () => {
    // A $2,000 expense from savings on payday drains everything: buckets
    // cascade to zero and savings absorbs the rest.
    const data = mkData({
      expenses: [expense({ name: "Disaster", amount: 2000, bucket_id: null, due_date: "2026-07-20" })],
    });
    const n = computeNudges(data, TODAY).find((x) => x.type === "savings-negative");
    expect(n).toBeDefined();
    expect(n!.message).toContain("in the red");
  });

  it("returns nothing without a pay cycle", () => {
    expect(computeNudges(mkData({ income: [] }), TODAY)).toEqual([]);
  });
});
