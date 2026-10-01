import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LegalFooter } from "@/components/LegalFooter";
import { LazyPropertyCashFlowChart } from "@/components/lazy/LazyCharts";
import {
  CategoryBreakdown,
  FinanceCards,
  SignedMoney,
  YearPicker,
  currency,
} from "@/components/propertyPanels";
import { getPortfolioData } from "@/lib/property/data";
import {
  equitySummary,
  yearFinance,
  yearsWithActivity,
} from "@/lib/property/finance";
import { PROPERTY_TYPE_LABELS } from "@/lib/property/rows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Portfolio dashboard: every property combined for one year — money in,
 * money out, cash flow, equity — with a card per property that drills into
 * its own page.
 */
export default async function PortfolioPage({
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

  const combined = yearFinance(data, year, null);
  const equity = equitySummary(data.properties, data.mortgages, null);
  const properties = data.properties.filter((p) => !p.is_archived);

  // Occupancy today: a unit counts as filled when a lease covers today.
  const occupiedUnits = new Set(
    data.leases
      .filter(
        (l) =>
          l.start_date <= todayISO &&
          (l.end_date ?? "9999-12-31") >= todayISO &&
          l.status === "active",
      )
      .map((l) => l.unit_id),
  );
  const propertyIds = new Set(properties.map((p) => p.id));
  const units = data.units.filter((u) => propertyIds.has(u.property_id));
  const filled = units.filter((u) => occupiedUnits.has(u.id)).length;

  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">All properties</h1>
            <p className="mt-1 text-sm text-slate-400">
              {properties.length === 0
                ? "Nothing here yet."
                : `${properties.length} ${properties.length === 1 ? "property" : "properties"} · ${filled} of ${units.length} ${units.length === 1 ? "unit" : "units"} filled today`}
            </p>
          </div>
          <YearPicker years={years} active={year} basePath="/" />
        </div>

        {properties.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 px-6 py-16 text-center">
            <p className="text-lg font-semibold text-white">
              Start with your first property
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Add the property, then its units, leases, and mortgage — every rent
              payment and expense you log rolls up into honest yearly numbers here.
            </p>
            <Link
              href="/properties"
              className="mt-5 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Add a property
            </Link>
          </div>
        ) : (
          <>
            {/* Equity strip: what it's worth, what's owed, what's yours. */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Portfolio value
                </p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {currency.format(equity.value)}
                </p>
                {equity.valueIncomplete && (
                  <p className="mt-1 text-xs text-amber-300">
                    Some properties have no value set — this number is missing them.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Mortgage debt
                </p>
                <p className="mt-1 text-2xl font-bold text-rose-400">
                  {currency.format(equity.debt)}
                </p>
                {equity.debtIncomplete && (
                  <p className="mt-1 text-xs text-amber-300">
                    A loan is missing its balance — this number is low.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Your equity
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-300">
                  {currency.format(equity.equity)}
                </p>
              </div>
            </div>

            <section aria-label={`${year} finances, all properties`}>
              <FinanceCards
                f={combined}
                throughMonth={year === currentYear ? Number(todayISO.slice(5, 7)) : 12}
              />
            </section>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-sm font-semibold text-white">{`${year} month by month`}</h2>
              <div className="mt-3">
                <LazyPropertyCashFlowChart months={combined.months} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-sm font-semibold text-white">{`Where ${year}'s money went`}</h2>
                <div className="mt-3">
                  <CategoryBreakdown f={combined} />
                </div>
              </div>

              {/* One card per property, with its own year numbers. */}
              <div className="space-y-3">
                {properties.map((p) => {
                  const f = yearFinance(data, year, p.id);
                  return (
                    <Link
                      key={p.id}
                      href={`/properties/${p.id}`}
                      className="block rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{p.name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {p.address || PROPERTY_TYPE_LABELS[p.property_type]}
                          </p>
                        </div>
                        <SignedMoney value={f.cashFlow} className="text-lg font-bold" />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {`${currency.format(f.rentCollected)} rent in · ${currency.format(f.totalExpenses + f.debtService)} out`}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <LegalFooter />
      </div>
    </AppShell>
  );
}
