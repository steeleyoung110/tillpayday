import { describe, expect, it } from "vitest";
import {
  equitySummary,
  leaseMonthsInYear,
  rentAttribution,
  yearFinance,
  yearsWithActivity,
} from "./finance";
import type {
  BookingRow,
  LeaseRow,
  MortgagePaymentRow,
  MortgageRow,
  PropertyExpenseRow,
  RentPaymentRow,
  UnitRow,
} from "./rows";

// ---------------------------------------------------------------------------
// Fixture: two properties.
// A = single-family, rented all of 2026 at $1,500 (lease started 2025).
// B = duplex, one unit rented at $1,100 from March 2026, the other vacant.
// ---------------------------------------------------------------------------
const units: UnitRow[] = [
  { id: "uA", property_id: "A", label: "Main", notes: null, sort_order: 0, created_at: "" },
  { id: "uB1", property_id: "B", label: "Unit 1", notes: null, sort_order: 0, created_at: "" },
  { id: "uB2", property_id: "B", label: "Unit 2", notes: null, sort_order: 1, created_at: "" },
];

const leases: LeaseRow[] = [
  {
    id: "lA", unit_id: "uA", tenant_id: "t1", rent_amount: 1500, due_day: 1,
    start_date: "2025-06-01", end_date: null, deposit_amount: 1500,
    status: "active", notes: null, created_at: "",
  },
  {
    id: "lB", unit_id: "uB1", tenant_id: "t2", rent_amount: 1100, due_day: 1,
    start_date: "2026-03-01", end_date: null, deposit_amount: 1100,
    status: "active", notes: null, created_at: "",
  },
];

const pay = (
  id: string, property_id: string, amount: number, paid: string, period: string | null = null,
): RentPaymentRow => ({
  id, property_id, lease_id: null, amount, paid_date: paid, period_month: period,
  method: null, note: null, created_at: "",
});

// A collects all 12 months of 2026; one January payment arrived late (Feb 3)
// but covers January. B collects Mar–Dec (10 months).
const rentPayments: RentPaymentRow[] = [
  pay("rA1", "A", 1500, "2026-02-03", "2026-01-01"), // late but counts in January
  ...Array.from({ length: 11 }, (_, i) =>
    pay(`rA${i + 2}`, "A", 1500, `2026-${String(i + 2).padStart(2, "0")}-01`),
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    pay(`rB${i + 1}`, "B", 1100, `2026-${String(i + 3).padStart(2, "0")}-02`),
  ),
  pay("old", "A", 1400, "2025-12-01"), // previous year — must not leak in
];

const exp = (
  id: string, property_id: string, amount: number, date: string,
  category: PropertyExpenseRow["category"],
): PropertyExpenseRow => ({
  id, property_id, unit_id: null, amount, expense_date: date, category,
  vendor: null, note: null, created_at: "",
});

const expenses: PropertyExpenseRow[] = [
  exp("e1", "A", 800, "2026-04-10", "repairs"),
  exp("e2", "A", 2400, "2026-07-01", "taxes"),
  exp("e3", "A", 5000, "2026-08-15", "capex"), // new roof section — capital, not operating
  exp("e4", "B", 600, "2026-05-20", "insurance"),
  exp("e5", "B", 300, "2025-11-05", "repairs"), // previous year
];

const mortgages: MortgageRow[] = [
  {
    id: "mA", property_id: "A", lender: "Big Bank", original_amount: 200000,
    current_balance: 175000, interest_rate: 6.5, monthly_payment: 1264,
    start_date: "2023-01-01", payoff_date: null, notes: null, created_at: "",
  },
];

const mpay = (
  id: string, amount: number, date: string,
  split?: { principal: number; interest: number; escrow: number },
): MortgagePaymentRow => ({
  id, mortgage_id: "mA", property_id: "A", amount,
  principal: split?.principal ?? null, interest: split?.interest ?? null,
  escrow: split?.escrow ?? null, paid_date: date, note: null, created_at: "",
});

const mortgagePayments: MortgagePaymentRow[] = [
  mpay("m1", 1264, "2026-01-01", { principal: 300, interest: 814, escrow: 150 }),
  mpay("m2", 1264, "2026-02-01", { principal: 302, interest: 812, escrow: 150 }),
  mpay("m3", 1264, "2026-03-01"), // logged without a split
];

const data = {
  units, leases, rentPayments, expenses, mortgagePayments,
  bookings: [], mortgages: [] as MortgageRow[],
};

describe("rentAttribution", () => {
  it("uses the covered month when set, else the paid month", () => {
    expect(rentAttribution({ paid_date: "2026-02-03", period_month: "2026-01-01" }))
      .toEqual({ year: 2026, month: 1 });
    expect(rentAttribution({ paid_date: "2026-02-03", period_month: null }))
      .toEqual({ year: 2026, month: 2 });
  });
});

describe("leaseMonthsInYear", () => {
  it("covers the whole year for an ongoing lease started earlier", () => {
    expect(leaseMonthsInYear(leases[0], 2026)).toHaveLength(12);
  });
  it("starts counting at the lease start month", () => {
    expect(leaseMonthsInYear(leases[1], 2026)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("stops at the end date", () => {
    const ended = { ...leases[0], end_date: "2026-03-15" };
    expect(leaseMonthsInYear(ended, 2026)).toEqual([1, 2, 3]);
  });
});

describe("yearFinance — one property", () => {
  const fA = yearFinance(data, 2026, "A");

  it("collects rent in the covered month and keeps other years out", () => {
    expect(fA.rentCollected).toBe(1500 * 12);
    expect(fA.months[0].rentCollected).toBe(1500); // the late January payment
    expect(fA.months[1].rentCollected).toBe(1500);
  });

  it("splits operating expenses from capex", () => {
    expect(fA.totalExpenses).toBe(800 + 2400 + 5000);
    expect(fA.capex).toBe(5000);
    expect(fA.operatingExpenses).toBe(3200);
    expect(fA.expensesByCategory.taxes).toBe(2400);
  });

  it("computes NOI from operating expenses only", () => {
    expect(fA.noi).toBe(18000 - 3200);
  });

  it("tracks debt service, the split, and the unsplit remainder", () => {
    expect(fA.debtService).toBe(1264 * 3);
    expect(fA.principalPaid).toBe(602);
    expect(fA.interestPaid).toBe(1626);
    expect(fA.escrowPaid).toBe(300);
    expect(fA.unsplitDebtService).toBe(1264);
  });

  it("cash flow subtracts everything you actually paid", () => {
    expect(fA.cashFlow).toBe(18000 - 8200 - 3792);
  });

  it("expected rent and collection rate", () => {
    expect(fA.expectedRent).toBe(1500 * 12);
    expect(fA.collectionRate).toBe(1);
  });
});

describe("yearFinance — combined equals the sum of the parts", () => {
  const all = yearFinance(data, 2026, null);
  const fA = yearFinance(data, 2026, "A");
  const fB = yearFinance(data, 2026, "B");

  it("adds across properties", () => {
    expect(all.rentCollected).toBe(fA.rentCollected + fB.rentCollected);
    expect(all.totalExpenses).toBe(fA.totalExpenses + fB.totalExpenses);
    expect(all.cashFlow).toBe(fA.cashFlow + fB.cashFlow);
    expect(all.expectedRent).toBe(fA.expectedRent + fB.expectedRent);
  });

  it("B's vacancy shows up as expected > collected", () => {
    expect(fB.expectedRent).toBe(1100 * 10);
    expect(fB.rentCollected).toBe(1100 * 10);
    expect(fB.collectionRate).toBe(1);
  });

  it("monthly cash flow sums to the year", () => {
    const monthSum = all.months.reduce((s, m) => s + m.cashFlow, 0);
    expect(Math.abs(monthSum - all.cashFlow)).toBeLessThan(0.01);
  });
});

describe("yearFinance — scheduled debt service", () => {
  // Property A already has logged payments for Jan, Feb, Mar 2026.
  const withLoan = { ...data, mortgages };

  it("assumes the monthly payment for schedule months with nothing logged", () => {
    const f = yearFinance(withLoan, 2026, "A", "2026-10-01");
    // Jan–Mar are logged; Apr–Oct (7 months) are assumed; Nov–Dec are future.
    expect(f.scheduledDebtService).toBe(1264 * 7);
    expect(f.debtService).toBe(1264 * 3 + 1264 * 7);
    expect(f.months[0].debtService).toBe(1264); // logged, not doubled
    expect(f.months[3].debtService).toBe(1264); // assumed
    expect(f.months[10].debtService).toBe(0); // November hasn't happened
  });

  it("starts at the loan's start month and stops at payoff", () => {
    const bounded = {
      ...data,
      mortgagePayments: [],
      mortgages: [{ ...mortgages[0], start_date: "2026-03-15", payoff_date: "2026-06-30" }],
    };
    const f = yearFinance(bounded, 2026, "A", "2026-12-31");
    // Mar, Apr, May, Jun only.
    expect(f.scheduledDebtService).toBe(1264 * 4);
    expect(f.months[1].debtService).toBe(0);
    expect(f.months[6].debtService).toBe(0);
  });

  it("assumes nothing without a schedule date (pure history mode)", () => {
    const f = yearFinance(withLoan, 2026, "A");
    expect(f.scheduledDebtService).toBe(0);
    expect(f.debtService).toBe(1264 * 3);
  });

  it("cash flow includes the assumed payments", () => {
    const f = yearFinance(withLoan, 2026, "A", "2026-10-01");
    expect(f.cashFlow).toBe(
      f.rentCollected - f.totalExpenses - (1264 * 3 + 1264 * 7),
    );
  });
});

describe("yearFinance — short-term stays", () => {
  const stay = (
    id: string, check_in: string, check_out: string, payout: number,
    status: BookingRow["status"] = "confirmed",
  ): BookingRow => ({
    id, property_id: "B", unit_id: "uB2", guest_name: "Guest", platform: "airbnb",
    check_in, check_out, payout, gross_amount: null, cleaning_fee: null,
    platform_fee: null, status, external_id: null, source: "csv", note: null,
    created_at: "",
  });

  const strData = {
    ...data,
    bookings: [
      stay("b1", "2026-01-10", "2026-01-13", 450), // 3 nights, January
      stay("b2", "2026-12-28", "2027-01-03", 900), // spans New Year's
      stay("b3", "2026-06-01", "2026-06-05", 500, "canceled"), // never counts
    ],
  };

  it("adds stay payouts to income in the check-in month", () => {
    const f = yearFinance(strData, 2026, "B");
    expect(f.strIncome).toBe(1350);
    expect(f.ltrIncome).toBe(1100 * 10);
    expect(f.rentCollected).toBe(11000 + 1350);
    expect(f.months[0].rentCollected).toBe(450); // no lease rent in Jan for B
    expect(f.months[11].rentCollected).toBe(1100 + 900); // Dec lease rent + stay
  });

  it("clips nights to the year — a New Year's stay splits across years", () => {
    const f26 = yearFinance(strData, 2026, "B");
    // Jan 10–12 (3) + Dec 28–31 (4).
    expect(f26.bookedNights).toBe(7);
    expect(f26.months[0].bookedNights).toBe(3);
    expect(f26.months[11].bookedNights).toBe(4);

    const f27 = yearFinance(strData, 2027, "B");
    // Jan 1–2 of 2027; the payout stayed in 2026 (check-in year).
    expect(f27.bookedNights).toBe(2);
    expect(f27.strIncome).toBe(0);
  });

  it("never counts canceled stays", () => {
    const f = yearFinance(strData, 2026, "B");
    expect(f.strIncome).toBe(1350); // not 1850
    const june = f.months[5];
    expect(june.bookedNights).toBe(0);
  });

  it("keeps expected rent a long-term concept", () => {
    const f = yearFinance(strData, 2026, "B");
    expect(f.expectedRent).toBe(1100 * 10); // untouched by bookings
  });
});

describe("equitySummary", () => {
  const properties = [
    { id: "A", current_value: 260000, purchase_price: 200000, is_archived: false },
    { id: "B", current_value: null, purchase_price: 310000, is_archived: false },
  ];

  it("values fall back to purchase price; debt nets out", () => {
    const s = equitySummary(properties, mortgages, null);
    expect(s.value).toBe(570000);
    expect(s.debt).toBe(175000);
    expect(s.equity).toBe(395000);
    expect(s.valueIncomplete).toBe(false);
  });

  it("scopes to one property", () => {
    const s = equitySummary(properties, mortgages, "B");
    expect(s.value).toBe(310000);
    expect(s.debt).toBe(0);
    expect(s.equity).toBe(310000);
  });

  it("a balance-less loan flags the math as incomplete instead of counting as $0", () => {
    const s = equitySummary(
      properties,
      [...mortgages, { ...mortgages[0], id: "mB", property_id: "B", current_balance: null }],
      null,
    );
    expect(s.debt).toBe(175000); // only the known balance
    expect(s.debtIncomplete).toBe(true);
  });

  it("flags properties with no value at all", () => {
    const s = equitySummary(
      [{ id: "C", current_value: null, purchase_price: null, is_archived: false }],
      [],
      null,
    );
    expect(s.valueIncomplete).toBe(true);
  });
});

describe("yearsWithActivity", () => {
  it("collects every year money moved, newest first, always including now", () => {
    expect(yearsWithActivity(data, 2027)).toEqual([2027, 2026, 2025]);
  });
});
