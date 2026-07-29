import { describe, expect, it } from "vitest";
import { debtProgress } from "./debtMilestones";
import { nwForecast } from "./nwForecast";

describe("debtProgress", () => {
  const snaps = [
    { total_liabilities: 18_000 },
    { total_liabilities: 24_000 }, // the peak
    { total_liabilities: 20_000 },
  ];

  it("measures paid % from peak and names the next milestone", () => {
    const p = debtProgress(snaps, 15_000)!;
    expect(p.peak).toBe(24_000);
    expect(p.paidPct).toBe(38); // (24000-15000)/24000
    expect(p.crossed).toEqual([25]);
    expect(p.nextMilestonePct).toBe(50);
    expect(p.nextMilestoneBalance).toBe(12_000);
  });

  it("debt-free crosses everything", () => {
    const p = debtProgress(snaps, 0)!;
    expect(p.paidPct).toBe(100);
    expect(p.nextMilestonePct).toBeNull();
  });

  it("null when there was never any debt", () => {
    expect(debtProgress([], 0)).toBeNull();
  });

  it("current above all snapshots becomes the peak (0% paid)", () => {
    const p = debtProgress(snaps, 30_000)!;
    expect(p.peak).toBe(30_000);
    expect(p.paidPct).toBe(0);
  });
});

describe("nwForecast", () => {
  const mk = (pairs: [string, number][]) =>
    pairs.map(([snapshot_date, net_worth]) => ({ snapshot_date, net_worth }));

  it("linear climb crosses the next milestones on schedule", () => {
    // +$100/day from -$2,000: crosses $0 in 20 days, $1k in 30.
    const f = nwForecast(
      mk([
        ["2026-06-01", -8000],
        ["2026-07-01", -5000],
        ["2026-07-31", -2000],
      ]),
      "2026-07-31",
    )!;
    expect(f.slopePerDay).toBe(100);
    expect(f.flatOrFalling).toBe(false);
    expect(f.crossings[0].amount).toBe(0);
    expect(f.crossings[0].date).toBe("2026-08-20");
    expect(f.crossings[1].amount).toBe(1000);
  });

  it("flat or falling pace refuses to invent dates", () => {
    const f = nwForecast(
      mk([
        ["2026-06-01", 5000],
        ["2026-07-01", 4800],
        ["2026-07-31", 4600],
      ]),
      "2026-07-31",
    )!;
    expect(f.flatOrFalling).toBe(true);
    expect(f.crossings).toEqual([]);
  });

  it("needs 3+ snapshots across 3+ weeks", () => {
    expect(nwForecast(mk([["2026-07-01", 100], ["2026-07-31", 200]]), "2026-07-31")).toBeNull();
    expect(
      nwForecast(
        mk([
          ["2026-07-25", 100],
          ["2026-07-28", 150],
          ["2026-07-31", 200],
        ]),
        "2026-07-31",
      ),
    ).toBeNull();
  });
});
