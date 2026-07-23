import { describe, expect, it } from "vitest";
import { goalOutlook, type SavingsPoint } from "./goals";

/** Savings growing $500/month, daily points for two years from Jul 23 2026. */
function linearPoints(startSavings: number, perMonth: number): SavingsPoint[] {
  const out: SavingsPoint[] = [];
  const t0 = Date.UTC(2026, 6, 23);
  for (let d = 0; d <= 730; d += 1) {
    out.push({
      date: new Date(t0 + d * 86_400_000).toISOString().slice(0, 10),
      savings: startSavings + (perMonth * d) / 30.44,
    });
  }
  return out;
}

const TODAY = "2026-07-23";

describe("goalOutlook", () => {
  it("the user's exact story: ~10 months away, +$100/month makes it sooner", () => {
    // $0 saved, $500/month pace, $5,000 goal → 10 months.
    const points = linearPoints(0, 500);
    const o = goalOutlook(points, { targetAmount: 5000, targetDate: "2027-12-31" }, TODAY);
    expect(o.monthsAway).toBe(10);
    expect(o.onTrack).toBe(true);
    // With $100 more each month ($600 pace) → ~8.3 months.
    expect(o.boostedMonthsAway).toBeLessThan(o.monthsAway!);
    expect(o.boostedMonthsAway).toBe(8);
    expect(o.requiredExtraPerMonth).toBe(0); // already beats the date
  });

  it("behind the date: computes the exact extra that hits it on time", () => {
    // $500/month pace, $10,000 goal wanted in ~12 months → pace alone gives
    // 6,000 by then; needs about $334/month more.
    const points = linearPoints(0, 500);
    const o = goalOutlook(points, { targetAmount: 10000, targetDate: "2027-07-23" }, TODAY);
    expect(o.onTrack).toBe(false);
    expect(o.requiredExtraPerMonth).toBeGreaterThanOrEqual(330);
    expect(o.requiredExtraPerMonth).toBeLessThanOrEqual(340);
    // Sanity: pace + required extra reaches the target by the date.
    const boosted = goalOutlook(points, { targetAmount: 10000, targetDate: "2027-07-23" }, TODAY, o.requiredExtraPerMonth!);
    expect(boosted.boostedReachDate! <= "2027-07-23").toBe(true);
  });

  it("already there: achievedNow, zero extra needed", () => {
    const points = linearPoints(12000, 500);
    const o = goalOutlook(points, { targetAmount: 10000, targetDate: "2027-01-01" }, TODAY);
    expect(o.achievedNow).toBe(true);
    expect(o.monthsAway).toBe(0);
    expect(o.onTrack).toBe(true);
    expect(o.requiredExtraPerMonth).toBe(0);
  });

  it("out of reach within the horizon: honest nulls, not fake dates", () => {
    const points = linearPoints(0, 100); // $100/month for 2 years = $2,400
    const o = goalOutlook(points, { targetAmount: 50000, targetDate: "2027-01-01" }, TODAY);
    expect(o.reachDate).toBeNull();
    expect(o.monthsAway).toBeNull();
    expect(o.onTrack).toBe(false);
  });

  it("a savings line that never grows still respects the boost math", () => {
    const points = linearPoints(1000, 0);
    const o = goalOutlook(points, { targetAmount: 2200, targetDate: "2028-07-01" }, TODAY, 100);
    expect(o.reachDate).toBeNull(); // flat line never crosses
    expect(o.boostedMonthsAway).toBe(12); // 1000 + 100/mo → 2200 in 12 months
  });
});
