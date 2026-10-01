/**
 * Shared server-rendered pieces for the property screens: the year picker,
 * the yearly finance stat cards, and the expense category breakdown. Used by
 * the portfolio dashboard (all properties) and each property's page.
 */
import Link from "next/link";
import type { YearFinance } from "@/lib/property/finance";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/property/rows";

export const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const currencyCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Signed money: green up, rose down — never softened. */
export function SignedMoney({ value, className = "" }: { value: number; className?: string }) {
  const color = value >= 0 ? "text-emerald-300" : "text-rose-400";
  return (
    <span className={`${color} ${className}`}>
      {value < 0 ? `−${currency.format(Math.abs(value))}` : currency.format(value)}
    </span>
  );
}

/** Year pills; each is a link so the pick survives refresh and sharing. */
export function YearPicker({
  years,
  active,
  basePath,
}: {
  years: number[];
  active: number;
  basePath: string;
}) {
  return (
    <nav aria-label="Year" className="flex flex-wrap gap-2">
      {years.map((y) => (
        <Link
          key={y}
          href={y === years[0] ? basePath : `${basePath}?year=${y}`}
          aria-current={y === active ? "true" : undefined}
          className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
            y === active
              ? "bg-emerald-500 text-slate-950"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          {y}
        </Link>
      ))}
    </nav>
  );
}

function Card({
  label,
  children,
  sub,
}: {
  label: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{children}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

/**
 * The year's headline numbers. `throughMonth` is how many months of the year
 * have actually happened (12 for past years): collected rent is judged
 * against what was expected SO FAR, not against months that haven't arrived.
 */
export function FinanceCards({ f, throughMonth = 12 }: { f: YearFinance; throughMonth?: number }) {
  const expectedSoFar =
    Math.round(
      f.months.slice(0, throughMonth).reduce((s, m) => s + m.expectedRent, 0) * 100,
    ) / 100;
  // Lease shortfall compares LEASE income to lease expectations — stay
  // payouts don't paper over uncollected rent.
  const missedRent = Math.round((expectedSoFar - f.ltrIncome) * 100) / 100;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card
        label={f.strIncome > 0 ? "Rent + stays" : "Rent collected"}
        sub={
          f.strIncome > 0
            ? `${currency.format(f.ltrIncome)} lease rent + ${currency.format(f.strIncome)} from ${f.bookedNights} nights${missedRent > 0 ? ` · ${currency.format(missedRent)} lease rent not collected` : ""}`
            : f.expectedRent > 0
              ? missedRent > 0
                ? `${currency.format(expectedSoFar)} expected so far — ${currency.format(missedRent)} not collected`
                : throughMonth < 12 && f.expectedRent > expectedSoFar
                  ? `caught up · ${currency.format(f.expectedRent)} expected by year-end`
                  : `all of the ${currency.format(f.expectedRent)} expected`
              : "no leases or stays this year"
        }
      >
        <span className="text-emerald-300">{currency.format(f.rentCollected)}</span>
      </Card>
      <Card
        label="Expenses"
        sub={
          f.capex > 0
            ? `${currency.format(f.operatingExpenses)} operating + ${currency.format(f.capex)} capital`
            : "operating costs"
        }
      >
        <span className="text-rose-400">{currency.format(f.totalExpenses)}</span>
      </Card>
      <Card
        label="Mortgage paid"
        sub={
          f.debtService === 0
            ? "no payments logged"
            : [
                f.scheduledDebtService > 0
                  ? `${currency.format(f.scheduledDebtService)} assumed from the monthly schedule`
                  : null,
                f.unsplitDebtService > 0
                  ? `${currency.format(f.unsplitDebtService)} logged without a split`
                  : null,
                f.principalPaid > 0
                  ? `${currency.format(f.principalPaid)} built equity (principal)`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "logged payments"
        }
      >
        <span className="text-amber-300">{currency.format(f.debtService)}</span>
      </Card>
      <Card
        label="Cash flow"
        sub={`NOI ${currency.format(f.noi)} · rent − everything you paid`}
      >
        <SignedMoney value={f.cashFlow} />
      </Card>
    </div>
  );
}

/** Where the money went, biggest first. */
export function CategoryBreakdown({ f }: { f: YearFinance }) {
  const rows = (Object.entries(f.expensesByCategory) as [ExpenseCategory, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No expenses logged this year.</p>;
  }
  const max = rows[0][1];
  return (
    <ul className="space-y-2">
      {rows.map(([cat, amount]) => (
        <li key={cat} className="flex items-center gap-3">
          <span className="w-40 shrink-0 text-sm text-slate-300">
            {EXPENSE_CATEGORY_LABELS[cat]}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
            <span
              className="block h-full rounded-full bg-rose-400/70"
              style={{ width: `${Math.max(4, (amount / max) * 100)}%` }}
            />
          </span>
          <span className="w-24 shrink-0 text-right text-sm font-semibold text-white">
            {currency.format(amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
