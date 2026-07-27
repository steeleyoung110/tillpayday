import { describe, expect, it } from "vitest";
import { buildCalendarFeed } from "./ics";

const income = [
  { name: "Job", amount: 1000, frequency: "biweekly" as const, kind: "paycheck" as const, anchor_date: "2026-08-03" },
];
const expenses = [
  { name: "Rent, apt; unit 4", amount: 900, due_date: "2026-08-01", cadence: "monthly" as const },
];

describe("buildCalendarFeed", () => {
  const feed = buildCalendarFeed(income, expenses, "2026-07-27", 60);

  it("is a valid-shaped VCALENDAR with all-day events", () => {
    expect(feed.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(feed.endsWith("END:VCALENDAR")).toBe(true);
    expect(feed).toContain("DTSTART;VALUE=DATE:20260803"); // first payday
  });

  it("emits paydays on the biweekly lattice and monthly bill occurrences", () => {
    expect(feed).toContain("SUMMARY:💵 Payday — Job $1\\,000.00");
    expect(feed).toContain("DTSTART;VALUE=DATE:20260817"); // next payday
    expect(feed).toContain("DTSTART;VALUE=DATE:20260801"); // Aug rent
    expect(feed).toContain("DTSTART;VALUE=DATE:20260901"); // Sep rent
  });

  it("escapes commas and semicolons per RFC 5545", () => {
    expect(feed).toContain("SUMMARY:Rent\\, apt\\; unit 4 due — $900.00");
  });

  it("skips irregular income (no schedule to draw)", () => {
    const f = buildCalendarFeed(
      [{ ...income[0], frequency: "irregular" as const }],
      [],
      "2026-07-27",
    );
    expect(f).not.toContain("💵 Payday"); // the calendar NAME is "Till Payday"
  });
});
