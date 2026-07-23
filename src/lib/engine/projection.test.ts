import { describe, it, expect } from "vitest";
import { addDays, addMonths, diffDays, parseISO, toISO } from "./dates";
import {
  generateOccurrences,
  generatePayDates,
  runProjection,
  evaluateWhatIf,
  labelSetback,
} from "./projection";
import type { Bucket, IncomeSource, ProjectionInput } from "./types";

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

  it("an unaffordable expense sends the bucket negative and names month + amount", () => {
    const r = runProjection({
      ...baseInput,
      months: 2,
      expenses: [
        { id: "big", name: "Surprise bill", amount: 1600, bucketId: "rent", dueDate: "2026-01-05", cadence: "one_time" },
      ],
    });
    const jan5 = r.points.find((p) => p.date === "2026-01-05")!;
    expect(jan5.buckets.rent).toBe(-600);

    const w = r.warnings.filter((x) => x.type === "shortfall");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      type: "shortfall",
      bucketId: "rent",
      month: "January 2026",
      amount: 600,
    });
    // Next payday the negative bucket sweeps into savings and refills cleanly.
    const feb1 = r.points.find((p) => p.date === "2026-02-01")!;
    expect(feb1.buckets.rent).toBe(1000);
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

describe("labelSetback", () => {
  it("formats day counts into friendly text", () => {
    expect(labelSetback(0)).toBe("no measurable setback");
    expect(labelSetback(1)).toBe("1 day");
    expect(labelSetback(21)).toBe("3 weeks");
    expect(labelSetback(90)).toBe("about 3 months");
  });
});
