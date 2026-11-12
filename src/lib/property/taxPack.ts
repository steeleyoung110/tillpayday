/**
 * Tax-time pack: one year of each property's money, organized the way a
 * rental schedule asks for it. Pure and tested.
 *
 * Choices, stated so a preparer can check them:
 * - Cash basis: rent counts on the day it arrived (not the month it covers);
 *   promised (pending) money is left out. Short-term payouts count on the
 *   check-in date, once the stay has finished.
 * - Expenses count on the day paid; a repeating bill counts each time it
 *   came due in the year, through today.
 * - A house-hack property's costs count at its rental share; income whole.
 * - Capital improvements and closing costs are set apart: they usually go
 *   into the property's cost basis rather than being deducted in the year.
 * - Mortgage interest comes from logged payment splits; the lender's 1098 is
 *   the number to file.
 */
import type {
  ExpenseCategory,
  PortfolioData,
  PropertyExpenseRow,
} from "./rows";

export interface ScheduleLine {
  line: string;
  label: string;
}

/** Rental schedule (Schedule E) line for each expense category. */
export const SCHEDULE_E: Record<ExpenseCategory, ScheduleLine> = {
  travel: { line: "6", label: "Auto and travel" },
  maintenance: { line: "7", label: "Cleaning and maintenance" },
  insurance: { line: "9", label: "Insurance" },
  legal: { line: "10", label: "Legal and other professional fees" },
  management: { line: "11", label: "Management fees" },
  repairs: { line: "14", label: "Repairs" },
  supplies: { line: "15", label: "Supplies" },
  taxes: { line: "16", label: "Taxes" },
  utilities: { line: "17", label: "Utilities" },
  hoa: { line: "19", label: "Other: HOA and association dues" },
  other: { line: "19", label: "Other" },
  capex: { line: "", label: "Capital improvement" },
};

/** The deductible lines, in schedule order. */
export const DEDUCTION_LINES: ScheduleLine[] = [
  SCHEDULE_E.travel,
  SCHEDULE_E.maintenance,
  SCHEDULE_E.insurance,
  SCHEDULE_E.legal,
  SCHEDULE_E.management,
  { line: "12", label: "Mortgage interest (logged)" },
  SCHEDULE_E.repairs,
  SCHEDULE_E.supplies,
  SCHEDULE_E.taxes,
  SCHEDULE_E.utilities,
  SCHEDULE_E.hoa,
  SCHEDULE_E.other,
];
export const lineKey = (l: ScheduleLine) => (l.line ? `${l.line} ${l.label}` : l.label);

export type TxnKind = "Rent" | "Short-term payout" | "Expense" | "Mortgage payment";
export type Bucket = "income" | "deduction" | "capital" | "closing" | "mortgage";

export interface TaxTxn {
  date: string;
  propertyId: string;
  property: string;
  kind: TxnKind;
  bucket: Bucket;
  /** "14 Repairs", "Capital improvement", "3 Rents received"… */
  line: string;
  category: string;
  who: string;
  memo: string;
  /** Full amount as paid or received. */
  amount: number;
  /** Rental share applied (percent, 100 = all of it). */
  sharePct: number;
  /** The part that counts for the rental (amount × share; income stays whole). */
  counted: number;
}

export interface PropertyTax {
  propertyId: string;
  name: string;
  sharePct: number;
  rents: number;
  strPayouts: number;
  /** Booking gross and platform fees, where the booking import had them. */
  strGross: number;
  strFees: number;
  income: number;
  /** Counted (rental-share) totals by deduction line key. */
  byLine: Record<string, number>;
  deductions: number;
  capital: number;
  closing: number;
  interestLogged: number;
  mortgagePaid: number;
  /** Mortgage payments in the year without a principal/interest split. */
  mortgageUnsplit: number;
  /** income − deductions (incl. logged interest). Before depreciation. */
  net: number;
  incomeByMonth: number[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const CADENCE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const;
const CLOSING_RE = /\b(closing|alta|settlement statement|title (co|company|insurance))\b|\btitle\b.*\bclos/i;

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = total % 12;
  const dim = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, dim)).padStart(2, "0")}`;
}

/** Each date in `year` an expense came due, through `today`. */
export function expenseDates(e: Pick<PropertyExpenseRow, "expense_date" | "cadence">, year: number, today: string): string[] {
  const last = `${year}-12-31` < today ? `${year}-12-31` : today;
  if (e.cadence === "one_time" || !(e.cadence in CADENCE_MONTHS)) {
    return e.expense_date.startsWith(`${year}-`) && e.expense_date <= last ? [e.expense_date] : [];
  }
  const step = CADENCE_MONTHS[e.cadence as keyof typeof CADENCE_MONTHS];
  const out: string[] = [];
  for (let k = 0, d = e.expense_date; d <= last && k < 2000; k += 1, d = addMonths(e.expense_date, k * step)) {
    if (d.startsWith(`${year}-`)) out.push(d);
  }
  return out;
}

export function isClosingCost(e: Pick<PropertyExpenseRow, "vendor" | "note">): boolean {
  return CLOSING_RE.test(`${e.vendor ?? ""} ${e.note ?? ""}`);
}

export function taxYear(
  data: Pick<PortfolioData, "properties" | "rentPayments" | "bookings" | "expenses" | "mortgagePayments" | "tenants" | "leases">,
  year: number,
  today: string,
): { properties: PropertyTax[]; txns: TaxTxn[] } {
  const txns: TaxTxn[] = [];
  const tenantOfLease = new Map(
    data.leases.map((l) => [l.id, data.tenants.find((t) => t.id === l.tenant_id)?.full_name ?? ""]),
  );
  const props = data.properties;
  const out: PropertyTax[] = [];

  for (const p of props) {
    const share = Number(p.rental_share ?? 100);
    const f = share / 100;
    const pt: PropertyTax = {
      propertyId: p.id,
      name: p.name,
      sharePct: share,
      rents: 0,
      strPayouts: 0,
      strGross: 0,
      strFees: 0,
      income: 0,
      byLine: {},
      deductions: 0,
      capital: 0,
      closing: 0,
      interestLogged: 0,
      mortgagePaid: 0,
      mortgageUnsplit: 0,
      net: 0,
      incomeByMonth: Array(12).fill(0),
    };
    const addLine = (key: string, amt: number) => {
      pt.byLine[key] = round2((pt.byLine[key] ?? 0) + amt);
    };

    // Rent received (cash basis)
    for (const r of data.rentPayments) {
      if (r.property_id !== p.id || r.status === "pending" || !r.paid_date) continue;
      if (!r.paid_date.startsWith(`${year}-`) || r.paid_date > today) continue;
      const amt = Number(r.amount);
      pt.rents = round2(pt.rents + amt);
      pt.incomeByMonth[Number(r.paid_date.slice(5, 7)) - 1] = round2(pt.incomeByMonth[Number(r.paid_date.slice(5, 7)) - 1] + amt);
      txns.push({
        date: r.paid_date,
        propertyId: p.id,
        property: p.name,
        kind: "Rent",
        bucket: "income",
        line: "3 Rents received",
        category: "Rent",
        who: (r.lease_id && tenantOfLease.get(r.lease_id)) || "",
        memo: [r.method, r.note].filter(Boolean).join(" · "),
        amount: amt,
        sharePct: 100,
        counted: amt,
      });
    }

    // Short-term stays that have finished
    for (const b of data.bookings) {
      if (b.property_id !== p.id || b.status === "canceled") continue;
      if (!b.check_in.startsWith(`${year}-`) || b.check_out > today) continue;
      const amt = Number(b.payout);
      pt.strPayouts = round2(pt.strPayouts + amt);
      if (b.gross_amount != null) pt.strGross = round2(pt.strGross + Number(b.gross_amount));
      if (b.platform_fee != null) pt.strFees = round2(pt.strFees + Number(b.platform_fee));
      pt.incomeByMonth[Number(b.check_in.slice(5, 7)) - 1] = round2(pt.incomeByMonth[Number(b.check_in.slice(5, 7)) - 1] + amt);
      txns.push({
        date: b.check_in,
        propertyId: p.id,
        property: p.name,
        kind: "Short-term payout",
        bucket: "income",
        line: "3 Rents received",
        category: `Stay ${b.check_in} to ${b.check_out}`,
        who: b.platform,
        memo: [
          b.gross_amount != null ? `gross ${Number(b.gross_amount).toFixed(2)}` : "",
          b.platform_fee != null ? `platform fee ${Number(b.platform_fee).toFixed(2)}` : "",
          b.cleaning_fee != null ? `cleaning ${Number(b.cleaning_fee).toFixed(2)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        amount: amt,
        sharePct: 100,
        counted: amt,
      });
    }

    // Expenses
    for (const e of data.expenses) {
      if (e.property_id !== p.id) continue;
      const closing = isClosingCost(e);
      const bucket: Bucket = closing ? "closing" : e.category === "capex" ? "capital" : "deduction";
      const sl = SCHEDULE_E[e.category] ?? SCHEDULE_E.other;
      for (const d of expenseDates(e, year, today)) {
        const amt = Number(e.amount);
        const counted = round2(amt * f);
        if (bucket === "deduction") {
          addLine(lineKey(sl), counted);
          pt.deductions = round2(pt.deductions + counted);
        } else if (bucket === "capital") pt.capital = round2(pt.capital + counted);
        else pt.closing = round2(pt.closing + counted);
        txns.push({
          date: d,
          propertyId: p.id,
          property: p.name,
          kind: "Expense",
          bucket,
          line: bucket === "closing" ? "Closing cost (cost basis)" : bucket === "capital" ? "Capital improvement" : lineKey(sl),
          category: e.category,
          who: e.vendor ?? "",
          memo: [e.cadence !== "one_time" ? `repeats ${e.cadence}` : "", e.note ?? ""].filter(Boolean).join(" · "),
          amount: amt,
          sharePct: share,
          counted,
        });
      }
    }

    // Mortgage payments
    for (const m of data.mortgagePayments) {
      if (m.property_id !== p.id || !m.paid_date.startsWith(`${year}-`) || m.paid_date > today) continue;
      const amt = Number(m.amount);
      pt.mortgagePaid = round2(pt.mortgagePaid + amt);
      const split = m.interest != null || m.principal != null || m.escrow != null;
      if (!split) pt.mortgageUnsplit = round2(pt.mortgageUnsplit + amt);
      const interest = round2(Number(m.interest ?? 0) * f);
      if (interest > 0) {
        pt.interestLogged = round2(pt.interestLogged + interest);
        addLine("12 Mortgage interest (logged)", interest);
        pt.deductions = round2(pt.deductions + interest);
      }
      txns.push({
        date: m.paid_date,
        propertyId: p.id,
        property: p.name,
        kind: "Mortgage payment",
        bucket: "mortgage",
        line: interest > 0 ? "12 Mortgage interest (logged)" : "Mortgage (no split logged)",
        category: "mortgage",
        who: "",
        memo: split
          ? `principal ${Number(m.principal ?? 0).toFixed(2)} · interest ${Number(m.interest ?? 0).toFixed(2)} · escrow ${Number(m.escrow ?? 0).toFixed(2)}`
          : "split not logged — use the lender's 1098",
        amount: amt,
        sharePct: share,
        counted: interest,
      });
    }

    pt.income = round2(pt.rents + pt.strPayouts);
    pt.net = round2(pt.income - pt.deductions);
    out.push(pt);
  }

  txns.sort((a, b) => a.date.localeCompare(b.date) || a.property.localeCompare(b.property));
  return { properties: out, txns };
}
