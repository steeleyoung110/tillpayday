import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PrintButton } from "@/components/PrintButton";
import { computeTodayBalances } from "@/lib/balances";
import { getDashboardData, getNetWorthData } from "@/lib/data";
import {
  bucketToEngine,
  expenseToEngine,
  incomeToEngine,
} from "@/lib/rows";
import { yearWrapped } from "@/lib/yearWrapped";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The year, wrapped: twelve months of money in / out / kept, best and worst
 * months, and what debt costs vs what savings earns — side by side, on
 * purpose. Print-friendly for tax-time filing.
 */
export default async function YearWrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const todayISO = new Date().toISOString().slice(0, 10);
  const currentYear = Number(todayISO.slice(0, 4));
  const { y } = await searchParams;
  const year = /^\d{4}$/.test(y ?? "") ? Number(y) : currentYear;

  const [data, nw] = await Promise.all([getDashboardData(), getNetWorthData()]);
  const balances = computeTodayBalances(data, todayISO);

  const summary = yearWrapped(
    data.income.map(incomeToEngine),
    data.expenses.map(expenseToEngine),
    data.incomeEntries.map((e) => ({
      amount: Number(e.amount),
      receivedDate: e.received_date,
    })),
    nw.liabilities.map((l) => ({
      balance: Number(l.current_balance),
      rate: Number(l.interest_rate ?? 0),
    })),
    data.buckets
      .map(bucketToEngine)
      .filter((b) => (b.apy ?? 0) > 0)
      .map((b) => ({ balance: Math.max(balances?.[b.id] ?? 0, 0), apy: b.apy ?? 0 })),
    year,
    todayISO,
  );

  const maxAbsKept = Math.max(1, ...summary.months.map((m) => Math.abs(m.kept)));
  const interestGap = summary.interestPaidYearly - summary.interestEarnedYearly;
  const signupYear = Number((user.created_at ?? todayISO).slice(0, 4));
  const yearChoices = [];
  for (let yy = currentYear; yy >= Math.max(signupYear, currentYear - 4); yy -= 1) {
    yearChoices.push(yy);
  }

  return (
    <AppShell active="budget">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {yearChoices.map((yy) => (
              <Link
                key={yy}
                href={`/wrapped/year?y=${yy}`}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  yy === year
                    ? "bg-emerald-500 font-semibold text-slate-950"
                    : "border border-slate-700 text-slate-300 hover:border-emerald-400"
                }`}
              >
                {yy}
              </Link>
            ))}
            <Link
              href="/wrapped"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-emerald-400"
            >
              ← Month wrapped
            </Link>
          </div>
          <PrintButton />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Till Payday — year, wrapped</p>
          <h1 className="mt-1 text-3xl font-black text-white">{year}</h1>
          {!summary.complete && (
            <p className="mt-1 text-xs text-amber-300">
              Year still in progress — these numbers only count what has
              already happened.
            </p>
          )}

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-800/60 p-4">
              <p className="text-xs text-slate-400">Money in</p>
              <p className="mt-1 text-xl font-bold text-emerald-300">
                {currency.format(summary.moneyIn)}
              </p>
              <p className="text-xs text-slate-400">{`${summary.paydayCount} payday${summary.paydayCount === 1 ? "" : "s"}`}</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-4">
              <p className="text-xs text-slate-400">Money out</p>
              <p className="mt-1 text-xl font-bold text-red-300">
                {`−${currency.format(summary.moneyOut)}`}
              </p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-4">
              <p className="text-xs text-slate-400">
                {summary.kept >= 0 ? "Kept" : "Overspent by"}
              </p>
              <p
                className={`mt-1 text-xl font-bold ${summary.kept >= 0 ? "text-white" : "text-red-300"}`}
              >
                {currency.format(Math.abs(summary.kept))}
              </p>
              <p className="text-xs text-slate-400">
                {summary.keptPct !== null ? `${summary.keptPct}% savings rate` : ""}
              </p>
            </div>
          </div>

          {summary.months.some((m) => m.active) && (
            <div className="mt-6">
              <h2 className="font-semibold text-white">Month by month — what you kept</h2>
              <div className="mt-3 flex h-32 items-end gap-1.5">
                {summary.months.map((m) => (
                  <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`w-full max-w-10 rounded-t ${m.kept >= 0 ? "bg-emerald-500/70" : "bg-red-500/70"}`}
                      style={{
                        height: `${Math.max(4, Math.round((Math.abs(m.kept) / maxAbsKept) * 100))}%`,
                      }}
                      title={`${MONTHS[m.monthIdx]}: ${m.kept >= 0 ? "kept" : "overspent"} ${currency.format(Math.abs(m.kept))}`}
                    />
                    <span className="text-[10px] text-slate-400">{MONTHS[m.monthIdx]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {summary.best && (
                  <div className="rounded-xl bg-slate-800/60 p-4">
                    <p className="text-xs text-slate-400">Best month</p>
                    <p className="mt-1 font-semibold text-emerald-300">
                      {`${MONTHS[summary.best.monthIdx]} — kept ${currency.format(summary.best.kept)}`}
                    </p>
                  </div>
                )}
                {summary.worst && (
                  <div className="rounded-xl bg-slate-800/60 p-4">
                    <p className="text-xs text-slate-400">Roughest month</p>
                    <p
                      className={`mt-1 font-semibold ${summary.worst.kept < 0 ? "text-red-300" : "text-amber-300"}`}
                    >
                      {`${MONTHS[summary.worst.monthIdx]} — ${summary.worst.kept < 0 ? `overspent ${currency.format(Math.abs(summary.worst.kept))}` : `kept ${currency.format(summary.worst.kept)}`}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(summary.interestPaidYearly > 0 || summary.interestEarnedYearly > 0) && (
            <div className="mt-6">
              <h2 className="font-semibold text-white">The interest ledger</h2>
              <p className="mt-1 text-xs text-slate-400">
                At today&apos;s balances and rates — what a year of your debt
                costs, next to what a year of your savings earns.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-xs text-red-200/70">Interest your debt charges</p>
                  <p className="mt-1 text-xl font-bold text-red-300">
                    {`−${currency.format(summary.interestPaidYearly)}/yr`}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <p className="text-xs text-emerald-200/70">Interest your savings earns</p>
                  <p className="mt-1 text-xl font-bold text-emerald-300">
                    {`+${currency.format(summary.interestEarnedYearly)}/yr`}
                  </p>
                </div>
              </div>
              {interestGap > 0 && (
                <p className="mt-2 text-sm text-amber-200">
                  {`The banks are up ${currency.format(interestGap)} a year on you. Every debt paid down moves that number your way.`}
                </p>
              )}
              {interestGap < 0 && (
                <p className="mt-2 text-sm text-emerald-300">
                  {`You're up ${currency.format(Math.abs(interestGap))} a year on the banks. That's the right side of the ledger.`}
                </p>
              )}
            </div>
          )}

          {!summary.months.some((m) => m.active) && (
            <p className="mt-6 text-sm text-slate-400">
              Nothing recorded in {year} — pick another year above.
            </p>
          )}
        </div>

        <p className="no-print text-xs text-slate-400">
          Educational reflection based on what you logged — not financial or
          tax advice, and only as honest as your logging.
        </p>
      </div>
    </AppShell>
  );
}
