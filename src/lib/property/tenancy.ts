/**
 * Tenant balance math: what a lease has asked for versus what its payments
 * delivered, as of today. Pure and tested — this is the "behind about 4
 * months" number, computed instead of hand-written.
 */
import type { LeaseRow, RentPaymentRow } from "./rows";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface LeaseBalance {
  /** Rent the lease has asked for through today (months whose due date passed). */
  expected: number;
  /** Payments linked to this lease. */
  collected: number;
  /** expected − collected; negative = tenant is ahead (credit). */
  owed: number;
  /** owed expressed in months of rent, one decimal. */
  monthsBehind: number;
  /** Months billed so far. */
  monthsDue: number;
}

/**
 * Balance for one lease. A month counts as due once its due date (due_day,
 * clamped into the month) has arrived, from the lease's start month through
 * its end month (or today). Payments count by their amount alone — which
 * month they were credited to doesn't change what's owed in total.
 */
export function leaseBalance(
  lease: Pick<LeaseRow, "rent_amount" | "due_day" | "start_date" | "end_date" | "status">,
  payments: Pick<RentPaymentRow, "amount">[],
  todayISO: string,
): LeaseBalance {
  const rent = Number(lease.rent_amount);
  const start = lease.start_date;
  const endBound =
    lease.end_date ?? (lease.status === "ended" ? lease.start_date : todayISO);
  const last = endBound < todayISO ? endBound : todayISO;

  let monthsDue = 0;
  if (rent > 0 && start <= last) {
    let y = Number(start.slice(0, 4));
    let m = Number(start.slice(5, 7));
    for (;;) {
      const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
      if (monthStart > last) break;
      const due = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(lease.due_day, 28)).padStart(2, "0")}`;
      if (due <= todayISO) monthsDue += 1;
      m += 1;
      if (m === 13) {
        m = 1;
        y += 1;
      }
    }
  }

  const expected = round2(monthsDue * rent);
  const collected = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
  const owed = round2(expected - collected);
  return {
    expected,
    collected,
    owed,
    monthsBehind: rent > 0 ? Math.round((owed / rent) * 10) / 10 : 0,
    monthsDue,
  };
}

/** "behind about 4 months" / "1 month behind" / "paid up" / "ahead". */
export function balanceLabel(b: LeaseBalance): string {
  if (b.owed > 0.005) {
    const m = Math.round(b.monthsBehind);
    return m >= 2
      ? `behind about ${m} months`
      : m === 1
        ? "about a month behind"
        : "slightly behind";
  }
  if (b.owed < -0.005) return "paid ahead";
  return "paid up";
}
