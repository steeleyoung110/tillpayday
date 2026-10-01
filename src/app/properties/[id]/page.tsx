import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { InstantAction } from "@/components/InstantAction";
import { LegalFooter } from "@/components/LegalFooter";
import { MoneyInput } from "@/components/MoneyInput";
import { LazyPropertyCashFlowChart } from "@/components/lazy/LazyCharts";
import {
  CategoryBreakdown,
  FinanceCards,
  YearPicker,
  currency,
  currencyCents,
} from "@/components/propertyPanels";
import {
  addBooking,
  addLease,
  addMortgage,
  addPropertyExpense,
  addUnit,
  deleteBooking,
  deleteLease,
  deleteMortgagePayment,
  deletePropertyExpense,
  deleteRentPayment,
  deleteUnit,
  endLease,
  logMortgagePayment,
  logRentPayment,
  setPropertyArchived,
  setUnitRentalType,
  updateMortgage,
  updatePropertyValue,
} from "@/app/propertyActions";
import { BookingCsvImport } from "@/components/BookingCsvImport";
import { nightsBetween } from "@/lib/property/bookingCsv";
import { getPortfolioData } from "@/lib/property/data";
import {
  equitySummary,
  yearFinance,
  yearsWithActivity,
} from "@/lib/property/finance";
import {
  EXPENSE_CATEGORY_LABELS,
  PLATFORM_LABELS,
  PROPERTY_TYPE_LABELS,
  type ExpenseCategory,
} from "@/lib/property/rows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";
const btnCls =
  "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";
const delCls = "text-xs text-slate-400 transition hover:text-red-400";

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One property: records, ledgers, and its own yearly finances. */
export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ id }, sp, data] = await Promise.all([params, searchParams, getPortfolioData()]);
  const property = data.properties.find((p) => p.id === id);
  if (!property) notFound();

  const todayISO = new Date().toISOString().slice(0, 10);
  const currentYear = Number(todayISO.slice(0, 4));
  const years = yearsWithActivity(
    {
      rentPayments: data.rentPayments.filter((r) => r.property_id === id),
      expenses: data.expenses.filter((e) => e.property_id === id),
      mortgagePayments: data.mortgagePayments.filter((m) => m.property_id === id),
      bookings: data.bookings.filter((b) => b.property_id === id),
    },
    currentYear,
  );
  const requested = Number(sp.year);
  const year = years.includes(requested) ? requested : currentYear;

  const f = yearFinance(data, year, id);
  const eq = equitySummary(data.properties, data.mortgages, id);

  const units = data.units.filter((u) => u.property_id === id);
  const unitIds = new Set(units.map((u) => u.id));
  const leases = data.leases.filter((l) => unitIds.has(l.unit_id));
  const tenantName = new Map(data.tenants.map((t) => [t.id, t.full_name]));
  const unitLabel = new Map(units.map((u) => [u.id, u.label]));

  const activeLeases = leases.filter(
    (l) =>
      l.status === "active" &&
      l.start_date <= todayISO &&
      (l.end_date ?? "9999-12-31") >= todayISO,
  );
  const leaseByUnit = new Map(activeLeases.map((l) => [l.unit_id, l]));

  const rents = data.rentPayments.filter((r) => r.property_id === id);
  const expenses = data.expenses.filter((e) => e.property_id === id);
  const mortgages = data.mortgages.filter((m) => m.property_id === id);
  const mortgagePays = data.mortgagePayments.filter((m) => m.property_id === id);

  const strUnits = units.filter((u) => u.rental_type === "short_term");
  const bookings = data.bookings.filter(
    (b) => b.property_id === id && b.status !== "canceled",
  );
  const upcomingStays = bookings
    .filter((b) => b.check_out >= todayISO)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
  const pastStays = bookings
    .filter((b) => b.check_out < todayISO)
    .sort((a, b) => b.check_in.localeCompare(a.check_in));
  const showStays = strUnits.length > 0 || bookings.length > 0;
  const defaultCheckOut = (() => {
    const d = new Date(`${todayISO}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 2);
    return d.toISOString().slice(0, 10);
  })();

  const leaseLabel = (leaseId: string | null) => {
    const l = leases.find((x) => x.id === leaseId);
    if (!l) return null;
    const who = l.tenant_id ? tenantName.get(l.tenant_id) : null;
    return `${unitLabel.get(l.unit_id) ?? "Unit"}${who ? ` — ${who}` : ""}`;
  };

  return (
    <AppShell active="properties">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/properties" className="text-xs text-slate-400 hover:text-slate-200">
              ← All properties
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-white">{property.name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {[property.address, PROPERTY_TYPE_LABELS[property.property_type]]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <YearPicker years={years} active={year} basePath={`/properties/${id}`} />
        </div>

        {/* Value / debt / equity, with an inline value update. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Value</p>
            <p className="mt-1 text-2xl font-bold text-white">
              {eq.value > 0 ? currency.format(eq.value) : "not set"}
            </p>
            <form action={updatePropertyValue} className="mt-2 flex gap-2">
              <input type="hidden" name="id" value={id} />
              <MoneyInput
                name="current_value"
                placeholder="update value"
                className={inputCls}
                ariaLabel="Update current value"
              />
              <button type="submit" className="shrink-0 rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-slate-600">
                save
              </button>
            </form>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Owed</p>
            <p className="mt-1 text-2xl font-bold text-rose-400">{currency.format(eq.debt)}</p>
            {eq.debtIncomplete && (
              <p className="mt-1 text-xs text-amber-300">
                A loan has no balance entered yet — Owed and Equity are missing it.
              </p>
            )}
            {property.purchase_price != null && (
              <p className="mt-1 text-xs text-slate-400">
                {`bought for ${currency.format(Number(property.purchase_price))}${property.purchase_date ? ` on ${fmtDate(property.purchase_date)}` : ""}`}
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Equity</p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">
              {currency.format(eq.equity)}
            </p>
          </div>
        </div>

        {/* This year's numbers */}
        <FinanceCards
          f={f}
          throughMonth={year === currentYear ? Number(todayISO.slice(5, 7)) : 12}
        />

        <Panel title={`${year} month by month`}>
          <LazyPropertyCashFlowChart months={f.months} />
        </Panel>

        {/* Units & leases */}
        <Panel title="Units & leases">
          <ul className="space-y-3">
            {units.map((u) => {
              const lease = leaseByUnit.get(u.id);
              const pastLeases = leases.filter((l) => l.unit_id === u.id && l !== lease);
              return (
                <li key={u.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-white">{u.label}</p>
                    {u.rental_type === "short_term" ? (
                      <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                        short-term · nightly stays
                      </span>
                    ) : lease ? (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                        {`rented · ${currencyCents.format(Number(lease.rent_amount))}/mo`}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                        vacant
                      </span>
                    )}
                  </div>

                  {u.rental_type === "short_term" ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
                      <span>Stays and income for this unit live in the Stays panel below.</span>
                      <InstantAction
                        action={setUnitRentalType}
                        values={{ id: u.id, property_id: id, rental_type: "long_term" }}
                        message={`${u.label} is a long-term rental again.`}
                        className="text-xs text-slate-400 transition hover:text-sky-300"
                      >
                        switch to long-term
                      </InstantAction>
                    </div>
                  ) : lease ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
                      <span>
                        {`${lease.tenant_id ? tenantName.get(lease.tenant_id) ?? "Tenant" : "Tenant"} · since ${fmtDate(lease.start_date)} · due day ${lease.due_day}${Number(lease.deposit_amount) > 0 ? ` · ${currency.format(Number(lease.deposit_amount))} deposit held` : ""}`}
                      </span>
                      <InstantAction
                        action={endLease}
                        values={{ id: lease.id, property_id: id, end_date: todayISO }}
                        message={`Lease ended today — ${u.label} is now vacant.`}
                        className="text-xs text-slate-400 transition hover:text-amber-300"
                      >
                        end lease
                      </InstantAction>
                    </div>
                  ) : (
                    <form
                      action={addLease}
                      className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
                    >
                      <input type="hidden" name="unit_id" value={u.id} />
                      <input type="hidden" name="property_id" value={id} />
                      <input
                        name="tenant_name"
                        placeholder="tenant name"
                        className={`${inputCls} col-span-2 sm:col-span-1`}
                        aria-label={`Tenant name for ${u.label}`}
                      />
                      <MoneyInput
                        name="rent_amount"
                        placeholder="rent / month"
                        required
                        className={inputCls}
                        ariaLabel={`Monthly rent for ${u.label}`}
                      />
                      <input
                        type="date"
                        name="start_date"
                        defaultValue={todayISO}
                        required
                        className={inputCls}
                        aria-label="Lease start date"
                      />
                      <MoneyInput
                        name="deposit_amount"
                        placeholder="deposit (optional)"
                        className={inputCls}
                        ariaLabel="Deposit amount"
                      />
                      <label className="block text-xs text-slate-400">
                        due day
                        <input
                          type="number"
                          name="due_day"
                          min={1}
                          max={28}
                          defaultValue={1}
                          className={`mt-0.5 ${inputCls}`}
                        />
                      </label>
                      <button type="submit" className={`${btnCls} self-end`}>
                        Start lease
                      </button>
                    </form>
                  )}

                  {u.rental_type === "long_term" && !lease && (
                    <div className="mt-2 text-right">
                      <InstantAction
                        action={setUnitRentalType}
                        values={{ id: u.id, property_id: id, rental_type: "short_term" }}
                        message={`${u.label} is now a short-term rental — log stays or import a CSV below.`}
                        className="text-xs text-slate-500 transition hover:text-sky-300"
                      >
                        {`rent ${u.label} nightly (short-term) instead`}
                      </InstantAction>
                    </div>
                  )}

                  {pastLeases.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-slate-800 pt-2">
                      {pastLeases.map((l) => (
                        <li
                          key={l.id}
                          className="flex items-center justify-between text-xs text-slate-500"
                        >
                          <span>
                            {`${l.tenant_id ? tenantName.get(l.tenant_id) ?? "Tenant" : "Tenant"} · ${currency.format(Number(l.rent_amount))}/mo · ${fmtDate(l.start_date)}${l.end_date ? ` → ${fmtDate(l.end_date)}` : " → open"}`}
                          </span>
                          <InstantAction
                            action={deleteLease}
                            values={{ id: l.id, property_id: id }}
                            message="Lease record deleted."
                            className={delCls}
                          >
                            delete
                          </InstantAction>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <form action={addUnit} className="mt-3 flex gap-2">
            <input type="hidden" name="property_id" value={id} />
            <input
              name="label"
              placeholder="add a unit (e.g. Unit B, Garage apt)"
              className={inputCls}
              aria-label="New unit label"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-600">
              Add unit
            </button>
          </form>
          {units.length > 1 && (
            <p className="mt-2 text-xs text-slate-500">
              Deleting a unit removes its leases too — end leases instead if the history matters.
            </p>
          )}
          {units
            .filter((u) => !leaseByUnit.get(u.id) && leases.every((l) => l.unit_id !== u.id))
            .map((u) => (
              <div key={u.id} className="mt-1 text-right">
                <InstantAction
                  action={deleteUnit}
                  values={{ id: u.id, property_id: id }}
                  message={`${u.label} removed.`}
                  className={delCls}
                >
                  {`remove ${u.label}`}
                </InstantAction>
              </div>
            ))}
        </Panel>

        {/* Short-term stays: schedule, manual log, CSV import */}
        {showStays && (
          <Panel
            title={`Stays${f.bookedNights > 0 ? ` — ${f.bookedNights} nights booked in ${year}` : ""}`}
          >
            {upcomingStays.length > 0 && (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Schedule
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {upcomingStays.map((b) => (
                    <li key={b.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-200">
                        {`${fmtDate(b.check_in)} → ${fmtDate(b.check_out)} · ${nightsBetween(b.check_in, b.check_out)} nights`}
                        <span className="text-slate-400">
                          {` · ${currencyCents.format(Number(b.payout))}${b.guest_name ? ` · ${b.guest_name}` : ""} · ${PLATFORM_LABELS[b.platform]}`}
                        </span>
                      </span>
                      <InstantAction
                        action={deleteBooking}
                        values={{ id: b.id, property_id: id }}
                        message="Stay deleted."
                        className={delCls}
                      >
                        delete
                      </InstantAction>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Log one stay by hand */}
            <form action={addBooking} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
              <input type="hidden" name="property_id" value={id} />
              {strUnits.length === 1 && (
                <input type="hidden" name="unit_id" value={strUnits[0].id} />
              )}
              <input name="guest_name" placeholder="guest (optional)" className={inputCls} aria-label="Guest name" />
              <input type="date" name="check_in" defaultValue={todayISO} required className={inputCls} aria-label="Check-in" />
              <input type="date" name="check_out" defaultValue={defaultCheckOut} required className={inputCls} aria-label="Check-out" />
              <MoneyInput name="payout" placeholder="payout" required className={inputCls} ariaLabel="Payout" />
              <select name="platform" className={inputCls} defaultValue="direct" aria-label="Platform">
                {Object.entries(PLATFORM_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <button type="submit" className={`${btnCls} self-end`}>
                Log stay
              </button>
            </form>

            <div className="mt-4">
              <BookingCsvImport
                propertyId={id}
                units={(strUnits.length > 0 ? strUnits : units).map((u) => ({
                  id: u.id,
                  label: u.label,
                }))}
              />
            </div>

            {pastStays.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-slate-800 pt-3">
                {pastStays.slice(0, 10).map((b) => (
                  <li key={b.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">
                      {`${fmtDate(b.check_in)} · ${nightsBetween(b.check_in, b.check_out)} nights · ${currencyCents.format(Number(b.payout))}${b.guest_name ? ` · ${b.guest_name}` : ""} · ${PLATFORM_LABELS[b.platform]}`}
                    </span>
                    <InstantAction
                      action={deleteBooking}
                      values={{ id: b.id, property_id: id }}
                      message="Stay deleted."
                      className={delCls}
                    >
                      delete
                    </InstantAction>
                  </li>
                ))}
                {pastStays.length > 10 && (
                  <li className="text-xs text-slate-500">{`${pastStays.length - 10} older stays not shown — they still count in the yearly numbers`}</li>
                )}
              </ul>
            )}
          </Panel>
        )}

        {/* Rent ledger */}
        <Panel title="Rent received">
          <form action={logRentPayment} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input type="hidden" name="property_id" value={id} />
            <MoneyInput
              name="amount"
              placeholder="amount"
              required
              className={inputCls}
              ariaLabel="Rent amount received"
            />
            <input
              type="date"
              name="paid_date"
              defaultValue={todayISO}
              required
              className={inputCls}
              aria-label="Date received"
            />
            <select name="lease_id" className={inputCls} aria-label="Which lease" defaultValue={activeLeases[0]?.id ?? ""}>
              <option value="">{units.length > 1 ? "which unit?" : "lease"}</option>
              {activeLeases.map((l) => (
                <option key={l.id} value={l.id}>
                  {leaseLabel(l.id)}
                </option>
              ))}
            </select>
            <label className="block text-xs text-slate-400">
              covers month
              <input type="month" name="period_month" className={`mt-0.5 ${inputCls}`} />
            </label>
            <button type="submit" className={`${btnCls} self-end`}>
              Log rent
            </button>
          </form>

          <ul className="mt-4 space-y-1.5">
            {rents.length === 0 && (
              <li className="text-sm text-slate-400">No rent logged yet.</li>
            )}
            {rents.slice(0, 12).map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  {`${currencyCents.format(Number(r.amount))} · ${fmtDate(r.paid_date)}${r.period_month ? ` (covers ${r.period_month.slice(0, 7)})` : ""}${leaseLabel(r.lease_id) ? ` · ${leaseLabel(r.lease_id)}` : ""}`}
                </span>
                <InstantAction
                  action={deleteRentPayment}
                  values={{ id: r.id, property_id: id }}
                  message="Rent entry deleted."
                  className={delCls}
                >
                  delete
                </InstantAction>
              </li>
            ))}
            {rents.length > 12 && (
              <li className="text-xs text-slate-500">{`${rents.length - 12} older entries not shown`}</li>
            )}
          </ul>
        </Panel>

        {/* Expense ledger */}
        <Panel title="Expenses">
          <form action={addPropertyExpense} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input type="hidden" name="property_id" value={id} />
            <MoneyInput
              name="amount"
              placeholder="amount"
              required
              className={inputCls}
              ariaLabel="Expense amount"
            />
            <input
              type="date"
              name="expense_date"
              defaultValue={todayISO}
              required
              className={inputCls}
              aria-label="Expense date"
            />
            <select name="category" className={inputCls} defaultValue="repairs" aria-label="Category">
              {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <input name="note" placeholder="note (optional)" className={inputCls} aria-label="Note" />
            <button type="submit" className={`${btnCls} self-end`}>
              Log expense
            </button>
          </form>

          <ul className="mt-4 space-y-1.5">
            {expenses.length === 0 && (
              <li className="text-sm text-slate-400">No expenses logged yet.</li>
            )}
            {expenses.slice(0, 15).map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  {`${currencyCents.format(Number(e.amount))} · ${EXPENSE_CATEGORY_LABELS[e.category]} · ${fmtDate(e.expense_date)}${e.note ? ` — ${e.note}` : ""}`}
                </span>
                <InstantAction
                  action={deletePropertyExpense}
                  values={{ id: e.id, property_id: id }}
                  message="Expense deleted."
                  className={delCls}
                >
                  delete
                </InstantAction>
              </li>
            ))}
            {expenses.length > 15 && (
              <li className="text-xs text-slate-500">{`${expenses.length - 15} older entries not shown`}</li>
            )}
          </ul>
        </Panel>

        {/* Where the year's money went */}
        <Panel title={`Where ${year}'s money went`}>
          <CategoryBreakdown f={f} />
        </Panel>

        {/* Mortgage */}
        <Panel title="Mortgage">
          {mortgages.length === 0 ? (
            <p className="text-sm text-slate-400">
              No loan on record. Free and clear, or add it below so debt service shows up
              in the yearly numbers.
            </p>
          ) : (
            <ul className="space-y-3">
              {mortgages.map((m) => (
                <li key={m.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-white">{m.lender}</p>
                    <p className="text-sm text-slate-300">
                      {m.current_balance == null ? (
                        <span className="text-amber-300">balance not set yet</span>
                      ) : (
                        `${currency.format(Number(m.current_balance))} balance`
                      )}
                      {`${m.interest_rate != null ? ` · ${Number(m.interest_rate)}%` : ""}${Number(m.monthly_payment) > 0 ? ` · ${currencyCents.format(Number(m.monthly_payment))}/mo` : ""}${m.start_date ? ` · since ${fmtDate(m.start_date)}` : ""}`}
                    </p>
                  </div>

                  <form action={logMortgagePayment} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <input type="hidden" name="mortgage_id" value={m.id} />
                    <input type="hidden" name="property_id" value={id} />
                    <MoneyInput
                      name="amount"
                      defaultValue={Number(m.monthly_payment) > 0 ? Number(m.monthly_payment) : undefined}
                      placeholder="payment"
                      required
                      className={inputCls}
                      ariaLabel="Payment amount"
                    />
                    <input
                      type="date"
                      name="paid_date"
                      defaultValue={todayISO}
                      required
                      className={inputCls}
                      aria-label="Payment date"
                    />
                    <MoneyInput name="principal" placeholder="principal" className={inputCls} ariaLabel="Principal portion" />
                    <MoneyInput name="interest" placeholder="interest" className={inputCls} ariaLabel="Interest portion" />
                    <MoneyInput name="escrow" placeholder="escrow" className={inputCls} ariaLabel="Escrow portion" />
                    <button type="submit" className={`${btnCls} self-end`}>
                      Log payment
                    </button>
                    <p className="col-span-2 text-xs text-slate-500 sm:col-span-6">
                      The split is optional — but with it, principal counts as equity you kept,
                      and the balance steps down automatically.
                    </p>
                  </form>

                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200">
                      {m.current_balance == null
                        ? "Add the balance, rate, and other details"
                        : "Update loan details"}
                    </summary>
                    <form action={updateMortgage} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="property_id" value={id} />
                      <MoneyInput name="current_balance" placeholder="balance today" className={inputCls} ariaLabel="Current balance" />
                      <label className="block text-xs text-slate-400">
                        rate %
                        <input type="number" step="0.001" min="0" name="interest_rate" className={`mt-0.5 ${inputCls}`} />
                      </label>
                      <MoneyInput name="monthly_payment" placeholder="payment / mo" className={inputCls} ariaLabel="Monthly payment" />
                      <MoneyInput name="original_amount" placeholder="original loan" className={inputCls} ariaLabel="Original loan amount" />
                      <button type="submit" className={`${btnCls} self-end`}>
                        Save details
                      </button>
                      <p className="col-span-2 text-xs text-slate-500 sm:col-span-5">
                        Fill in only what you know — blank fields keep their current value.
                      </p>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200">
              Add a loan
            </summary>
            <form action={addMortgage} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
              <input type="hidden" name="property_id" value={id} />
              <input name="lender" placeholder="lender" required className={inputCls} aria-label="Lender" />
              <MoneyInput name="monthly_payment" placeholder="payment / mo" required className={inputCls} ariaLabel="Monthly payment" />
              <label className="block text-xs text-slate-400">
                first payment
                <input type="date" name="start_date" className={`mt-0.5 ${inputCls}`} aria-label="First payment date" />
              </label>
              <MoneyInput name="current_balance" placeholder="balance (optional)" className={inputCls} ariaLabel="Current balance, optional" />
              <label className="block text-xs text-slate-400">
                rate % (optional)
                <input type="number" step="0.001" min="0" name="interest_rate" className={`mt-0.5 ${inputCls}`} />
              </label>
              <button type="submit" className={`${btnCls} self-end`}>
                Add loan
              </button>
              <p className="col-span-2 text-xs text-slate-500 sm:col-span-6">
                Lender and monthly payment are enough to start — add the balance and
                rate whenever you get them.
              </p>
            </form>
          </details>

          {mortgagePays.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-slate-800 pt-3">
              {mortgagePays.slice(0, 12).map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">
                    {`${currencyCents.format(Number(p.amount))} · ${fmtDate(p.paid_date)}${p.principal != null ? ` (${currencyCents.format(Number(p.principal))} principal)` : " (no split logged)"}`}
                  </span>
                  <InstantAction
                    action={deleteMortgagePayment}
                    values={{ id: p.id, property_id: id }}
                    message="Payment deleted — any principal went back on the balance."
                    className={delCls}
                  >
                    delete
                  </InstantAction>
                </li>
              ))}
              {mortgagePays.length > 12 && (
                <li className="text-xs text-slate-500">{`${mortgagePays.length - 12} older payments not shown`}</li>
              )}
            </ul>
          )}
        </Panel>

        {/* Archive */}
        <div className="text-right">
          <InstantAction
            action={setPropertyArchived}
            values={{ id, archived: "true" }}
            message={`${property.name} archived — its history stays; it just leaves your lists.`}
            className="text-xs text-slate-500 transition hover:text-amber-300"
          >
            {`archive ${property.name}`}
          </InstantAction>
        </div>

        <LegalFooter />
      </div>
    </AppShell>
  );
}
