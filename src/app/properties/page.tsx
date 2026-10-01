import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { InstantAction } from "@/components/InstantAction";
import { LegalFooter } from "@/components/LegalFooter";
import { MoneyInput } from "@/components/MoneyInput";
import { SignedMoney, currency } from "@/components/propertyPanels";
import { addProperty, setPropertyArchived } from "@/app/propertyActions";
import { getPortfolioData } from "@/lib/property/data";
import { equitySummary, yearFinance } from "@/lib/property/finance";
import { PROPERTY_TYPE_LABELS, type PropertyType } from "@/lib/property/rows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";
const btnCls =
  "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

/** The property list: one card per property, plus the add form. */
export default async function PropertiesPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getPortfolioData();
  const todayISO = new Date().toISOString().slice(0, 10);
  const year = Number(todayISO.slice(0, 4));
  const active = data.properties.filter((p) => !p.is_archived);
  const archived = data.properties.filter((p) => p.is_archived);

  return (
    <AppShell active="properties">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <h1 className="text-2xl font-bold text-white">Properties</h1>

        <ul className="space-y-3">
          {active.length === 0 && (
            <EmptyState
              line="No properties yet — add the first one below and everything else builds from it."
              action="Add your first property"
              targetId="property-name"
            />
          )}
          {active.map((p) => {
            const units = data.units.filter((u) => u.property_id === p.id);
            const f = yearFinance(data, year, p.id, todayISO);
            const eq = equitySummary(data.properties, data.mortgages, p.id);
            return (
              <li key={p.id}>
                <Link
                  href={`/properties/${p.id}`}
                  className="block rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">{p.name}</p>
                      <p className="mt-0.5 text-sm text-slate-400">
                        {[
                          p.address,
                          PROPERTY_TYPE_LABELS[p.property_type],
                          `${units.length} ${units.length === 1 ? "unit" : "units"}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{`${year} cash flow`}</p>
                      <SignedMoney value={f.cashFlow} className="text-lg font-bold" />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {eq.value > 0
                      ? `${currency.format(eq.value)} value · ${currency.format(eq.debt)} owed · ${currency.format(eq.equity)} equity`
                      : "No value set yet"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Add a property */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-white">Add a property</h2>
          <form action={addProperty} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Name
              <input
                id="property-name"
                name="name"
                required
                placeholder="e.g. 412 Maple St"
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Address
              <input name="address" placeholder="street, city" className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block text-xs text-slate-400">
              Type
              <select name="property_type" className={`mt-1 ${inputCls}`} defaultValue="single_family">
                {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
                  <option key={t} value={t}>
                    {PROPERTY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Purchase date
              <input type="date" name="purchase_date" className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block text-xs text-slate-400">
              Purchase price
              <MoneyInput name="purchase_price" className={`mt-1 ${inputCls}`} ariaLabel="Purchase price" />
            </label>
            <label className="block text-xs text-slate-400">
              Current value (your best estimate)
              <MoneyInput name="current_value" className={`mt-1 ${inputCls}`} ariaLabel="Current value" />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={btnCls}>
                Add property
              </button>
              <p className="mt-2 text-xs text-slate-500">
                It starts with one “Main” unit — add more units on its page if it has several.
              </p>
            </div>
          </form>
        </div>

        {archived.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-slate-400">Archived</h2>
            <ul className="mt-2 space-y-2">
              {archived.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm text-slate-400">
                  <span>{p.name}</span>
                  <InstantAction
                    action={setPropertyArchived}
                    values={{ id: p.id, archived: "false" }}
                    message={`${p.name} is back in your list.`}
                    className="text-xs text-slate-400 transition hover:text-emerald-300"
                  >
                    restore
                  </InstantAction>
                </li>
              ))}
            </ul>
          </div>
        )}

        <LegalFooter />
      </div>
    </AppShell>
  );
}
