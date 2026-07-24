import { describe, it, expect } from "vitest";
import { addDays, addMonths, diffDays, parseISO, toISO } from "./dates";
import {
  generateOccurrences,
  generatePayDates,
  irregularWeeklyBaseline,
  runProjection,
  evaluateWhatIf,
  labelSetback,
  splitPaycheck,
} from "./projection";
import type {
  Bucket,
  IncomeEntry,
  IncomeSource,
  ProjectionInput,
  ShortfallWarning,
} from "./types";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
describe("date helpers", () => {
  it("adds days", () => {
    expect(toISO(addDays(parseISO("2026-01-01"), 7))).toBe("2026-01-08");
    expect(toISO(addDays(parseISO("2026-01-31"), 1))).toBe("2026-02-01");
  });

  it("adds months and clamps to end of month", () => {
    expect(toISO(addMonths(parseISO("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toISO(addMonths(parseISO("2024-01-31"), 1))).toBe("2024-02-29"); // leap year
    expect(toISO(addMonths(parseISO("2026-01-15"), 12))).toBe("2027-01-15");
  });

  it("computes day differences", () => {
    expect(diffDays(parseISO("2026-01-01"), parseISO("2026-01-08"))).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Pay-date generation (rule 1: literal paydays, no weekend shifting)
// ---------------------------------------------------------------------------
describe("generatePayDates", () => {
  const mk = (frequency: IncomeSource["frequency"], anchorDate: string): IncomeSource => ({
    id: "i",
    name: "Job",
    amount: 1000,
    frequency,
    kind: "paycheck",
    anchorDate,
  });

  it("weekly lands every 7 days from the anchor", () => {
    const dates = generatePayDates(
      mk("weekly", "2026-01-01"),
      parseISO("2026-01-01"),
      parseISO("2026-01-31"),
    ).map(toISO);
    expect(dates).toEqual([
      "2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22", "2026-01-29",
    ]);
  });

  it("biweekly is anchored to the chosen next-payday date", () => {
    const dates = generatePayDates(
      mk("biweekly", "2026-01-01"),
      parseISO("2026-01-10"),
      parseISO("2026-02-28"),
    ).map(toISO);
    expect(dates).toEqual(["2026-01-15", "2026-01-29", "2026-02-12", "2026-02-26"]);
  });

  it("does not shift weekend paydays", () => {
    // 2026-01-03 is a Saturday; it must land there literally.
    const dates = generatePayDates(
      mk("weekly", "2026-01-03"),
      parseISO("2026-01-01"),
      parseISO("2026-01-10"),
    ).map(toISO);
    expect(dates).toEqual(["2026-01-03", "2026-01-10"]);
  });

  it("semimonthly lands on the 1st and 15th, ignoring the anchor day", () => {
    const dates = generatePayDates(
      mk("semimonthly", "2026-01-10"),
      parseISO("2026-01-01"),
      parseISO("2026-02-28"),
    ).map(toISO);
    expect(dates).toEqual(["2026-01-01", "2026-01-15", "2026-02-01", "2026-02-15"]);
  });

  it("monthly keeps the chosen day-of-month, clamped in short months", () => {
    const dates = generatePayDates(
      mk("monthly", "2026-01-31"),
      parseISO("2026-01-01"),
      parseISO("2026-04-30"),
    ).map(toISO);
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

// ---------------------------------------------------------------------------
// Expense occurrences
// ---------------------------------------------------------------------------
describe("generateOccurrences", () => {
  const start = parseISO("2026-01-01");
  const end = parseISO("2027-01-01");

  it("one-time returns a single date inside the range", () => {
    expect(generateOccurrences("2026-06-15", "one_time", start, end).map(toISO)).toEqual([
      "2026-06-15",
    ]);
    expect(generateOccurrences("2030-06-15", "one_time", start, end)).toHaveLength(0);
  });

  it("monthly repeats every month", () => {
    expect(generateOccurrences("2026-01-15", "monthly", start, end)).toHaveLength(12);
  });

  it("quarterly repeats every 3 months", () => {
    expect(generateOccurrences("2026-01-15", "quarterly", start, end)).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Projection engine — payday waterfall
// ---------------------------------------------------------------------------
const buckets: Bucket[] = [
  { id: "rent", name: "Rent", allocationType: "fixed", allocationValue: 1000, isSavings: false, priority: 0 },
  { id: "fun", name: "Fun money", allocationType: "percent", allocationValue: 10, isSavings: false, priority: 1 },
  { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
];

const baseInput: ProjectionInput = {
  startDate: "2026-01-01",
  months: 12,
  incomeSources: [
    { id: "job", name: "Job", amount: 3000, frequency: "monthly", kind: "paycheck", anchorDate: "2026-01-01" },
  ],
  buckets,
  expenses: [],
};

// 13 paychecks fall in [2026-01-01, 2027-01-01] because both ends are inclusive.
const PAYCHECKS = 13;

describe("runProjection — payday waterfall", () => {
  it("fixed first, then percent of the remainder, then leftover to savings", () => {
    const r = runProjection(baseInput);
    const day1 = r.points[0];
    // 3000 → rent 1000 (fixed), fun 10% of the remaining 2000 = 200, savings 1800.
    expect(day1.buckets.rent).toBe(1000);
    expect(day1.buckets.fun).toBe(200);
    expect(day1.buckets.save).toBe(1800);
  });

  it("sweeps spending buckets into savings each payday — buckets reset, savings accumulates", () => {
    const r = runProjection(baseInput);
    // Day of the second payday (Feb 1): rent+fun leftovers (1200) swept first,
    // then refilled — so buckets read 1000/200 again and savings has grown by
    // the sweep plus the new leftover.
    const feb1 = r.points.find((p) => p.date === "2026-02-01")!;
    expect(feb1.buckets.rent).toBe(1000);
    expect(feb1.buckets.fun).toBe(200);
    expect(feb1.buckets.save).toBe(1800 * 2 + 1200);
    // End of horizon: savings holds everything except the last cycle's refills.
    expect(r.endingSavings).toBe(1800 * PAYCHECKS + 1200 * (PAYCHECKS - 1));
    expect(r.endingTotal).toBe(3000 * PAYCHECKS);
  });

  it("routes side income straight to savings", () => {
    const r = runProjection({
      ...baseInput,
      incomeSources: [
        ...baseInput.incomeSources,
        { id: "gig", name: "Side gig", amount: 500, frequency: "monthly", kind: "side", anchorDate: "2026-01-01" },
      ],
    });
    expect(r.endingTotal).toBe(3000 * PAYCHECKS + 500 * PAYCHECKS);
    expect(r.endingSavings).toBe(
      1800 * PAYCHECKS + 1200 * (PAYCHECKS - 1) + 500 * PAYCHECKS,
    );
  });

  it("starts mid-cycle from a provided starting savings balance", () => {
    const r = runProjection({
      ...baseInput,
      startDate: "2026-01-10", // between paydays
      startingBalances: { save: 500 },
    });
    expect(r.points[0].savings).toBe(500);
    expect(r.points[0].total).toBe(500);
    // First payday arrives Feb 1 and the waterfall runs normally on top.
    const feb1 = r.points.find((p) => p.date === "2026-02-01")!;
    expect(feb1.buckets.save).toBe(500 + 1800);
  });
});

// ---------------------------------------------------------------------------
// Sinking funds (rollsOver) — exempt from the payday sweep
// ---------------------------------------------------------------------------
describe("runProjection — sinking funds", () => {
  const withConcert: ProjectionInput = {
    ...baseInput,
    buckets: [
      { id: "concert", name: "Concert fund", allocationType: "fixed", allocationValue: 100, isSavings: false, priority: 0, rollsOver: true },
      { id: "fun", name: "Fun", allocationType: "fixed", allocationValue: 200, isSavings: false, priority: 1 },
      { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
    ],
  };

  it("accumulates its allocation every paycheck instead of resetting to it", () => {
    const r = runProjection(withConcert);
    const feb1 = r.points.find((p) => p.date === "2026-02-01")!;
    const mar1 = r.points.find((p) => p.date === "2026-03-01")!;
    expect(r.points[0].buckets.concert).toBe(100);
    expect(feb1.buckets.concert).toBe(200); // kept + refilled
    expect(mar1.buckets.concert).toBe(300);
    expect(r.points[r.points.length - 1].buckets.concert).toBe(100 * PAYCHECKS);
    // The regular bucket still resets: swept (200) then refilled to 200.
    expect(feb1.buckets.fun).toBe(200);
  });

  it("drains when its expenses hit and keeps growing after", () => {
    const r = runProjection({
      ...withConcert,
      expenses: [
        { id: "tix", name: "Concert tickets", amount: 250, bucketId: "concert", dueDate: "2026-03-10", cadence: "one_time" },
      ],
    });
    const mar10 = r.points.find((p) => p.date === "2026-03-10")!;
    expect(mar10.buckets.concert).toBe(50); // 300 saved − 250 tickets
    const apr1 = r.points.find((p) => p.date === "2026-04-01")!;
    expect(apr1.buckets.concert).toBe(150); // keeps stacking
    expect(r.warnings).toHaveLength(0);
  });

  it("still conserves every penny (rollover money just stays put)", () => {
    const r = runProjection(withConcert);
    expect(r.endingTotal).toBe(3000 * PAYCHECKS);
    const last = r.points[r.points.length - 1];
    const sum = Object.values(last.buckets).reduce(
      (s, v) => Math.round((s + v) * 100) / 100,
      0,
    );
    expect(sum).toBe(r.endingTotal);
  });
});

// ---------------------------------------------------------------------------
// Priority + underfunding (rule 4)
// ---------------------------------------------------------------------------
describe("runProjection — priority underfunding", () => {
  const tight: ProjectionInput = {
    startDate: "2026-01-01",
    months: 1,
    incomeSources: [
      { id: "job", name: "Job", amount: 500, frequency: "monthly", kind: "paycheck", anchorDate: "2026-01-01" },
    ],
    buckets: [
      { id: "a", name: "A", allocationType: "fixed", allocationValue: 400, isSavings: false, priority: 0 },
      { id: "b", name: "B", allocationType: "fixed", allocationValue: 300, isSavings: false, priority: 1 },
      { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
    ],
    expenses: [],
  };

  it("funds by priority and flags the bucket that ran dry", () => {
    const r = runProjection(tight);
    expect(r.points[0].buckets.a).toBe(400);
    expect(r.points[0].buckets.b).toBe(100);
    expect(r.points[0].buckets.save).toBe(0);

    const w = r.warnings.filter((x) => x.type === "underfunded");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      type: "underfunded",
      bucketId: "b",
      requested: 300,
      funded: 100,
      date: "2026-01-01",
    });
  });

  it("priority order decides who gets paid first", () => {
    const swapped = {
      ...tight,
      buckets: tight.buckets.map((b) =>
        b.id === "a" ? { ...b, priority: 2 } : b,
      ),
    };
    const r = runProjection(swapped);
    expect(r.points[0].buckets.b).toBe(300);
    expect(r.points[0].buckets.a).toBe(200);
    expect(r.warnings[0]).toMatchObject({ type: "underfunded", bucketId: "a" });
  });

  it("percent buckets can also go underfunded when percents exceed 100", () => {
    const r = runProjection({
      ...tight,
      buckets: [
        { id: "p1", name: "P1", allocationType: "percent", allocationValue: 80, isSavings: false, priority: 0 },
        { id: "p2", name: "P2", allocationType: "percent", allocationValue: 80, isSavings: false, priority: 1 },
        { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
      ],
    });
    expect(r.points[0].buckets.p1).toBe(400); // 80% of 500
    expect(r.points[0].buckets.p2).toBe(100); // only 100 left
    expect(r.warnings[0]).toMatchObject({ type: "underfunded", bucketId: "p2" });
    expect(r.points[0].buckets.save).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Expenses + shortfall warnings (rule 5)
// ---------------------------------------------------------------------------
describe("runProjection — expenses and shortfalls", () => {
  it("deducts expenses from their bucket on the due date", () => {
    const r = runProjection({
      ...baseInput,
      expenses: [
        { id: "e1", name: "Rent bill", amount: 1000, bucketId: "rent", dueDate: "2026-01-05", cadence: "monthly" },
      ],
    });
    const jan5 = r.points.find((p) => p.date === "2026-01-05")!;
    expect(jan5.buckets.rent).toBe(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("an unaffordable expense empties its bucket, raids the others, and never goes red", () => {
    const r = runProjection({
      ...baseInput,
      months: 2,
      expenses: [
        { id: "big", name: "Surprise bill", amount: 1600, bucketId: "rent", dueDate: "2026-01-05", cadence: "one_time" },
      ],
    });
    const jan5 = r.points.find((p) => p.date === "2026-01-05")!;
    // Rent pays its 1000 and stops at ZERO; the 600 overflow raids Fun (200)
    // — fun money dies first — and savings covers the last 400.
    expect(jan5.buckets.rent).toBe(0);
    expect(jan5.buckets.fun).toBe(0);
    expect(jan5.buckets.save).toBe(1800 - 400);

    const w = r.warnings.filter((x) => x.type === "shortfall");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      type: "shortfall",
      bucketId: "rent",
      month: "January 2026",
      amount: 600,
    });
    // Next payday everything refills cleanly.
    const feb1 = r.points.find((p) => p.date === "2026-02-01")!;
    expect(feb1.buckets.rent).toBe(1000);
  });

  it("only savings can ever go red — and only once every bucket is at zero", () => {
    const r = runProjection({
      ...baseInput,
      months: 1,
      expenses: [
        { id: "huge", name: "Disaster", amount: 4000, bucketId: "fun", dueDate: "2026-01-10", cadence: "one_time" },
      ],
    });
    const jan10 = r.points.find((p) => p.date === "2026-01-10")!;
    // Fun (200) empties, rent (1000) gets raided to zero, savings (1800)
    // covers the rest and alone wears the red: 1800 − 2800 = −1000.
    expect(jan10.buckets.fun).toBe(0);
    expect(jan10.buckets.rent).toBe(0);
    expect(jan10.buckets.save).toBe(-1000);
    // Invariant: no non-savings bucket is ever negative, any day.
    for (const p of r.points) {
      expect(p.buckets.rent).toBeGreaterThanOrEqual(0);
      expect(p.buckets.fun).toBeGreaterThanOrEqual(0);
    }
  });

  it("the raid takes the least-important bucket first (fun before bills)", () => {
    const r = runProjection({
      startDate: "2026-01-01",
      months: 1,
      incomeSources: [
        { id: "j", name: "Job", amount: 1000, frequency: "monthly", kind: "paycheck", anchorDate: "2026-01-01" },
      ],
      buckets: [
        { id: "bills", name: "Bills", allocationType: "fixed", allocationValue: 300, isSavings: false, priority: 0 },
        { id: "target", name: "Target", allocationType: "fixed", allocationValue: 100, isSavings: false, priority: 1 },
        { id: "fun", name: "Fun", allocationType: "fixed", allocationValue: 200, isSavings: false, priority: 2 },
        { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
      ],
      expenses: [
        { id: "e", name: "Bill", amount: 250, bucketId: "target", dueDate: "2026-01-05", cadence: "one_time" },
      ],
    });
    const jan5 = r.points.find((p) => p.date === "2026-01-05")!;
    // Target's 100 goes first; the 150 overflow raids Fun (lowest priority)
    // fully within its 200 — Bills and savings untouched.
    expect(jan5.buckets.target).toBe(0);
    expect(jan5.buckets.fun).toBe(50);
    expect(jan5.buckets.bills).toBe(300);
    expect(jan5.buckets.save).toBe(400);
  });

  it("paused buckets are frozen — the raid can't touch them", () => {
    const r = runProjection({
      ...baseInput,
      months: 1,
      startingBalances: { fun: 0 },
      buckets: buckets.map((b) => (b.id === "fun" ? { ...b, isPaused: true } : b)),
      expenses: [
        { id: "big", name: "Bill", amount: 1500, bucketId: "rent", dueDate: "2026-01-05", cadence: "one_time" },
      ],
    });
    const jan5 = r.points.find((p) => p.date === "2026-01-05")!;
    // Rent 1000 → 0; fun is paused (frozen at 0, and even with money it
    // would be immune, so it takes no allocation either); savings holds the
    // full 2000 leftover and covers the 500 overflow.
    expect(jan5.buckets.rent).toBe(0);
    expect(jan5.buckets.save).toBe(2000 - 500);
  });

  it("a savings bill drains the other buckets before savings goes red", () => {
    const r = runProjection({
      ...baseInput,
      months: 1,
      expenses: [
        { id: "e", name: "From savings", amount: 3500, bucketId: null, dueDate: "2026-01-10", cadence: "one_time" },
      ],
    });
    const jan10 = r.points.find((p) => p.date === "2026-01-10")!;
    // Savings 1800 → 0, then fun (200) and rent (1000) empty, and the final
    // 500 puts savings — and only savings — in the red.
    expect(jan10.buckets.fun).toBe(0);
    expect(jan10.buckets.rent).toBe(0);
    expect(jan10.buckets.save).toBe(-500);
  });

  it("expenses with no bucket draw from savings", () => {
    const r = runProjection({
      ...baseInput,
      months: 1,
      expenses: [
        { id: "e", name: "Misc", amount: 100, bucketId: null, dueDate: "2026-01-02", cadence: "one_time" },
      ],
    });
    const jan2 = r.points.find((p) => p.date === "2026-01-02")!;
    expect(jan2.buckets.save).toBe(1700);
  });
});

// ---------------------------------------------------------------------------
// Rounding + the penny-conservation invariant (rule 6)
// ---------------------------------------------------------------------------
describe("runProjection — rounding and penny conservation", () => {
  it("percent allocations floor to the cent; the crumbs land in savings", () => {
    const r = runProjection({
      startDate: "2026-01-01",
      months: 1,
      incomeSources: [
        { id: "j", name: "J", amount: 100.01, frequency: "monthly", kind: "paycheck", anchorDate: "2026-01-01" },
      ],
      buckets: [
        { id: "p", name: "P", allocationType: "percent", allocationValue: 33.33, isSavings: false, priority: 0 },
        { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
      ],
      expenses: [],
    });
    // 33.33% of 100.01 = 33.333333 → floors to 33.33, crumb 0.003333 to savings.
    expect(r.points[0].buckets.p).toBe(33.33);
    expect(r.points[0].buckets.save).toBe(66.68);
    expect(r.points[0].total).toBe(100.01);
  });

  const uglyScenario: ProjectionInput = {
    startDate: "2026-01-03",
    months: 12,
    startingBalances: { save: 123.45 },
    incomeSources: [
      { id: "a", name: "A", amount: 1033.37, frequency: "biweekly", kind: "paycheck", anchorDate: "2026-01-09" },
      { id: "b", name: "B", amount: 777.77, frequency: "semimonthly", kind: "paycheck", anchorDate: "2026-01-01" },
      { id: "c", name: "C", amount: 66.66, frequency: "monthly", kind: "side", anchorDate: "2026-01-20" },
    ],
    buckets: [
      { id: "f1", name: "F1", allocationType: "fixed", allocationValue: 123.45, isSavings: false, priority: 0 },
      { id: "p1", name: "P1", allocationType: "percent", allocationValue: 33.33, isSavings: false, priority: 1 },
      { id: "p2", name: "P2", allocationType: "percent", allocationValue: 7.77, isSavings: false, priority: 2 },
      { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
    ],
    expenses: [
      { id: "e1", name: "E1", amount: 111.11, bucketId: "p1", dueDate: "2026-01-07", cadence: "monthly" },
      { id: "e2", name: "E2", amount: 45.67, bucketId: null, dueDate: "2026-02-14", cadence: "quarterly" },
      { id: "e3", name: "E3", amount: 999.99, bucketId: "f1", dueDate: "2026-06-06", cadence: "one_time" },
    ],
  };

  it("total income = total allocated + savings, to the exact penny, every day", () => {
    const r = runProjection(uglyScenario);
    const start = parseISO(uglyScenario.startDate);
    const end = addMonths(start, 12);

    // Independently total the expenses that fall in range.
    let totalExpenses = 0;
    for (const e of uglyScenario.expenses) {
      const n = generateOccurrences(e.dueDate, e.cadence, start, end).length;
      totalExpenses = Math.round((totalExpenses + n * e.amount) * 100) / 100;
    }

    const last = r.points[r.points.length - 1];
    const sumBuckets = Object.values(last.buckets).reduce(
      (s, v) => Math.round((s + v) * 100) / 100,
      0,
    );
    const expected =
      Math.round((123.45 + r.totalIncome - totalExpenses) * 100) / 100;

    // The whole horizon of paydays, sweeps, floors and expenses nets out exactly.
    expect(sumBuckets).toBe(expected);
    expect(last.total).toBe(expected);
    expect(r.totalInterest).toBe(0);

    // And no day in between ever leaks a cent: each day's total moves exactly
    // by that day's income minus that day's expenses.
    const incomeByDay = new Map<string, number>();
    for (const s of uglyScenario.incomeSources) {
      for (const d of generatePayDates(s, start, end)) {
        const k = toISO(d);
        incomeByDay.set(k, Math.round(((incomeByDay.get(k) ?? 0) + s.amount) * 100) / 100);
      }
    }
    const expenseByDay = new Map<string, number>();
    for (const e of uglyScenario.expenses) {
      for (const d of generateOccurrences(e.dueDate, e.cadence, start, end)) {
        const k = toISO(d);
        expenseByDay.set(k, Math.round(((expenseByDay.get(k) ?? 0) + e.amount) * 100) / 100);
      }
    }
    let running = 123.45;
    for (const p of r.points) {
      running = Math.round(
        (running + (incomeByDay.get(p.date) ?? 0) - (expenseByDay.get(p.date) ?? 0)) * 100,
      ) / 100;
      expect(p.total, `drift on ${p.date}`).toBe(running);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 8B — pause, irregular income, windfalls, shortfall fixes
// ---------------------------------------------------------------------------
describe("runProjection — paused buckets and expenses", () => {
  it("a paused bucket is frozen: no refill, no sweep, balance carries", () => {
    const r = runProjection({
      ...baseInput,
      startingBalances: { rent: 400 },
      buckets: buckets.map((b) => (b.id === "rent" ? { ...b, isPaused: true } : b)),
    });
    for (const p of [r.points[0], r.points[r.points.length - 1]]) {
      expect(p.buckets.rent).toBe(400); // untouched all year
    }
    // Rent paused → no fixed allocation at all, so percent buckets work from
    // the full paycheck: fun takes 10% of 3000 = 300; savings gets 2700.
    expect(r.points[0].buckets.fun).toBe(300);
    expect(r.points[0].buckets.save).toBe(2700);
  });

  it("a paused expense doesn't deduct while paused", () => {
    const r = runProjection({
      ...baseInput,
      months: 2,
      expenses: [
        { id: "e1", name: "Gym", amount: 50, bucketId: "fun", dueDate: "2026-01-10", cadence: "monthly", isPaused: true },
      ],
    });
    const jan10 = r.points.find((p) => p.date === "2026-01-10")!;
    expect(jan10.buckets.fun).toBe(200); // untouched
    expect(r.warnings).toHaveLength(0);
  });

  it("penny conservation holds with paused pieces in play", () => {
    const r = runProjection({
      ...baseInput,
      startingBalances: { rent: 400 },
      buckets: buckets.map((b) => (b.id === "rent" ? { ...b, isPaused: true } : b)),
      expenses: [
        { id: "e1", name: "Fun spend", amount: 100, bucketId: "fun", dueDate: "2026-01-10", cadence: "monthly" },
        { id: "e2", name: "Paused", amount: 999, bucketId: "fun", dueDate: "2026-01-11", cadence: "monthly", isPaused: true },
      ],
    });
    // 12 active expense hits; the paused one never fires.
    expect(r.endingTotal).toBe(400 + 3000 * PAYCHECKS - 100 * 12);
  });
});

describe("irregularWeeklyBaseline", () => {
  const entry = (amount: number, receivedDate: string, isWindfall = false): IncomeEntry => ({
    id: `e-${receivedDate}`,
    amount,
    receivedDate,
    isWindfall,
  });

  it("is 85% of the trailing 8-week average", () => {
    // 8 weekly entries of $1,000 in the 56 days before start → avg 1000/wk.
    const entries = Array.from({ length: 8 }, (_, i) =>
      entry(1000, toISO(addDays(parseISO("2026-03-01"), -(7 * i + 1)))),
    );
    expect(irregularWeeklyBaseline(entries, "2026-03-01")).toBe(850);
  });

  it("ignores windfalls and entries outside the window", () => {
    const entries = [
      entry(1000, "2026-02-20"),
      entry(5000, "2026-02-21", true), // windfall — excluded
      entry(9999, "2025-11-01"), // too old — excluded
      entry(9999, "2026-03-05"), // after start — excluded
    ];
    // 1000 over 8 weeks = 125/wk → 85% = 106.25
    expect(irregularWeeklyBaseline(entries, "2026-03-01")).toBe(106.25);
  });

  it("is zero with no history", () => {
    expect(irregularWeeklyBaseline([], "2026-03-01")).toBe(0);
  });
});

describe("runProjection — irregular income mode", () => {
  const irregularJob: IncomeSource = {
    id: "gig",
    name: "Gig work",
    amount: 0,
    frequency: "irregular",
    kind: "paycheck",
    anchorDate: "2026-01-01",
  };
  const history: IncomeEntry[] = Array.from({ length: 8 }, (_, i) => ({
    id: `h${i}`,
    amount: 1000,
    receivedDate: toISO(addDays(parseISO("2026-01-01"), -(7 * i + 1))),
  }));

  it("projects a conservative weekly stream and reports the baseline", () => {
    const r = runProjection({
      startDate: "2026-01-01",
      months: 1,
      incomeSources: [irregularJob],
      buckets,
      expenses: [],
      incomeEntries: history,
    });
    expect(r.irregularWeekly).toBe(850);
    // First projected payday is a week out, then weekly: Jan 8/15/22/29.
    expect(r.points[0].total).toBe(0);
    const jan8 = r.points.find((p) => p.date === "2026-01-08")!;
    expect(jan8.total).toBe(850);
    expect(r.totalIncome).toBe(850 * 4);
    // The waterfall applies normally: rent wants 1000, gets 850 → underfunded.
    expect(r.warnings.some((w) => w.type === "underfunded" && w.bucketId === "rent")).toBe(true);
  });

  it("reports null baseline when income is on a regular schedule", () => {
    expect(runProjection(baseInput).irregularWeekly).toBeNull();
  });
});

describe("runProjection — windfalls", () => {
  const windfall: IncomeEntry = {
    id: "bonus",
    amount: 1000,
    receivedDate: "2026-01-10",
    isWindfall: true,
    allocation: [
      { bucketId: "rent", amount: 200 },
      { bucketId: null, amount: 300 },
    ],
  };

  it("injects on its date, split per allocation, remainder to savings", () => {
    const r = runProjection({
      ...baseInput,
      months: 1,
      incomeEntries: [windfall],
    });
    const jan9 = r.points.find((p) => p.date === "2026-01-09")!;
    const jan10 = r.points.find((p) => p.date === "2026-01-10")!;
    expect(jan10.buckets.rent - jan9.buckets.rent).toBe(200);
    // Savings: 300 explicit + 500 unallocated remainder.
    expect(jan10.buckets.save - jan9.buckets.save).toBe(800);
    expect(r.totalIncome).toBe(3000 * 2 + 1000);
    // Conservation: everything sums.
    expect(r.endingTotal).toBe(3000 * 2 + 1000);
  });

  it("windfalls outside the horizon are ignored", () => {
    const r = runProjection({
      ...baseInput,
      months: 1,
      incomeEntries: [{ ...windfall, receivedDate: "2030-01-01" }],
    });
    expect(r.totalIncome).toBe(3000 * 2);
  });
});

describe("runProjection — shortfall fixes", () => {
  it("computes the smallest per-paycheck amount that prevents the shortfall", () => {
    // Biweekly checks Jan 2/16/30 + Feb 13; $140 short on Feb 20 → 4 paydays
    // land first → $35/paycheck.
    const r = runProjection({
      startDate: "2026-01-01",
      months: 2,
      incomeSources: [
        { id: "j", name: "Job", amount: 2000, frequency: "biweekly", kind: "paycheck", anchorDate: "2026-01-02" },
      ],
      buckets: [
        { id: "bills", name: "Bills", allocationType: "fixed", allocationValue: 100, isSavings: false, priority: 0 },
        { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
      ],
      expenses: [
        { id: "big", name: "Insurance", amount: 240, bucketId: "bills", dueDate: "2026-02-20", cadence: "one_time" },
      ],
    });
    const w = r.warnings.find((x) => x.type === "shortfall") as ShortfallWarning;
    // Bucket resets to 100 each payday; 240 due → 140 short.
    expect(w.amount).toBe(140);
    expect(w.paydaysUntil).toBe(4);
    expect(w.fixPerPaycheck).toBe(35);
  });

  it("rounds the fix up to the cent so it always suffices", () => {
    const r = runProjection({
      startDate: "2026-01-01",
      months: 1,
      incomeSources: [
        { id: "j", name: "Job", amount: 500, frequency: "weekly", kind: "paycheck", anchorDate: "2026-01-05" },
      ],
      buckets: [
        { id: "b", name: "Bills", allocationType: "fixed", allocationValue: 0, isSavings: false, priority: 0 },
        { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
      ],
      expenses: [
        { id: "e", name: "Bill", amount: 100, bucketId: "b", dueDate: "2026-01-20", cadence: "one_time" },
      ],
    });
    const w = r.warnings.find((x) => x.type === "shortfall") as ShortfallWarning;
    expect(w.paydaysUntil).toBe(3); // Jan 5, 12, 19
    expect(w.fixPerPaycheck).toBe(33.34); // 100/3 rounded UP
    expect(w.fixPerPaycheck! * w.paydaysUntil).toBeGreaterThanOrEqual(w.amount);
  });

  it("reports no fix when no paycheck lands in time", () => {
    const r = runProjection({
      startDate: "2026-01-01",
      months: 1,
      incomeSources: [
        { id: "j", name: "Job", amount: 500, frequency: "monthly", kind: "paycheck", anchorDate: "2026-01-25" },
      ],
      buckets: [
        { id: "b", name: "Bills", allocationType: "fixed", allocationValue: 0, isSavings: false, priority: 0 },
        { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
      ],
      expenses: [
        { id: "e", name: "Bill", amount: 100, bucketId: "b", dueDate: "2026-01-10", cadence: "one_time" },
      ],
    });
    const w = r.warnings.find((x) => x.type === "shortfall") as ShortfallWarning;
    expect(w.paydaysUntil).toBe(0);
    expect(w.fixPerPaycheck).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Interest (APY) — carried over from v1.0
// ---------------------------------------------------------------------------
describe("runProjection — interest", () => {
  const savingsOnly: Bucket[] = [
    { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true, apy: 3 },
  ];

  it("compounds a lone starting balance by roughly its APY over a year", () => {
    const r = runProjection({
      startDate: "2026-01-01",
      months: 12,
      startingBalances: { save: 10000 },
      incomeSources: [],
      buckets: savingsOnly,
      expenses: [],
    });
    expect(r.endingSavings).toBeGreaterThan(10290);
    expect(r.endingSavings).toBeLessThan(10310);
    expect(r.totalInterest).toBeCloseTo(r.endingSavings - 10000, 2);
  });

  it("zero APY leaves the projection exactly as before", () => {
    const withZero = runProjection({
      ...baseInput,
      buckets: buckets.map((b) => ({ ...b, apy: 0 })),
    });
    const without = runProjection(baseInput);
    expect(withZero.points).toEqual(without.points);
  });

  it("does not accrue interest on negative balances", () => {
    const r = runProjection({
      startDate: "2026-01-01",
      months: 12,
      startingBalances: { save: -1000 },
      incomeSources: [],
      buckets: savingsOnly,
      expenses: [],
    });
    expect(r.endingSavings).toBe(-1000);
  });
});

// ---------------------------------------------------------------------------
// No savings bucket — leftovers pool in "unallocated"
// ---------------------------------------------------------------------------
describe("runProjection — no savings bucket", () => {
  it("sweeps and remainders go to the unallocated pool; money is conserved", () => {
    const r = runProjection({
      ...baseInput,
      buckets: buckets.filter((b) => !b.isSavings),
    });
    expect(r.endingTotal).toBe(3000 * PAYCHECKS);
    expect(r.endingSavings).toBe(1800 * PAYCHECKS + 1200 * (PAYCHECKS - 1));
  });
});

// ---------------------------------------------------------------------------
// What-if (rule 8: deducts from savings, second comparison timeline)
// ---------------------------------------------------------------------------
describe("evaluateWhatIf", () => {
  it("deducts from savings on the chosen date — even if a bucket was suggested", () => {
    const { baseline, withPurchase } = evaluateWhatIf(baseInput, {
      id: "w",
      name: "New phone",
      amount: 900,
      targetDate: "2026-03-05",
      bucketId: "rent", // must be ignored; what-ifs always hit savings
    });
    const day = withPurchase.points.find((p) => p.date === "2026-03-05")!;
    const dayBase = baseline.points.find((p) => p.date === "2026-03-05")!;
    expect(day.buckets.rent).toBe(dayBase.buckets.rent); // rent untouched
    expect(day.savings).toBe(dayBase.savings - 900);
    expect(withPurchase.endingTotal).toBe(baseline.endingTotal - 900);
  });

  it("reports a sensible setback and flags purchases that overdraw", () => {
    const realistic: ProjectionInput = {
      ...baseInput,
      expenses: [
        { id: "rentbill", name: "Rent", amount: 1000, bucketId: "rent", dueDate: "2026-01-20", cadence: "monthly" },
        { id: "funspend", name: "Fun", amount: 150, bucketId: "fun", dueDate: "2026-01-20", cadence: "monthly" },
      ],
    };
    const { verdict } = evaluateWhatIf(realistic, {
      id: "w1",
      name: "New laptop",
      amount: 1700,
      targetDate: "2026-03-01",
      bucketId: null,
    });
    expect(verdict.endingWith).toBeCloseTo(verdict.endingWithout - 1700, 2);
    expect(verdict.setbackDays).toBeGreaterThan(15);
    expect(verdict.setbackDays).toBeLessThan(60);
    expect(verdict.causesNegative).toBe(false);

    const { verdict: reckless } = evaluateWhatIf(realistic, {
      id: "w2",
      name: "Reckless splurge",
      amount: 50000,
      targetDate: "2026-02-01",
      bucketId: null,
    });
    expect(reckless.causesNegative).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// splitPaycheck — the Budget pie's math (same waterfall, one check)
// ---------------------------------------------------------------------------
describe("splitPaycheck", () => {
  it("mirrors the waterfall: fixed, percent of remainder, leftover to savings", () => {
    const slices = splitPaycheck(buckets, 3000);
    expect(slices).toEqual([
      { bucketId: "rent", name: "Rent", amount: 1000, percent: 33.3 },
      { bucketId: "fun", name: "Fun money", amount: 200, percent: 6.7 },
      { bucketId: "save", name: "Savings", amount: 1800, percent: 60 },
    ]);
    // Slices always account for the entire check.
    expect(slices.reduce((s, x) => s + x.amount, 0)).toBe(3000);
  });

  it("matches what the projection actually allocates on a payday", () => {
    const r = runProjection(baseInput);
    const slices = splitPaycheck(buckets, 3000);
    const byId = Object.fromEntries(slices.map((s) => [s.bucketId, s.amount]));
    expect(r.points[0].buckets.rent).toBe(byId.rent);
    expect(r.points[0].buckets.fun).toBe(byId.fun);
    expect(r.points[0].buckets.save).toBe(byId.save);
  });

  it("paused buckets sit out and their share flows onward", () => {
    const slices = splitPaycheck(
      buckets.map((b) => (b.id === "rent" ? { ...b, isPaused: true } : b)),
      3000,
    );
    expect(slices.find((s) => s.bucketId === "rent")).toBeUndefined();
    expect(slices.find((s) => s.bucketId === "fun")!.amount).toBe(300); // 10% of full 3000
    expect(slices.find((s) => s.bucketId === "save")!.amount).toBe(2700);
  });

  it("a small check funds by priority and produces no zero or savings slice", () => {
    const slices = splitPaycheck(
      [
        { id: "a", name: "A", allocationType: "fixed", allocationValue: 400, isSavings: false, priority: 0 },
        { id: "b", name: "B", allocationType: "fixed", allocationValue: 300, isSavings: false, priority: 1 },
        { id: "save", name: "Savings", allocationType: "fixed", allocationValue: 0, isSavings: true },
      ],
      500,
    );
    expect(slices).toEqual([
      { bucketId: "a", name: "A", amount: 400, percent: 80 },
      { bucketId: "b", name: "B", amount: 100, percent: 20 },
    ]);
  });

  it("returns nothing for a zero paycheck", () => {
    expect(splitPaycheck(buckets, 0)).toEqual([]);
  });
});

describe("labelSetback", () => {
  it("formats day counts into friendly text", () => {
    expect(labelSetback(0)).toBe("no measurable setback");
    expect(labelSetback(1)).toBe("1 day");
    expect(labelSetback(21)).toBe("3 weeks");
    expect(labelSetback(90)).toBe("about 3 months");
  });
});
