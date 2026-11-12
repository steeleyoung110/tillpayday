import { describe, expect, it } from "vitest";
import { expenseDates, isClosingCost, taxYear } from "./taxPack";

const prop = (id: string, name: string, share = 100) => ({
  id,
  name,
  address: "",
  property_type: "condo" as const,
  purchase_date: null,
  purchase_price: null,
  current_value: null,
  notes: null,
  is_archived: false,
  rental_share: share,
  created_at: "",
});
const exp = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2),
  property_id: "p1",
  unit_id: null,
  amount: 100,
  expense_date: "2026-03-10",
  category: "repairs" as const,
  cadence: "one_time" as const,
  vendor: null,
  note: null,
  created_at: "",
  ...over,
});

describe("expense dates", () => {
  it("one-time in its year; repeating bills each time they came due, through today", () => {
    expect(expenseDates({ expense_date: "2026-03-10", cadence: "one_time" }, 2026, "2026-11-12")).toEqual(["2026-03-10"]);
    expect(expenseDates({ expense_date: "2025-03-10", cadence: "one_time" }, 2026, "2026-11-12")).toEqual([]);
    expect(expenseDates({ expense_date: "2026-10-01", cadence: "monthly" }, 2026, "2026-11-12")).toEqual(["2026-10-01", "2026-11-01"]);
    expect(expenseDates({ expense_date: "2025-12-15", cadence: "quarterly" }, 2026, "2026-11-12")).toEqual([
      "2026-03-15",
      "2026-06-15",
      "2026-09-15",
    ]);
  });
  it("spots closing costs by vendor or note", () => {
    expect(isClosingCost({ vendor: "Cohen Closing & Title", note: null })).toBe(true);
    expect(isClosingCost({ vendor: null, note: "Closing costs per ALTA" })).toBe(true);
    expect(isClosingCost({ vendor: "Home Depot", note: "faucet" })).toBe(false);
  });
});

describe("tax year", () => {
  const data = {
    properties: [prop("p1", "Concord"), prop("p2", "Rochester", 50)],
    tenants: [{ id: "t1", full_name: "Tenant A", email: null, phone: null, notes: null, is_archived: false, created_at: "" }],
    leases: [{ id: "l1", unit_id: "u1", tenant_id: "t1", rent_amount: 2000, due_day: 1, start_date: "2025-01-01", end_date: null, deposit_amount: 0, status: "active" as const, notes: null, created_at: "" }],
    rentPayments: [
      // Paid Dec 30 for January: counts in the year it arrived (cash basis).
      { id: "r0", property_id: "p1", lease_id: "l1", amount: 2000, paid_date: "2025-12-30", period_month: "2026-01-01", status: "received" as const, expected_date: null, method: null, note: null, created_at: "" },
      { id: "r1", property_id: "p1", lease_id: "l1", amount: 2000, paid_date: "2026-02-01", period_month: null, status: "received" as const, expected_date: null, method: "Venmo", note: null, created_at: "" },
      { id: "r2", property_id: "p1", lease_id: "l1", amount: 700, paid_date: null, period_month: null, status: "pending" as const, expected_date: "2026-11-20", method: null, note: null, created_at: "" },
    ],
    bookings: [
      { id: "b1", property_id: "p1", unit_id: null, guest_name: null, platform: "airbnb" as const, check_in: "2026-07-01", check_out: "2026-07-03", payout: 300, gross_amount: 350, cleaning_fee: null, platform_fee: 50, status: "completed" as const, external_id: null, source: "csv" as const, note: null, created_at: "" },
      { id: "b2", property_id: "p1", unit_id: null, guest_name: null, platform: "airbnb" as const, check_in: "2026-11-20", check_out: "2026-11-22", payout: 400, gross_amount: null, cleaning_fee: null, platform_fee: null, status: "confirmed" as const, external_id: null, source: "manual" as const, note: null, created_at: "" },
    ],
    expenses: [
      exp({ amount: 200, category: "repairs" }),
      exp({ amount: 219.51, category: "hoa", cadence: "monthly", expense_date: "2026-10-01" }),
      exp({ amount: 5000, category: "capex" }),
      exp({ amount: 1144.04, category: "legal", vendor: "Cohen Closing & Title" }),
      exp({ property_id: "p2", amount: 300, category: "utilities" }),
    ],
    mortgagePayments: [
      { id: "m1", mortgage_id: "x", property_id: "p2", amount: 2000, principal: 600, interest: 1200, escrow: 200, paid_date: "2026-01-01", note: null, created_at: "" },
      { id: "m2", mortgage_id: "x", property_id: "p2", amount: 2000, principal: null, interest: null, escrow: null, paid_date: "2026-02-01", note: null, created_at: "" },
    ],
  };
  const { properties, txns } = taxYear(data as never, 2026, "2026-11-12");
  const concord = properties.find((p) => p.name === "Concord")!;
  const rochester = properties.find((p) => p.name === "Rochester")!;

  it("counts rent on the day it arrived and leaves promised money out", () => {
    expect(concord.rents).toBe(2000);
  });
  it("counts finished stays and keeps the platform fee visible", () => {
    expect(concord.strPayouts).toBe(300);
    expect(concord.strGross).toBe(350);
    expect(concord.strFees).toBe(50);
    expect(concord.income).toBe(2300);
  });
  it("sorts expenses into schedule lines and sets capital and closing costs apart", () => {
    expect(concord.byLine["14 Repairs"]).toBe(200);
    expect(concord.byLine["19 Other: HOA and association dues"]).toBe(439.02);
    expect(concord.capital).toBe(5000);
    expect(concord.closing).toBe(1144.04);
    expect(concord.deductions).toBe(639.02);
    expect(concord.net).toBe(1660.98);
  });
  it("applies a house-hack rental share to costs and logged interest", () => {
    expect(rochester.byLine["17 Utilities"]).toBe(150);
    expect(rochester.interestLogged).toBe(600);
    expect(rochester.mortgagePaid).toBe(4000);
    expect(rochester.mortgageUnsplit).toBe(2000);
    expect(rochester.deductions).toBe(750);
  });
  it("lists every transaction once, in date order", () => {
    expect(txns.map((t) => t.date)).toEqual([...txns.map((t) => t.date)].sort());
    expect(txns.filter((t) => t.kind === "Expense" && t.category === "hoa")).toHaveLength(2);
    expect(txns.some((t) => t.date === "2025-12-30")).toBe(false);
  });
});
