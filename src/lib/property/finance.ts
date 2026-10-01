/**
 * Yearly property finance math. Pure functions over logged rows — no dates
 * read from the environment, no I/O, fully testable.
 *
 * Honest-numbers rules baked in:
 * - Rent counts in the month it COVERS (period_month) when known, else the
 *   month it was paid.
 * - Operating expenses exclude capital improvements; capex is reported on its
 *   own line, and cash flow subtracts both.
 * - Mortgage principal is equity you keep, not a cost — but only when a
 *   payment's split is logged. Unsplit payments are counted, in full, as cost,
 *   and the unsplit total is surfaced so the UI can say so.
 */
import type {
  BookingRow,
  ExpenseCategory,
  LeaseRow,
  MortgagePaymentRow,
  MortgageRow,
  PortfolioData,
  PropertyExpenseRow,
  RentPaymentRow,
} from "./rows";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** "YYYY-MM-DD" → { year, month(1-12) } without Date-object timezone traps. */
function ym(dateISO: string): { year: number; month: number } {
  return { year: Number(dateISO.slice(0, 4)), month: Number(dateISO.slice(5, 7)) };
}

/** ISO date + n months, day clamped to the target month's length. */
function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = total % 12;
  const dim = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, dim)).padStart(2, "0")}`;
}

const CADENCE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const;

/** The month a rent payment counts toward. */
export function rentAttribution(p: Pick<RentPaymentRow, "paid_date" | "period_month">): {
  year: number;
  month: number;
} {
  return ym(p.period_month ?? p.paid_date);
}

export interface MonthFinance {
  /** 1–12 */
  month: number;
  /** All income that landed: lease rent + short-term stay payouts. */
  rentCollected: number;
  /** Short-term nights of stays falling inside this month. */
  bookedNights: number;
  /** All property expenses (operating + capex). */
  expenses: number;
  /** Full mortgage payments logged in the month. */
  debtService: number;
  /** rent − expenses − debtService. */
  cashFlow: number;
  /** Rent the active leases said should arrive this month. */
  expectedRent: number;
}

export interface YearFinance {
  year: number;
  /** null = all properties combined. */
  propertyId: string | null;
  /** Everything that came in: ltrIncome + strIncome. */
  rentCollected: number;
  /** Lease rent payments only. */
  ltrIncome: number;
  /** Short-term booking payouts only (counted in their check-in month). */
  strIncome: number;
  /** Short-term nights that fall inside this year. */
  bookedNights: number;
  /** What active leases said should arrive (long-term only). */
  expectedRent: number;
  /** rentCollected / expectedRent, 0–1+; null when nothing was expected. */
  collectionRate: number | null;
  expensesByCategory: Partial<Record<ExpenseCategory, number>>;
  /** Everything except capex. */
  operatingExpenses: number;
  capex: number;
  totalExpenses: number;
  /** rent − operating expenses (capex and debt service excluded). */
  noi: number;
  debtService: number;
  interestPaid: number;
  principalPaid: number;
  escrowPaid: number;
  /** Dollars of mortgage payments logged without a principal/interest split. */
  unsplitDebtService: number;
  /**
   * Debt service assumed from each loan's monthly payment schedule for months
   * with no logged payment. Included in debtService; surfaced so the UI can
   * say which part is assumption rather than record.
   */
  scheduledDebtService: number;
  /** rent − all expenses − all mortgage payments. The number you lived. */
  cashFlow: number;
  months: MonthFinance[];
}

function matchProperty<T extends { property_id: string }>(
  rows: T[],
  propertyId: string | null,
): T[] {
  return propertyId ? rows.filter((r) => r.property_id === propertyId) : rows;
}

/**
 * Months of `year` a lease covers, as 1-12 numbers. A lease covers a month
 * when it overlaps any day of it; an "ended" lease with no end date is
 * treated as ending the day it started (dates win over the status flag
 * everywhere else).
 */
export function leaseMonthsInYear(lease: LeaseRow, year: number): number[] {
  const start = lease.start_date;
  const end =
    lease.end_date ?? (lease.status === "ended" ? lease.start_date : "9999-12-31");
  const months: number[] = [];
  for (let m = 1; m <= 12; m += 1) {
    const monthStart = `${year}-${String(m).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(m).padStart(2, "0")}-31`;
    if (start <= monthEnd && end >= monthStart) months.push(m);
  }
  return months;
}

/** Compute one property's (or the whole portfolio's) finances for one year. */
export function yearFinance(
  data: Pick<
    PortfolioData,
    | "rentPayments"
    | "expenses"
    | "mortgagePayments"
    | "leases"
    | "units"
    | "bookings"
    | "mortgages"
    | "properties"
  >,
  year: number,
  propertyId: string | null = null,
  /**
   * Today (YYYY-MM-DD). When given, loans with a monthly payment count as
   * paid in every schedule month up to this date unless a real payment was
   * logged that month. Omitted = only logged payments count.
   */
  scheduleThrough?: string,
): YearFinance {
  const rents = matchProperty(data.rentPayments, propertyId);
  const expenses = matchProperty(data.expenses, propertyId);
  const debtPays = matchProperty(data.mortgagePayments, propertyId);

  // House-hack share: costs count at each property's rental share (rent
  // income is the rental's by definition and stays whole).
  const shareMap = new Map(data.properties.map((p) => [p.id, Number(p.rental_share ?? 100)]));
  const shareOf = (pid: string) => (shareMap.get(pid) ?? 100) / 100;

  // Leases attach to units; scope them through the unit's property.
  const unitToProperty = new Map(data.units.map((u) => [u.id, u.property_id]));
  const leases = propertyId
    ? data.leases.filter((l) => unitToProperty.get(l.unit_id) === propertyId)
    : data.leases;

  const months: MonthFinance[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    rentCollected: 0,
    bookedNights: 0,
    expenses: 0,
    debtService: 0,
    cashFlow: 0,
    expectedRent: 0,
  }));

  let rentCollected = 0;
  for (const p of rents) {
    const at = rentAttribution(p);
    if (at.year !== year) continue;
    const amt = Number(p.amount);
    rentCollected = round2(rentCollected + amt);
    months[at.month - 1].rentCollected = round2(months[at.month - 1].rentCollected + amt);
  }
  const ltrIncome = rentCollected;

  // Short-term stays: the payout counts in the check-in month; nights are
  // clipped to the year so a New Year's stay splits honestly across years.
  let strIncome = 0;
  let bookedNights = 0;
  const bookings = matchProperty(data.bookings, propertyId).filter(
    (b) => b.status !== "canceled",
  ) as BookingRow[];
  for (const b of bookings) {
    const at = ym(b.check_in);
    if (at.year === year) {
      const amt = Number(b.payout);
      strIncome = round2(strIncome + amt);
      rentCollected = round2(rentCollected + amt);
      months[at.month - 1].rentCollected = round2(
        months[at.month - 1].rentCollected + amt,
      );
    }
    // Count each night (a night belongs to the day it starts on).
    const start = new Date(`${b.check_in}T00:00:00Z`);
    const end = new Date(`${b.check_out}T00:00:00Z`);
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCFullYear() !== year) continue;
      bookedNights += 1;
      months[d.getUTCMonth()].bookedNights += 1;
    }
  }

  const expensesByCategory: Partial<Record<ExpenseCategory, number>> = {};
  let totalExpenses = 0;
  let capex = 0;
  for (const e of expenses as PropertyExpenseRow[]) {
    // Which months of `year` does this expense hit? A one-time expense hits
    // its own date; a recurring one repeats from that date through today
    // (never the future), exactly like the mortgage schedule.
    const hitMonths: number[] = [];
    if (e.cadence === "one_time" || !(e.cadence in CADENCE_MONTHS) || !scheduleThrough) {
      const at = ym(e.expense_date);
      if (at.year === year) hitMonths.push(at.month);
    } else {
      const step = CADENCE_MONTHS[e.cadence as keyof typeof CADENCE_MONTHS];
      for (let k = 0, dIso = e.expense_date; dIso <= scheduleThrough; k += 1) {
        const at = ym(dIso);
        if (at.year === year) hitMonths.push(at.month);
        if (at.year > year) break;
        dIso = addMonthsISO(e.expense_date, (k + 1) * step);
      }
    }
    if (hitMonths.length === 0) continue;

    const amt = round2(Number(e.amount) * shareOf(e.property_id));
    for (const m of hitMonths) {
      totalExpenses = round2(totalExpenses + amt);
      if (e.category === "capex") capex = round2(capex + amt);
      expensesByCategory[e.category] = round2((expensesByCategory[e.category] ?? 0) + amt);
      months[m - 1].expenses = round2(months[m - 1].expenses + amt);
    }
  }
  const operatingExpenses = round2(totalExpenses - capex);

  let debtService = 0;
  let interestPaid = 0;
  let principalPaid = 0;
  let escrowPaid = 0;
  let unsplitDebtService = 0;
  for (const p of debtPays as MortgagePaymentRow[]) {
    const at = ym(p.paid_date);
    if (at.year !== year) continue;
    const s = shareOf(p.property_id);
    const amt = round2(Number(p.amount) * s);
    debtService = round2(debtService + amt);
    months[at.month - 1].debtService = round2(months[at.month - 1].debtService + amt);
    const hasSplit = p.principal != null || p.interest != null || p.escrow != null;
    if (hasSplit) {
      principalPaid = round2(principalPaid + Number(p.principal ?? 0) * s);
      interestPaid = round2(interestPaid + Number(p.interest ?? 0) * s);
      escrowPaid = round2(escrowPaid + Number(p.escrow ?? 0) * s);
    } else {
      unsplitDebtService = round2(unsplitDebtService + amt);
    }
  }

  // Scheduled debt service: "I pay $X a month since <date>" counts as paid in
  // every schedule month that has started, without logging each one. A month
  // with a real logged payment uses the logged truth instead, never both.
  let scheduledDebtService = 0;
  if (scheduleThrough) {
    const loggedMonths = new Set<string>();
    for (const p of debtPays as MortgagePaymentRow[]) {
      const at = ym(p.paid_date);
      loggedMonths.add(`${p.mortgage_id}:${at.year}-${at.month}`);
    }
    for (const loan of matchProperty(data.mortgages, propertyId) as MortgageRow[]) {
      if (!(Number(loan.monthly_payment) > 0) || !loan.start_date) continue;
      const pay = round2(Number(loan.monthly_payment) * shareOf(loan.property_id));
      for (let m = 1; m <= 12; m += 1) {
        const monthStart = `${year}-${String(m).padStart(2, "0")}-01`;
        const monthEnd = `${year}-${String(m).padStart(2, "0")}-31`;
        if (monthStart > scheduleThrough) continue; // the future isn't paid yet
        if (loan.start_date > monthEnd) continue; // before the loan began
        if (loan.payoff_date && loan.payoff_date < monthStart) continue; // done
        if (loggedMonths.has(`${loan.id}:${year}-${m}`)) continue;
        scheduledDebtService = round2(scheduledDebtService + pay);
        debtService = round2(debtService + pay);
        months[m - 1].debtService = round2(months[m - 1].debtService + pay);
      }
    }
  }

  let expectedRent = 0;
  for (const lease of leases) {
    const rent = Number(lease.rent_amount);
    for (const m of leaseMonthsInYear(lease, year)) {
      expectedRent = round2(expectedRent + rent);
      months[m - 1].expectedRent = round2(months[m - 1].expectedRent + rent);
    }
  }

  for (const m of months) {
    m.cashFlow = round2(m.rentCollected - m.expenses - m.debtService);
  }

  return {
    year,
    propertyId,
    rentCollected,
    ltrIncome,
    strIncome,
    bookedNights,
    expectedRent,
    collectionRate: expectedRent > 0 ? round2(rentCollected / expectedRent * 100) / 100 : null,
    expensesByCategory,
    operatingExpenses,
    capex,
    totalExpenses,
    noi: round2(rentCollected - operatingExpenses),
    debtService,
    interestPaid,
    principalPaid,
    escrowPaid,
    unsplitDebtService,
    scheduledDebtService,
    cashFlow: round2(rentCollected - totalExpenses - debtService),
    months,
  };
}

export interface EquitySummary {
  /** Sum of current values (falling back to purchase price when unset). */
  value: number;
  /** Sum of known mortgage balances. */
  debt: number;
  equity: number;
  /** True when at least one property has neither value nor purchase price. */
  valueIncomplete: boolean;
  /** True when a mortgage in view has no balance entered yet. */
  debtIncomplete: boolean;
}

/** Portfolio (or one property's) value, debt and equity as of today’s records. */
export function equitySummary(
  properties: { id: string; current_value: number | null; purchase_price: number | null; is_archived: boolean }[],
  mortgages: Pick<MortgageRow, "property_id" | "current_balance">[],
  propertyId: string | null = null,
): EquitySummary {
  const props = properties.filter(
    (p) => !p.is_archived && (!propertyId || p.id === propertyId),
  );
  let value = 0;
  let valueIncomplete = false;
  for (const p of props) {
    const v = p.current_value ?? p.purchase_price;
    if (v == null) valueIncomplete = true;
    else value = round2(value + Number(v));
  }
  // Debt counts only against the properties in view (archived ones are out).
  // A loan with no balance entered can't be summed — it flags the result as
  // incomplete instead of silently counting as zero debt.
  const inView = new Set(props.map((p) => p.id));
  let debt = 0;
  let debtIncomplete = false;
  for (const m of mortgages) {
    if (!inView.has(m.property_id)) continue;
    if (m.current_balance == null) debtIncomplete = true;
    else debt = round2(debt + Number(m.current_balance));
  }
  return { value, debt, equity: round2(value - debt), valueIncomplete, debtIncomplete };
}

/**
 * Which years have any logged activity (for the year picker). Always includes
 * `currentYear`, sorted descending.
 */
/**
 * With balance, rate, and payment known, estimate how this month's payment
 * splits: interest = balance × rate/12, principal = payment − interest.
 * Returns null when any ingredient is missing or the payment can't cover
 * the interest (negative amortization — worth saying, not hiding).
 */
export function loanSplitEstimate(
  balance: number | null,
  ratePct: number | null,
  payment: number,
): { interest: number; principal: number; underwater: boolean } | null {
  if (balance == null || ratePct == null || !(payment > 0)) return null;
  const interest = round2((Number(balance) * Number(ratePct)) / 100 / 12);
  const principal = round2(payment - interest);
  return { interest, principal: Math.max(0, principal), underwater: principal < 0 };
}

export function yearsWithActivity(
  data: Pick<
    PortfolioData,
    "rentPayments" | "expenses" | "mortgagePayments" | "bookings" | "mortgages"
  >,
  currentYear: number,
): number[] {
  const years = new Set<number>([currentYear]);
  for (const p of data.rentPayments) years.add(rentAttribution(p).year);
  for (const e of data.expenses) years.add(ym(e.expense_date).year);
  for (const p of data.mortgagePayments) years.add(ym(p.paid_date).year);
  for (const b of data.bookings) years.add(ym(b.check_in).year);
  // Recurring expenses are activity in every year from their start.
  for (const e of data.expenses) {
    if (e.cadence === "one_time" || !(e.cadence in CADENCE_MONTHS)) continue;
    const from = Number(e.expense_date.slice(0, 4));
    for (let y = from; y <= currentYear; y += 1) years.add(y);
  }
  // A loan on a schedule is activity in every year it runs.
  for (const m of data.mortgages) {
    if (!(Number(m.monthly_payment) > 0) || !m.start_date) continue;
    const from = Number(m.start_date.slice(0, 4));
    const to = Math.min(
      currentYear,
      m.payoff_date ? Number(m.payoff_date.slice(0, 4)) : currentYear,
    );
    for (let y = from; y <= to; y += 1) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}
