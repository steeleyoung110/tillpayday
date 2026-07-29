import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PrintButton } from "@/components/PrintButton";
import { classifyBucket } from "@/lib/bucketColor";
import { getDashboardData } from "@/lib/data";
import {
  addDays,
  generateOccurrences,
  generatePayDates,
  parseISO,
  splitPaycheck,
  toISO,
} from "@/lib/engine";
import {
  bucketToEngine,
  expenseToEngine,
  incomeToEngine,
} from "@/lib/rows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function gradeFor(actual: number, planned: number): { grade: string; tone: string } {
  if (planned <= 0) return { grade: "—", tone: "text-slate-500" };
  const ratio = actual / planned;
  if (ratio <= 1) return { grade: "A", tone: "text-emerald-300" };
  if (ratio <= 1.1) return { grade: "B", tone: "text-lime-300" };
  if (ratio <= 1.3) return { grade: "C", tone: "text-amber-300" };
  return { grade: "F", tone: "text-red-300" };
}

/**
 * The month, wrapped: money in, money out, per-bucket grades, biggest spend,
 * heaviest day — the honest report card. Print-friendly (save as PDF).
 */
export default async function WrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const todayISO = new Date().toISOString().slice(0, 10);
  const { m } = await searchParams;
  const monthKey = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : todayISO.slice(0, 7);
  const [yearS, monS] = monthKey.split("-");
  const year = Number(yearS);
  const monthIdx = Number(monS) - 1;

  const first = new Date(Date.UTC(year, monthIdx, 1));
  const lastOfMonth = addDays(new Date(Date.UTC(year, monthIdx + 1, 1)), -1);
  const today = parseISO(todayISO);
  const end = lastOfMonth <= today ? lastOfMonth : today;
  const isPartial = end < lastOfMonth;

  const data = await getDashboardData();
  const engineIncome = data.income.map(incomeToEngine);
  const engineBuckets = data.buckets.map(bucketToEngine);
  const engineExpenses = data.expenses.map(expenseToEngine);

  // Money in: scheduled paychecks + logged income inside the window.
  let paydayCount = 0;
  let moneyIn = 0;
  for (const src of engineIncome) {
    if (src.kind !== "paycheck") continue;
    const dates = generatePayDates(src, first, end);
    paydayCount += dates.length;
    moneyIn += dates.length * src.amount;
  }
  for (const e of data.incomeEntries) {
    const d = e.received_date;
    if (d >= toISO(first) && d <= toISO(end)) moneyIn += Number(e.amount);
  }
  moneyIn = Math.round(moneyIn * 100) / 100;

  // Money out: every expense occurrence in the window.
  interface Line { name: string; amount: number; date: string; bucketId: string | null }
  const lines: Line[] = [];
  for (const e of engineExpenses) {
    if (e.isPaused) continue;
    for (const d of generateOccurrences(e.dueDate, e.cadence, first, end)) {
      lines.push({ name: e.name, amount: e.amount, date: toISO(d), bucketId: e.bucketId });
    }
  }
  const moneyOut = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const kept = Math.round((moneyIn - moneyOut) * 100) / 100;

  const biggest = [...lines].sort((a, b) => b.amount - a.amount)[0] ?? null;
  const byDay = new Map<string, number>();
  for (const l of lines) byDay.set(l.date, (byDay.get(l.date) ?? 0) + l.amount);
  const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  // Report card: per-bucket actual vs the month's plan (per-check split ×
  // paydays that landed). Savings is excluded — it's the destination.
  const typical = Math.max(0, ...engineIncome.filter((s) => s.kind === "paycheck").map((s) => s.amount));
  const split = splitPaycheck(engineBuckets, typical);
  const actualByBucket = new Map<string | null, number>();
  for (const l of lines) {
    actualByBucket.set(l.bucketId, (actualByBucket.get(l.bucketId) ?? 0) + l.amount);
  }
  const report = split
    .filter((s) => {
      const row = s.bucketId ? data.buckets.find((b) => b.id === s.bucketId) : null;
      return row && !row.is_savings;
    })
    .map((s) => {
      const planned = Math.round(s.amount * paydayCount * 100) / 100;
      const actual = Math.round((actualByBucket.get(s.bucketId) ?? 0) * 100) / 100;
      return { name: s.name, planned, actual, ...gradeFor(actual, planned) };
    });

  const monthName = `${MONTHS[monthIdx]} ${year}`;
  const priorMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  return (
    <AppShell active="budget">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {priorMonths.map((key) => (
              <Link
                key={key}
                href={`/wrapped?m=${key}`}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  key === monthKey
                    ? "bg-emerald-500 font-semibold text-slate-950"
                    : "border border-slate-700 text-slate-300 hover:border-emerald-400"
                }`}
              >
                {`${MONTHS[Number(key.split("-")[1]) - 1].slice(0, 3)} ${key.split("-")[0]}`}
              </Link>
            ))}
          </div>
          <span className="flex items-center gap-2">
            <Link
              href="/wrapped/year"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-emerald-400"
            >
              Year wrapped 🎆
            </Link>
            <PrintButton />
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Till Payday — month, wrapped</p>
          <h1 className="mt-1 text-3xl font-black text-white">{monthName}</h1>
          {isPartial && (
            <p className="mt-1 text-xs text-amber-300">
              Month still in progress — these numbers only count what has
              already happened.
            </p>
          )}

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-800/60 p-4">
              <p className="text-xs text-slate-500">Money in</p>
              <p className="mt-1 text-xl font-bold text-emerald-300">{currency.format(moneyIn)}</p>
              <p className="text-xs text-slate-500">{`${paydayCount} payday${paydayCount === 1 ? "" : "s"}`}</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-4">
              <p className="text-xs text-slate-500">Money out</p>
              <p className="mt-1 text-xl font-bold text-red-300">{`−${currency.format(moneyOut)}`}</p>
              <p className="text-xs text-slate-500">{`${lines.length} spend${lines.length === 1 ? "" : "s"}`}</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-4">
              <p className="text-xs text-slate-500">{kept >= 0 ? "Kept" : "Overspent by"}</p>
              <p className={`mt-1 text-xl font-bold ${kept >= 0 ? "text-white" : "text-red-300"}`}>
                {currency.format(Math.abs(kept))}
              </p>
              <p className="text-xs text-slate-500">
                {moneyIn > 0 ? `${Math.round((kept / moneyIn) * 100)}% of income` : ""}
              </p>
            </div>
          </div>

          {report.length > 0 && (
            <div className="mt-6">
              <h2 className="font-semibold text-white">Report card</h2>
              <ul className="mt-2 space-y-1">
                {report.map((r) => (
                  <li
                    key={r.name}
                    className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-200">{r.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-slate-400">
                        {`${currency.format(r.actual)} of ${currency.format(r.planned)} planned`}
                      </span>
                      <span className={`w-6 text-right text-lg font-black ${r.tone}`}>{r.grade}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                A = within plan · B = up to 10% over · C = up to 30% over ·
                F = you already know. Grades compare against your own plan,
                nobody else&apos;s.
              </p>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {biggest && (
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-xs text-slate-500">Biggest single spend</p>
                <p className="mt-1 font-semibold text-white">{biggest.name}</p>
                <p className="text-sm text-red-300">{`−${currency.format(biggest.amount)} · ${biggest.date}`}</p>
              </div>
            )}
            {busiest && (
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-xs text-slate-500">Heaviest day</p>
                <p className="mt-1 font-semibold text-white">{busiest[0]}</p>
                <p className="text-sm text-red-300">{`−${currency.format(Math.round(busiest[1] * 100) / 100)} in one day`}</p>
              </div>
            )}
          </div>

          {lines.length === 0 && (
            <p className="mt-6 text-sm text-slate-500">
              Nothing recorded this month{isPartial ? " yet" : ""} — either a
              perfectly quiet month or an unlogged one. Only you know which.
            </p>
          )}
        </div>

        <p className="no-print text-xs text-slate-600">
          Educational reflection based on what you logged — not financial
          advice, and only as honest as your logging.
        </p>
      </div>
    </AppShell>
  );
}
