import { describe, expect, it } from "vitest";
import { monthGrid, parseMonthKey } from "./cashCalendar";
import type { Expense, IncomeSource } from "./types";

const income: IncomeSource[] = [
  {
    id: "i1",
    name: "Job",
    amount: 1500,
    frequency: "biweekly",
    kind: "paycheck",
    anchorDate: "2026-08-07",
  },
];
const expenses: Expense[] = [
  { id: "r", name: "Rent", amount: 900, bucketId: null, dueDate: "2026-05-01", cadence: "monthly" },
  { id: "n", name: "Netflix", amount: 15.49, bucketId: null, dueDate: "2026-05-12", cadence: "monthly" },
  { id: "p", name: "Paused thing", amount: 50, bucketId: null, dueDate: "2026-05-20", cadence: "monthly", isPaused: true },
];

describe("monthGrid", () => {
  const weeks = monthGrid(income, expenses, 2026, 8, "2026-08-03", "2026-08-12");
  const days = weeks.flat();

  it("covers the whole month in Sunday-first weeks", () => {
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const inMonth = days.filter((d) => d.inMonth);
    expect(inMonth.length).toBe(31); // August
    expect(days[0].date >= "2026-07-26").toBe(true);
  });

  it("places paydays with their totals", () => {
    const aug7 = days.find((d) => d.date === "2026-08-07")!;
    const aug21 = days.find((d) => d.date === "2026-08-21")!;
    expect(aug7.paydayTotal).toBe(1500);
    expect(aug21.paydayTotal).toBe(1500);
  });

  it("places bill occurrences and skips paused ones", () => {
    const aug1 = days.find((d) => d.date === "2026-08-01")!;
    expect(aug1.bills.map((b) => b.name)).toEqual(["Rent"]);
    expect(aug1.totalBills).toBe(900);
    const aug20 = days.find((d) => d.date === "2026-08-20")!;
    expect(aug20.bills).toEqual([]);
  });

  it("marks today and the danger day", () => {
    expect(days.find((d) => d.date === "2026-08-03")!.isToday).toBe(true);
    expect(days.find((d) => d.date === "2026-08-12")!.isDanger).toBe(true);
  });
});

describe("parseMonthKey", () => {
  it("parses valid keys and falls back to today's month", () => {
    expect(parseMonthKey("2026-03", "2026-08-03")).toEqual({ year: 2026, month: 3 });
    expect(parseMonthKey(undefined, "2026-08-03")).toEqual({ year: 2026, month: 8 });
    expect(parseMonthKey("garbage", "2026-08-03")).toEqual({ year: 2026, month: 8 });
  });
});
