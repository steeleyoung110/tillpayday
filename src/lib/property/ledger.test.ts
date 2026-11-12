import { describe, expect, it } from "vitest";
import { propertyLedger } from "./ledger";
import { leaseBalance } from "./tenancy";

const lease = {
  rent_amount: 2000,
  due_day: 1,
  start_date: "2026-08-01",
  end_date: null,
  status: "active" as const,
};

describe("propertyLedger", () => {
  it("charges each month once its due day arrives and runs the balance", () => {
    const rows = propertyLedger(
      [lease],
      [
        { amount: 2000, status: "received", paid_date: "2026-08-03", expected_date: null },
        { amount: 1500, status: "received", paid_date: "2026-09-05", expected_date: null },
        { amount: 700, status: "received", paid_date: "2026-11-09", expected_date: null },
        { amount: 500, status: "pending", paid_date: null, expected_date: "2026-11-20" },
      ],
      "2026-11-12",
    );
    expect(rows).toEqual([
      { month: "2026-08", charged: 2000, received: 2000, pending: 0, balance: 0 },
      { month: "2026-09", charged: 2000, received: 1500, pending: 0, balance: 500 },
      { month: "2026-10", charged: 2000, received: 0, pending: 0, balance: 2500 },
      { month: "2026-11", charged: 2000, received: 700, pending: 500, balance: 3800 },
    ]);
  });

  it("ends on the same balance as the tenant-balance math", () => {
    const pays = [
      { amount: 2000, status: "received" as const, paid_date: "2026-08-03", expected_date: null },
      { amount: 900, status: "received" as const, paid_date: "2026-10-15", expected_date: null },
      { amount: 300, status: "pending" as const, paid_date: null, expected_date: "2026-11-30" },
    ];
    const rows = propertyLedger([lease], pays, "2026-11-12");
    expect(rows[rows.length - 1].balance).toBe(leaseBalance(lease, pays, "2026-11-12").owed);
  });

  it("stops charging after a lease ends and skips months not yet due", () => {
    const rows = propertyLedger([{ ...lease, end_date: "2026-09-30" }], [], "2026-11-12");
    expect(rows.map((r) => [r.month, r.charged])).toEqual([
      ["2026-08", 2000],
      ["2026-09", 2000],
      ["2026-10", 0],
      ["2026-11", 0],
    ]);
    // Nothing due yet and nothing paid: an empty ledger.
    expect(propertyLedger([{ ...lease, due_day: 15 }], [], "2026-08-10")).toEqual([]);
  });
});
