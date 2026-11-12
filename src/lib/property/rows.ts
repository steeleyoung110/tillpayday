/**
 * Property-management row shapes (snake_case, as stored in Supabase).
 * No server dependencies — safe to import from server and browser code.
 */

export type PropertyType =
  | "single_family"
  | "duplex"
  | "multi_family"
  | "condo"
  | "townhome"
  | "commercial"
  | "land"
  | "other";

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  single_family: "Single-family",
  duplex: "Duplex",
  multi_family: "Multi-family",
  condo: "Condo",
  townhome: "Townhome",
  commercial: "Commercial",
  land: "Land",
  other: "Other",
};

export type ExpenseCategory =
  | "repairs"
  | "maintenance"
  | "capex"
  | "taxes"
  | "insurance"
  | "utilities"
  | "hoa"
  | "management"
  | "legal"
  | "supplies"
  | "travel"
  | "other";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  repairs: "Repairs",
  maintenance: "Maintenance",
  capex: "Capital improvements",
  taxes: "Property taxes",
  insurance: "Insurance",
  utilities: "Utilities",
  hoa: "HOA dues",
  management: "Management",
  legal: "Legal & professional",
  supplies: "Supplies",
  travel: "Travel & mileage",
  other: "Other",
};

export interface PropertyRow {
  id: string;
  name: string;
  address: string;
  property_type: PropertyType;
  purchase_date: string | null;
  purchase_price: number | null;
  current_value: number | null;
  notes: string | null;
  is_archived: boolean;
  /**
   * Percent of the property that is actually a rental (house-hack: owner in
   * one half of a duplex → 50). Costs count at this share in cash-flow math;
   * equity and debt stay at 100%.
   */
  rental_share: number;
  /** Short-term units: how often a report of completed stays is uploaded. */
  report_cadence?: "monthly" | "quarterly" | null;
  /** First period tracked for rental reports. */
  report_start?: string | null;
  /** Days after a period ends before its report is past due (null = default). */
  report_due_days?: number | null;
  created_at: string;
}

export type RentalType = "long_term" | "short_term";

export interface UnitRow {
  id: string;
  property_id: string;
  label: string;
  notes: string | null;
  sort_order: number;
  /** How this unit rents: leases (long_term) or nightly stays (short_term). */
  rental_type: RentalType;
  created_at: string;
}

export type BookingPlatform = "airbnb" | "vrbo" | "booking" | "direct" | "other";

export const PLATFORM_LABELS: Record<BookingPlatform, string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  booking: "Booking.com",
  direct: "Direct",
  other: "Other",
};

/** One short-term stay; payout is what actually lands after platform fees. */
export interface BookingRow {
  id: string;
  property_id: string;
  unit_id: string | null;
  guest_name: string | null;
  platform: BookingPlatform;
  check_in: string;
  check_out: string;
  payout: number;
  gross_amount: number | null;
  cleaning_fee: number | null;
  platform_fee: number | null;
  status: "confirmed" | "completed" | "canceled";
  external_id: string | null;
  source: "manual" | "csv";
  note: string | null;
  created_at: string;
}

export interface TenantRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
}

export interface LeaseRow {
  id: string;
  unit_id: string;
  tenant_id: string | null;
  rent_amount: number;
  due_day: number;
  start_date: string;
  end_date: string | null;
  deposit_amount: number;
  status: "active" | "ended";
  notes: string | null;
  created_at: string;
}

export interface RentPaymentRow {
  id: string;
  property_id: string;
  lease_id: string | null;
  amount: number;
  /** When the money actually landed; null while the payment is pending. */
  paid_date: string | null;
  /** First of the month this payment covers (null = counts in its paid month). */
  period_month: string | null;
  /**
   * received = money in hand, counts everywhere.
   * pending  = promised (check in the mail, assistance approved) — shown in
   *            purple, counts toward nothing until marked received.
   */
  status: "received" | "pending";
  /** When a pending payment is expected to land (required while pending). */
  expected_date: string | null;
  method: string | null;
  note: string | null;
  /** Set when logged from the board against a payment-plan installment. */
  schedule_id?: string | null;
  /** The installment (due date) this payment answers, when logged from the board. */
  installment_date?: string | null;
  created_at: string;
}

export interface PropertyExpenseRow {
  id: string;
  property_id: string;
  unit_id: string | null;
  amount: number;
  /** First (or only) occurrence; recurring expenses repeat from here. */
  expense_date: string;
  category: ExpenseCategory;
  /** one_time, or a schedule — scheduled months count automatically. */
  cadence: "one_time" | "monthly" | "quarterly" | "yearly";
  vendor: string | null;
  note: string | null;
  created_at: string;
}

export interface MortgageRow {
  id: string;
  property_id: string;
  lender: string;
  original_amount: number | null;
  /** null = not entered yet (equity math reports itself incomplete). */
  current_balance: number | null;
  interest_rate: number | null;
  monthly_payment: number;
  start_date: string | null;
  /** Scheduled end of the loan (start + term), e.g. 30 years out. */
  payoff_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface MortgagePaymentRow {
  id: string;
  mortgage_id: string;
  property_id: string;
  amount: number;
  principal: number | null;
  interest: number | null;
  escrow: number | null;
  paid_date: string;
  note: string | null;
  created_at: string;
}

/** Everything the property screens need, fetched in one pass. */
export interface PortfolioData {
  properties: PropertyRow[];
  units: UnitRow[];
  tenants: TenantRow[];
  leases: LeaseRow[];
  rentPayments: RentPaymentRow[];
  expenses: PropertyExpenseRow[];
  mortgages: MortgageRow[];
  mortgagePayments: MortgagePaymentRow[];
  bookings: BookingRow[];
}

/** An upload indexed against a lease (signed copy) or a rental-report period. */
export interface PropertyFileRow {
  id: string;
  property_id: string;
  kind: "lease" | "rental_report";
  lease_id: string | null;
  /** First day of the month/quarter a rental report covers. */
  period_start: string | null;
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
}
