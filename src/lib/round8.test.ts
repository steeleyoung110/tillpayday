import { describe, expect, it } from "vitest";
import { billTerrain } from "./billTerrain";
import { healthScore } from "./healthScore";
import { roundNumberBias, savingsVelocity } from "./loggingQuality";
import { spendTiming } from "./spendTiming";
import type { Expense, IncomeSource } from "@/lib/engine";

const TODAY = "2026-07-29";

describe("healthScore", () => {
  it("full marks across the board", () => {
    const h = healthScore({
      runwayDays: 90,
      efundPct: 100,
      savingsRatePct: 25,
      cyclesKept: 4,
      cyclesTotal: 4,
      debtNow: 0,
      debtPeak: null,
    });
    expect(h.score).toBe(100);
    expect(h.grade).toBe("A");
  });
  it("scales components and names the weakest", () => {
    const h = healthScore({
      runwayDays: 30, // 10
      efundPct: 50, // 10
      savingsRatePct: 10, // 10
      cyclesKept: 1, // of 4 → 5
      cyclesTotal: 4,
      debtNow: 12000,
      debtPeak: 24000, // 5 + 7.5 → 13
    });
    expect(h.score).toBe(48);
    expect(h.grade).toBe("D");
    expect(h.weakest.key).toBe("adherence");
  });
  it("unknowns score zero, debt not shrinking scores 5", () => {
    const h = healthScore({
      runwayDays: null,
      efundPct: null,
      savingsRatePct: null,
      cyclesKept: 0,
      cyclesTotal: 0,
      debtNow: 5000,
      debtPeak: 5000,
    });
    expect(h.score).toBe(5);
    expect(h.grade).toBe("F");
  });
});

describe("spendTiming", () => {
  const income: IncomeSource[] = [
    { id: "i", name: "Job", amount: 1000, frequency: "biweekly", kind: "paycheck", anchorDate: "2026-07-24" },
  ];
  const spend = (amount: number, due_date: string) => ({ amount, due_date, cadence: "one_time" });
  it("measures the first-72h share and the heaviest weekday", () => {
    // Paydays: 7/10, 7/24. Spends: 3 inside 72h of a payday, 2 later.
    const t = spendTiming(
      income,
      [
        spend(50, "2026-07-10"), // payday Friday, offset 0
        spend(30, "2026-07-11"), // offset 1 (Saturday)
        spend(25, "2026-07-25"), // offset 1 (Saturday)
        spend(10, "2026-07-20"), // offset 10
        spend(15, "2026-07-06"), // offset 10 from 6/26 lattice
      ],
      TODAY,
    )!;
    expect(t.total).toBe(130);
    expect(t.first72Total).toBe(105);
    expect(t.first72Pct).toBe(81);
    expect(t.heaviestWeekday).toBe(6); // the two Saturdays: $55
    expect(t.spendCount).toBe(5);
  });
  it("needs 5+ spends and a payday lattice", () => {
    expect(spendTiming(income, [spend(10, "2026-07-20")], TODAY)).toBeNull();
    expect(
      spendTiming([], Array.from({ length: 6 }, (_, i) => spend(10, `2026-07-1${i}`)), TODAY),
    ).toBeNull();
  });
});

describe("billTerrain", () => {
  const bill = (name: string, amount: number, dueDate: string, cadence: Expense["cadence"]): Expense =>
    ({ id: name, name, amount, bucketId: null, dueDate, cadence }) as Expense;
  it("finds the mountain month and its lumpy causes", () => {
    const t = billTerrain(
      [
        bill("Rent", 900, "2026-01-01", "monthly"),
        bill("Insurance", 600, "2026-03-15", "quarterly"), // Mar Jun Sep Dec
        bill("Amazon Prime", 139, "2026-12-05", "yearly"),
      ],
      TODAY,
    )!;
    const dec = t.months.find((m) => m.key === "2026-12")!;
    expect(dec.total).toBe(900 + 600 + 139);
    expect(t.heaviest.key).toBe("2026-12");
    expect(dec.lumpy.map((l) => l.name)).toEqual(["Insurance", "Amazon Prime"]);
    expect(t.lightest.total).toBe(900);
    expect(t.months).toHaveLength(12);
  });
  it("null with no recurring bills", () => {
    expect(billTerrain([bill("One-off", 50, "2026-08-01", "one_time")], TODAY)).toBeNull();
  });
});

describe("roundNumberBias", () => {
  const spend = (amount: number, i: number) => ({
    amount, cadence: "one_time", due_date: `2026-07-${String((i % 20) + 1).padStart(2, "0")}`,
  });
  it("flags estimate-heavy logging", () => {
    const rows = Array.from({ length: 10 }, (_, i) => spend(i < 7 ? 10 : 9.37, i));
    const b = roundNumberBias(rows, TODAY)!;
    expect(b.pct).toBe(70);
    expect(b.suspicious).toBe(true);
  });
  it("receipt-grade logging passes; small samples are ignored", () => {
    const rows = Array.from({ length: 12 }, (_, i) => spend(9.37 + i, i));
    expect(roundNumberBias(rows, TODAY)!.suspicious).toBe(false);
    expect(roundNumberBias(rows.slice(0, 5), TODAY)).toBeNull();
  });
});

describe("savingsVelocity", () => {
  it("averages kept-per-cycle and projects the next $1k", () => {
    const v = savingsVelocity([
      { paycheckTotal: 1500, totalActual: 1300 }, // kept 200
      { paycheckTotal: 1500, totalActual: 1250 }, // kept 250
      { paycheckTotal: 1500, totalActual: 1350 }, // kept 150
    ])!;
    expect(v.keptPerCycle).toBe(200);
    expect(v.cyclesToNextThousand).toBe(5);
  });
  it("overspending pace can't reach the next $1k", () => {
    const v = savingsVelocity([
      { paycheckTotal: 1500, totalActual: 1600 },
      { paycheckTotal: 1500, totalActual: 1700 },
    ])!;
    expect(v.cyclesToNextThousand).toBeNull();
  });
  it("needs 2+ completed cycles", () => {
    expect(savingsVelocity([{ paycheckTotal: 1500, totalActual: 100 }])).toBeNull();
  });
});
