/**
 * Cash-flow calendar: the month as a grid — paydays green, bills red, the
 * danger day flagged, today ringed. Server component; month navigation is
 * plain links (?cal=YYYY-MM).
 */
import Link from "next/link";
import type { CalendarDayCell } from "@/lib/engine";

const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function CashflowCalendar({
  weeks,
  year,
  month,
}: {
  weeks: CalendarDayCell[][];
  year: number;
  month: number; // 1–12
}) {
  const prev = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
  const next = month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-white">
          {`Money calendar — ${MONTHS[month - 1]} ${year}`}
        </h2>
        <span className="flex items-center gap-2 text-sm">
          <Link
            href={`/budget?cal=${prev}#calendar`}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 transition hover:border-emerald-400"
          >
            ←
          </Link>
          <Link
            href={`/budget?cal=${next}#calendar`}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 transition hover:border-emerald-400"
          >
            →
          </Link>
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="pb-1">{d}</div>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                className={`min-h-16 rounded-lg border p-1 text-left ${
                  day.isDanger
                    ? "border-red-500/60 bg-red-500/10"
                    : day.isToday
                      ? "border-emerald-400/60 bg-slate-800"
                      : day.inMonth
                        ? "border-slate-800 bg-slate-800/40"
                        : "border-transparent bg-transparent opacity-40"
                }`}
                title={
                  day.bills.length > 0
                    ? day.bills.map((b) => `${b.name} ${cents.format(b.amount)}`).join(", ")
                    : undefined
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className={day.isToday ? "font-bold text-emerald-300" : "text-slate-400"}>
                    {day.dayOfMonth}
                  </span>
                  {day.isDanger && <span title="Danger day — lowest point before payday">⚠️</span>}
                </div>
                {day.paydayTotal > 0 && (
                  <p className="mt-0.5 truncate text-xs font-semibold text-emerald-300">
                    {`+${cents.format(day.paydayTotal)}`}
                  </p>
                )}
                {day.sideTotal > 0 && (
                  <p
                    className="mt-0.5 truncate text-xs font-semibold text-teal-300"
                    title="Side income — real money, but it lands in savings instead of splitting into buckets"
                  >
                    {`+${cents.format(day.sideTotal)}`}
                  </p>
                )}
                {day.totalBills > 0 && (
                  <p className="mt-0.5 truncate text-xs text-red-300">
                    {`−${cents.format(day.totalBills)}`}
                  </p>
                )}
                {day.bills.slice(0, 2).map((b) => (
                  <p key={b.name} className="truncate text-[10px] leading-tight text-slate-400">
                    {b.name}
                  </p>
                ))}
                {day.bills.length > 2 && (
                  <p className="text-[10px] text-slate-400">{`+${day.bills.length - 2} more`}</p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Green is a paycheck landing, teal is side income (rent, gigs — real
        money, but it goes to savings rather than splitting into buckets), red
        is money leaving. ⚠️ marks the day your total bottoms out before the
        next check.
      </p>
    </div>
  );
}
