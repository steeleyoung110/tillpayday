/**
 * ICS calendar feed builder: paydays and bill due dates as all-day events,
 * so money shows up where people actually look every morning. Pure.
 */
import {
  addDays,
  generateOccurrences,
  generatePayDates,
  parseISO,
  toISO,
  type Cadence,
  type Frequency,
  type IncomeKind,
} from "@/lib/engine";

export interface FeedIncome {
  name: string;
  amount: number;
  frequency: Frequency;
  kind: IncomeKind;
  anchor_date: string;
}

export interface FeedExpense {
  name: string;
  amount: number;
  due_date: string;
  cadence: Cadence;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** RFC 5545 text escaping. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function dateStamp(iso: string): string {
  return iso.replace(/-/g, "");
}

function event(uid: string, dateISO: string, summary: string): string[] {
  const next = toISO(addDays(parseISO(dateISO), 1));
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@tillpayday`,
    `DTSTAMP:${dateStamp(dateISO)}T000000Z`,
    `DTSTART;VALUE=DATE:${dateStamp(dateISO)}`,
    `DTEND;VALUE=DATE:${dateStamp(next)}`,
    `SUMMARY:${esc(summary)}`,
    "END:VEVENT",
  ];
}

/** Build the full feed: [today−7, today+horizonDays] of paydays and bills. */
export function buildCalendarFeed(
  income: FeedIncome[],
  expenses: FeedExpense[],
  todayISO: string,
  horizonDays = 90,
): string {
  const start = addDays(parseISO(todayISO), -7);
  const end = addDays(parseISO(todayISO), horizonDays);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Till Payday//Feed//EN",
    "X-WR-CALNAME:Till Payday",
  ];

  income
    .filter((s) => s.frequency !== "irregular")
    .forEach((s, i) => {
      for (const d of generatePayDates(
        {
          id: `i${i}`,
          name: s.name,
          amount: Number(s.amount),
          frequency: s.frequency,
          kind: s.kind,
          anchorDate: s.anchor_date,
        },
        start,
        end,
      )) {
        const iso = toISO(d);
        lines.push(
          ...event(
            `pay-${i}-${iso}`,
            iso,
            `💵 Payday — ${s.name} ${currency.format(Number(s.amount))}`,
          ),
        );
      }
    });

  expenses.forEach((e, i) => {
    for (const d of generateOccurrences(e.due_date, e.cadence, start, end)) {
      const iso = toISO(d);
      lines.push(
        ...event(
          `bill-${i}-${iso}`,
          iso,
          `${e.name} due — ${currency.format(Number(e.amount))}`,
        ),
      );
    }
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
