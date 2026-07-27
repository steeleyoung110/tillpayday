import { describe, expect, it } from "vitest";
import { auditSubscriptions } from "./subscriptions";
import type { BucketRow, ExpenseRow, IncomeRow } from "./rows";

const bucket = (id: string, name: string, over: Partial<BucketRow> = {}): BucketRow => ({
  id,
  name,
  allocation_type: "percent",
  allocation_value: 10,
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
  id: "e",
  name: "Bill",
  amount: 10,
  bucket_id: null,
  due_date: "2026-01-01",
  cadence: "monthly",
  is_paused: false,
  created_at: "2026-01-01",
  ...over,
});

const income: IncomeRow[] = [
  { id: "job", name: "Job", amount: 1000, frequency: "biweekly", kind: "paycheck", anchor_date: "2026-01-01", created_at: "2026-01-01" },
];

describe("auditSubscriptions", () => {
  it("annualizes each cadence and sorts by yearly damage", () => {
    const audit = auditSubscriptions(
      [
        expense({ id: "a", name: "Streaming", amount: 14.99, cadence: "monthly" }),
        expense({ id: "b", name: "Insurance", amount: 300, cadence: "quarterly" }),
        expense({ id: "c", name: "Domain", amount: 20, cadence: "yearly" }),
        expense({ id: "d", name: "One-off", amount: 999, cadence: "one_time" }),
      ],
      [],
      income,
    );
    expect(audit.rows.map((r) => r.name)).toEqual(["Insurance", "Streaming", "Domain"]);
    expect(audit.rows[0].yearlyCost).toBe(1200); // 300 × 4
    expect(audit.rows[1].yearlyCost).toBe(179.88); // 14.99 × 12
    expect(audit.rows[2].yearlyCost).toBe(20);
    expect(audit.yearlyTotal).toBe(1399.88);
  });

  it("computes share of income from paycheck frequency (biweekly = 26 checks)", () => {
    const audit = auditSubscriptions(
      [expense({ name: "Streaming", amount: 100, cadence: "monthly" })],
      [],
      income,
    );
    expect(audit.yearlyIncome).toBe(26000);
    expect(audit.pctOfIncome).toBe(4.6); // 1200 / 26000
  });

  it("flags fun-bucket subscriptions as cancel candidates; bills aren't", () => {
    const buckets = [
      bucket("fun", "Fun Money", { is_flexible: true }),
      bucket("bills", "Bills"),
    ];
    const audit = auditSubscriptions(
      [
        expense({ id: "a", name: "Game pass", amount: 15, cadence: "monthly", bucket_id: "fun" }),
        expense({ id: "b", name: "Car insurance", amount: 100, cadence: "monthly", bucket_id: "bills" }),
      ],
      buckets,
      income,
    );
    expect(audit.rows.find((r) => r.name === "Game pass")!.cancelCandidate).toBe(true);
    expect(audit.rows.find((r) => r.name === "Car insurance")!.cancelCandidate).toBe(false);
  });

  it("paused subscriptions stay listed but don't count toward the total", () => {
    const audit = auditSubscriptions(
      [
        expense({ id: "a", name: "Active", amount: 10, cadence: "monthly" }),
        expense({ id: "b", name: "Paused", amount: 50, cadence: "monthly", is_paused: true }),
      ],
      [],
      income,
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.yearlyTotal).toBe(120);
  });

  it("no paycheck income → pctOfIncome is null, never a fake 0%", () => {
    const audit = auditSubscriptions(
      [expense({ name: "Streaming", amount: 10, cadence: "monthly" })],
      [],
      [],
    );
    expect(audit.pctOfIncome).toBeNull();
  });
});
