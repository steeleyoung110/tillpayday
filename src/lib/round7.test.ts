import { describe, expect, it } from "vitest";
import { anniversaryWindow } from "./anniversary";
import { checkHistory } from "./checkHistory";
import { findDuplicateSpends } from "./dupes";
import { earmarkGoals } from "./earmark";
import { lazyMoney } from "./lazyMoney";
import { personalInflation } from "./personalInflation";
import type { IncomeEntry } from "@/lib/engine";

const TODAY = "2026-07-29";

describe("personalInflation", () => {
  const spend = (name: string, amount: number, due_date: string) => ({
    name, amount, due_date, cadence: "one_time",
  });
  it("repeat merchants: early third vs late third", () => {
    const r = personalInflation(
      [
        spend("Kroger #1", 80, "2026-02-01"),
        spend("Kroger #2", 84, "2026-04-01"),
        spend("Kroger #3", 92, "2026-07-01"),
      ],
      [],
      TODAY,
    )!;
    expect(r.rows[0].kind).toBe("merchant");
    expect(r.rows[0].early).toBe(80);
    expect(r.rows[0].late).toBe(92);
    expect(r.rows[0].pct).toBe(15);
    expect(r.overallPct).toBe(15);
  });
  it("bill creep folds in; tiny moves are ignored; null when nothing moves", () => {
    const r = personalInflation([], [{ name: "Netflix", first: 13.99, last: 15.49 }], TODAY)!;
    expect(r.rows[0]).toMatchObject({ kind: "bill", pct: 11 });
    expect(personalInflation([], [{ name: "Rent", first: 900, last: 905 }], TODAY)).toBeNull();
  });
  it("needs 3+ purchases spanning 60+ days", () => {
    expect(
      personalInflation(
        [spend("A", 10, "2026-07-01"), spend("A", 20, "2026-07-10"), spend("A", 30, "2026-07-20")],
        [],
        TODAY,
      ),
    ).toBeNull();
  });
});

describe("checkHistory", () => {
  const entry = (amount: number, receivedDate: string, isWindfall = false): IncomeEntry =>
    ({ id: receivedDate, amount, receivedDate, isWindfall }) as IncomeEntry;
  it("computes average and a downward trend in $/month", () => {
    const h = checkHistory([
      entry(1500, "2026-03-06"), entry(1500, "2026-03-20"),
      entry(1480, "2026-04-03"), entry(1460, "2026-04-17"),
      entry(1420, "2026-05-01"), entry(1400, "2026-05-15"),
    ])!;
    expect(h.checks).toHaveLength(6);
    expect(h.average).toBeCloseTo(1460, 0);
    expect(h.trendPerMonth).toBeLessThan(0);
    expect(h.min).toBe(1400);
    expect(h.max).toBe(1500);
  });
  it("windfalls excluded; needs 4+ checks; flat is null trend", () => {
    expect(checkHistory([entry(1500, "2026-05-01"), entry(9000, "2026-05-02", true)])).toBeNull();
    const flat = checkHistory([
      entry(1500, "2026-03-06"), entry(1501, "2026-03-20"),
      entry(1499, "2026-05-01"), entry(1500, "2026-05-15"),
    ])!;
    expect(flat.trendPerMonth).toBeNull();
  });
});

describe("findDuplicateSpends", () => {
  const row = (id: string, name: string, amount: number, due: string, created: string) => ({
    id, name, amount, due_date: due, cadence: "one_time", created_at: created,
  });
  it("flags the later-created twin only", () => {
    const d = findDuplicateSpends([
      row("a", "McDonald's", 12.5, "2026-07-28", "2026-07-28T10:00:00Z"),
      row("b", "MCDONALDS", 12.5, "2026-07-28", "2026-07-28T10:05:00Z"),
      row("c", "McDonald's", 12.5, "2026-07-27", "2026-07-27T10:00:00Z"), // different day
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].id).toBe("b");
  });
  it("different amounts are not dupes", () => {
    expect(
      findDuplicateSpends([
        row("a", "Coffee", 6, "2026-07-28", "2026-07-28T10:00:00Z"),
        row("b", "Coffee", 6.5, "2026-07-28", "2026-07-28T10:05:00Z"),
      ]),
    ).toHaveLength(0);
  });
});

describe("earmarkGoals", () => {
  const goals = [
    { id: "trip", target_amount: 1200, target_date: "2026-12-01" },
    { id: "efund", target_amount: 1000, target_date: "2026-09-01" },
    { id: "car", target_amount: 5000, target_date: "2027-06-01" },
  ];
  it("fills soonest-first, no double counting", () => {
    const m = earmarkGoals(1410, goals);
    expect(m.get("efund")).toMatchObject({ earmarked: 1000, pct: 100, fullyCovered: true });
    expect(m.get("trip")).toMatchObject({ earmarked: 410, pct: 34, fullyCovered: false });
    expect(m.get("car")).toMatchObject({ earmarked: 0, pct: 0 });
  });
  it("negative savings earmarks nothing", () => {
    const m = earmarkGoals(-50, goals);
    expect(m.get("efund")!.earmarked).toBe(0);
  });
});

describe("lazyMoney", () => {
  const bucket = (id: string, name: string, is_savings: boolean, rolls_over: boolean, apy: number) => ({
    id, name, is_savings, rolls_over, apy, is_paused: false,
  });
  it("flags low-APY savings with the missed dollars", () => {
    const rows = lazyMoney(
      [bucket("sv", "Savings", true, false, 0.02), bucket("fun", "Fun", false, false, 0)],
      { "": 3200, fun: 250 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].earnsYearly).toBe(0.64);
    expect(rows[0].atReferenceYearly).toBe(128);
    expect(rows[0].missedYearly).toBe(127.36);
  });
  it("respects min balance and skips already-decent APY", () => {
    expect(lazyMoney([bucket("sv", "S", true, false, 0)], { "": 300 })).toHaveLength(0);
    expect(lazyMoney([bucket("sv", "S", true, false, 3.8)], { "": 5000 })).toHaveLength(0);
  });
});

describe("anniversaryWindow", () => {
  it("shows within 14 days after a milestone crossing", () => {
    // Signup 3 months + 3 days ago → the 3-month window is open.
    const signup = new Date(Date.parse(TODAY) - Math.round((3 * 30.44 + 3) * 86400000))
      .toISOString().slice(0, 10);
    const w = anniversaryWindow(signup, TODAY)!;
    expect(w.months).toBe(3);
  });
  it("closed between milestones and before the first", () => {
    const signup4mo = new Date(Date.parse(TODAY) - Math.round(4.5 * 30.44 * 86400000))
      .toISOString().slice(0, 10);
    expect(anniversaryWindow(signup4mo, TODAY)).toBeNull();
    const signupNew = new Date(Date.parse(TODAY) - 20 * 86400000).toISOString().slice(0, 10);
    expect(anniversaryWindow(signupNew, TODAY)).toBeNull();
  });
});
