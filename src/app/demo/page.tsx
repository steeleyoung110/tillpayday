import Link from "next/link";
import { LegalFooter } from "@/components/LegalFooter";
import { ProjectionSection } from "@/components/ProjectionSection";
import { buildDemoData } from "@/lib/demoData";
import {
  addDays,
  cycleSpending,
  cycleHistory,
  parseISO,
  runway,
  safeToSpend,
  toISO,
} from "@/lib/engine";
import { computeTodayBalances } from "@/lib/balances";
import {
  bucketToEngine,
  expenseToEngine,
  incomeToEngine,
} from "@/lib/rows";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Public demo: Sam's sample budget, fully rendered, zero signup. The fastest
 * honest answer to "what is this app?" — real engine, fabricated numbers,
 * nothing writable. No auth (excluded from the middleware matcher).
 */
export default function DemoPage() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const data = buildDemoData(todayISO);

  const engineIncome = data.income.map(incomeToEngine);
  const engineBuckets = data.buckets.map(bucketToEngine);
  const engineExpenses = data.expenses.map(expenseToEngine);

  const sts = safeToSpend(engineIncome, engineBuckets, engineExpenses, todayISO);
  const spend = cycleSpending(engineIncome, engineExpenses, todayISO);
  const balances = computeTodayBalances(data, todayISO);
  const liquid = balances
    ? Math.round(Object.values(balances).reduce((s, v) => s + v, 0) * 100) / 100
    : 0;
  const cycles = cycleHistory(engineIncome, engineBuckets, engineExpenses, todayISO, 4).cycles;
  const run = runway(liquid, cycles);

  return (
    <main className="min-h-screen bg-slate-950 pb-10">
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-500/40 bg-violet-500/10 px-6 py-4">
          <p className="text-sm font-semibold text-violet-200">
            {`👀 This is Sam — a sample budget, not yours. Click around; nothing here can be changed or saved.`}
          </p>
          <Link
            href="/login"
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Make it your numbers →
          </Link>
        </div>

        {/* Safe-to-spend hero */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-400">Sam&apos;s dashboard 👋</p>
            {spend && spend.total > 0 && (
              <p className="rounded-lg bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-300">
                {`spent ${currency.format(spend.total)} this cycle`}
              </p>
            )}
          </div>
          {sts && sts.hasFlexibleBuckets && (
            <div className="mt-2">
              <p className="text-6xl font-black tracking-tight text-white sm:text-7xl">
                {currency.format(sts.perDay)}
                <span className="ml-1 text-2xl font-semibold text-slate-400">/day</span>
              </p>
              <p className="mt-2 text-lg font-semibold text-emerald-300">
                {`safe to spend today — ${
                  sts.daysUntilPayday === 1 ? "1 day" : `${sts.daysUntilPayday} days`
                } till payday`}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {`Based on ${currency.format(sts.flexibleBalance)} left across Sam's flexible buckets. Spend less than this today and tomorrow's number goes up.`}
              </p>
            </div>
          )}
        </div>

        {run && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
            <p className="text-sm text-slate-400">If Sam&apos;s paycheck stopped today</p>
            <p
              className={`mt-1 text-4xl font-black tracking-tight ${
                run.days < 14
                  ? "text-red-300"
                  : run.days < 45
                    ? "text-amber-300"
                    : "text-emerald-300"
              }`}
            >
              {`${run.days} day${run.days === 1 ? "" : "s"}`}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {`That's how long ${currency.format(run.liquid)} on hand lasts at Sam's real pace of ${currency.format(run.avgDailySpend)}/day. Kind wording, brutal math — that's the whole app.`}
            </p>
          </div>
        )}

        <ProjectionSection
          data={data}
          todayISO={todayISO}
          anchorISO={toISO(addDays(parseISO(todayISO), -56))}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-5">
          <div>
            <p className="font-semibold text-emerald-200">
              Your numbers will look different. That&apos;s the point.
            </p>
            <p className="mt-1 text-sm text-emerald-100/70">
              Free account, three questions to set up, nothing connects to your
              bank — you type the numbers, the app shows you the math.
            </p>
          </div>
          <Link
            href="/login"
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Start with your paycheck →
          </Link>
        </div>
      </div>
      <LegalFooter disclaimer />
    </main>
  );
}
