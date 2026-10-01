import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PrintButton } from "@/components/PrintButton";
import { YearPicker, currencyCents } from "@/components/propertyPanels";
import { getPortfolioData } from "@/lib/property/data";
import { yearFinance, yearsWithActivity, type YearFinance } from "@/lib/property/finance";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/property/rows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Year-end report: one year, every property, laid out for an accountant.
 * Categories follow Schedule E's shape; capex and closing costs are called
 * out because they're basis/depreciation, not current-year deductions.
 */

const fmt = (n: number) => currencyCents.format(n);

/** Rough Schedule E line for each of our categories. */
const SCHEDULE_E: Record<ExpenseCategory, string> = {
  repairs: "Line 14 — Repairs",
  maintenance: "Line 7 — Cleaning & maintenance",
  capex: "Depreciate — not a current-year expense",
  taxes: "Line 16 — Taxes",
  insurance: "Line 9 — Insurance",
  utilities: "Line 17 — Utilities",
  hoa: "Line 19 — Other (HOA/COA dues)",
  management: "Line 11 — Management fees",
  legal: "Line 10 — Legal & professional*",
  supplies: "Line 15 — Supplies",
  travel: "Line 6 — Auto & travel",
  other: "Line 19 — Other",
};

function ReportTable({ f, name, share }: { f: YearFinance; name: string; share: number }) {
  const cats = (Object.entries(f.expensesByCategory) as [ExpenseCategory, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 print:border-slate-300 print:bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-white print:text-black">{name}</h2>
        {share < 100 && (
          <span className="text-xs text-amber-300">{`costs counted at ${share}% rental share`}</span>
        )}
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody>
          <tr className="border-b border-slate-800">
            <td className="py-1.5 text-slate-300 print:text-black">Rents received (leases)</td>
            <td />
            <td className="py-1.5 text-right font-semibold text-emerald-300 print:text-black">{fmt(f.ltrIncome)}</td>
          </tr>
          {f.strIncome > 0 && (
            <tr className="border-b border-slate-800">
              <td className="py-1.5 text-slate-300 print:text-black">{`Short-term stay payouts (${f.bookedNights} nights)`}</td>
              <td />
              <td className="py-1.5 text-right font-semibold text-emerald-300 print:text-black">{fmt(f.strIncome)}</td>
            </tr>
          )}
          {cats.map(([c, v]) => (
            <tr key={c} className="border-b border-slate-800">
              <td className="py-1.5 text-slate-300 print:text-black">{EXPENSE_CATEGORY_LABELS[c]}</td>
              <td className="py-1.5 text-xs text-slate-500">{SCHEDULE_E[c]}</td>
              <td className="py-1.5 text-right text-rose-300 print:text-black">{`−${fmt(v)}`}</td>
            </tr>
          ))}
          <tr className="border-b border-slate-800">
            <td className="py-1.5 text-slate-300 print:text-black">Mortgage payments</td>
            <td className="py-1.5 text-xs text-slate-500">
              {f.interestPaid > 0
                ? `of which ${fmt(f.interestPaid)} interest (Line 12)`
                : "interest portion unknown — get the 1098"}
            </td>
            <td className="py-1.5 text-right text-amber-300 print:text-black">{`−${fmt(f.debtService)}`}</td>
          </tr>
          <tr>
            <td className="py-2 font-bold text-white print:text-black">Cash flow</td>
            <td />
            <td className={`py-2 text-right font-bold ${f.cashFlow >= 0 ? "text-emerald-300" : "text-rose-400"} print:text-black`}>
              {f.cashFlow < 0 ? `−${fmt(Math.abs(f.cashFlow))}` : fmt(f.cashFlow)}
            </td>
          </tr>
        </tbody>
      </table>
      {(f.capex > 0 || f.scheduledDebtService > 0) && (
        <p className="mt-2 text-xs text-slate-500">
          {[
            f.capex > 0
              ? `Capital improvements of ${fmt(f.capex)} are included in cash flow but depreciate rather than deduct.`
              : null,
            f.scheduledDebtService > 0
              ? `${fmt(f.scheduledDebtService)} of the mortgage figure is assumed from payment schedules, not logged records.`
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      )}
    </section>
  );
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [data, sp] = await Promise.all([getPortfolioData(), searchParams]);
  const todayISO = new Date().toISOString().slice(0, 10);
  const currentYear = Number(todayISO.slice(0, 4));
  const years = yearsWithActivity(data, currentYear);
  const requested = Number(sp.year);
  const year = years.includes(requested) ? requested : currentYear;

  const properties = data.properties.filter((p) => !p.is_archived);
  const combined = yearFinance(data, year, null, todayISO);

  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-3xl space-y-5 px-6 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/" className="text-xs text-slate-400 hover:text-slate-200">
              ← Dashboard
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-white">{`${year} year-end report`}</h1>
            <p className="mt-1 text-sm text-slate-400">
              Schedule E line hints are a starting point for your accountant, not tax advice.
              *Closing-year “Legal & professional” figures include closing costs, which
              mostly belong in basis — details sit in each property's notes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <YearPicker years={years} active={year} basePath="/report" />
            <PrintButton />
          </div>
        </div>

        {properties.map((p) => (
          <ReportTable
            key={p.id}
            name={p.name}
            share={Number(p.rental_share ?? 100)}
            f={yearFinance(data, year, p.id, todayISO)}
          />
        ))}

        <ReportTable name="All properties combined" share={100} f={combined} />
      </div>
    </AppShell>
  );
}
