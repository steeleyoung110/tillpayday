import { describe, expect, it } from "vitest";
import { computeTotals, filterHorizon, snapshotDeltas } from "./netWorth";

describe("computeTotals", () => {
  const assets = [
    { current_value: "1000.00", is_archived: false },
    { current_value: 250.5, is_archived: false },
    { current_value: 99999, is_archived: true }, // sold the car — history only
  ];
  const liabilities = [
    { current_balance: "400.25", is_archived: false },
    { current_balance: 5000, is_archived: true }, // paid off — history only
  ];

  it("sums active items and subtracts debts", () => {
    const t = computeTotals(assets, liabilities);
    expect(t.totalAssets).toBe(1250.5);
    expect(t.totalLiabilities).toBe(400.25);
    expect(t.netWorth).toBe(850.25);
  });

  it("archived items are excluded from totals but not deleted", () => {
    const withoutArchived = computeTotals(
      assets.filter((a) => !a.is_archived),
      liabilities.filter((l) => !l.is_archived),
    );
    expect(computeTotals(assets, liabilities)).toEqual(withoutArchived);
  });

  it("the budget bridge adds as an asset when enabled, never negative", () => {
    expect(computeTotals(assets, liabilities, 2000).totalAssets).toBe(3250.5);
    expect(computeTotals(assets, liabilities, 2000).netWorth).toBe(2850.25);
    // An overdrawn budget savings never *reduces* net worth via the bridge.
    expect(computeTotals(assets, liabilities, -500).totalAssets).toBe(1250.5);
    expect(computeTotals(assets, liabilities, 0)).toEqual(
      computeTotals(assets, liabilities),
    );
  });
});

describe("filterHorizon", () => {
  const snaps = [
    { snapshot_date: "2025-01-15", net_worth: 100 },
    { snapshot_date: "2026-01-20", net_worth: 500 },
    { snapshot_date: "2026-06-01", net_worth: 800 },
    { snapshot_date: "2026-07-20", net_worth: 900 },
  ];

  it("keeps only snapshots inside the window, oldest first", () => {
    const out = filterHorizon(snaps, 3, "2026-07-23");
    expect(out.map((s) => s.snapshot_date)).toEqual(["2026-06-01", "2026-07-20"]);
    expect(filterHorizon(snaps, 12, "2026-07-23")).toHaveLength(3);
    expect(filterHorizon(snaps, 24, "2026-07-23")).toHaveLength(4);
  });
});

describe("snapshotDeltas", () => {
  it("reports change since ~a month ago and since the very start", () => {
    const d = snapshotDeltas(
      [
        { snapshot_date: "2026-01-05", net_worth: "1000" },
        { snapshot_date: "2026-06-20", net_worth: 3800 },
        { snapshot_date: "2026-07-22", net_worth: 4200 },
      ],
      "2026-07-23",
    );
    expect(d.sinceStart).toBe(3200); // up $3,200 since January
    expect(d.startDate).toBe("2026-01-05");
    expect(d.sinceLastMonth).toBe(400); // vs Jun 20, the ref ≥ a month back
  });

  it("handles going down without drama — it's just a number", () => {
    const d = snapshotDeltas(
      [
        { snapshot_date: "2026-05-01", net_worth: 5000 },
        { snapshot_date: "2026-07-01", net_worth: 4400 },
      ],
      "2026-07-23",
    );
    expect(d.sinceStart).toBe(-600);
  });

  it("needs at least two snapshots to say anything", () => {
    expect(snapshotDeltas([{ snapshot_date: "2026-07-01", net_worth: 1 }], "2026-07-23"))
      .toEqual({ sinceLastMonth: null, sinceStart: null, startDate: null });
  });
});
