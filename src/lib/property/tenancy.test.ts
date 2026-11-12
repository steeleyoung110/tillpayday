import { describe, expect, it } from "vitest";
import { balanceLabel, leaseBalance } from "./tenancy";
import type { LeaseRow } from "./rows";

const lease = (over: Partial<LeaseRow> = {}) => ({
  rent_amount: 2300,
  due_day: 1,
  start_date: "2025-11-01",
  end_date: "2026-10-31" as string | null,
  status: "active" as const,
  ...over,
});

const pay = (amount: number) => ({ amount });

describe("leaseBalance", () => {
  it("12 months due, $15,500 paid = $12,100 owed", () => {
    // Example tenant: Nov 2025 – Oct 2026 at $2,300; October due Oct 1; today Oct 1.
    const b = leaseBalance(lease(), [pay(15500)], "2026-10-01");
    expect(b.monthsDue).toBe(12);
    expect(b.expected).toBe(27600);
    expect(b.owed).toBe(12100);
    expect(balanceLabel(b)).toBe("behind about 5 months");
  });

  it("a month isn't due until its due day arrives", () => {
    // Due the 5th: on Oct 1 the October rent isn't owed yet.
    const b = leaseBalance(lease({ due_day: 5 }), [pay(2300 * 11)], "2026-10-01");
    expect(b.monthsDue).toBe(11);
    expect(b.owed).toBe(0);
    expect(balanceLabel(b)).toBe("paid up");
  });

  it("an ended lease stops billing at its end date", () => {
    const b = leaseBalance(
      lease({ start_date: "2024-11-01", end_date: "2025-10-31", rent_amount: 2250, status: "ended" }),
      Array.from({ length: 12 }, () => pay(2250)),
      "2026-10-01",
    );
    expect(b.monthsDue).toBe(12);
    expect(b.owed).toBe(0);
  });

  it("overpayment reads as paid ahead", () => {
    const b = leaseBalance(lease({ start_date: "2026-09-01", end_date: null }), [pay(5000)], "2026-10-01");
    expect(b.monthsDue).toBe(2);
    expect(b.owed).toBe(4600 - 5000);
    expect(balanceLabel(b)).toBe("paid ahead");
  });

  it("a lease that hasn't started yet owes nothing", () => {
    const b = leaseBalance(lease({ start_date: "2026-11-01", end_date: null }), [], "2026-10-01");
    expect(b.monthsDue).toBe(0);
    expect(b.expected).toBe(0);
  });
});

describe("leaseBalance — pending payments", () => {
  it("a pending payment does not make the tenant less behind", () => {
    const l = {
      rent_amount: 1000, due_day: 1, start_date: "2026-01-01",
      end_date: null, status: "active" as const,
    };
    const today = "2026-03-15"; // 3 months due
    const real = { amount: 1000 };
    const promised = { amount: 1311, status: "pending" as const };
    const before = leaseBalance(l, [real], today);
    const withPending = leaseBalance(l, [real, promised], today);
    expect(before.owed).toBe(2000);
    expect(withPending.owed).toBe(2000); // the check hasn't cleared
    expect(leaseBalance(l, [real, { ...promised, status: "received" }], today).owed).toBe(689);
  });
});
