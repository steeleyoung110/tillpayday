import { describe, expect, it } from "vitest";
import type { StocksRaw } from "./rows";
import {
  buildStocks,
  changePct,
  cleanHistory,
  closeAt,
  dividendMonths,
  dividendPlans,
  makeHolding,
  mergeHoldings,
  paymentsPerYear,
  pieSlices,
  prevCloseAt,
  priceIndex,
  projectPayments,
  stocksSummary,
  OTHER_COLOR,
  SERIES_COLORS,
} from "./view";

const prices = priceIndex([
  { symbol: "KO", day: "2026-10-09", close: 88, prev_close: null },
  { symbol: "KO", day: "2026-11-04", close: 95, prev_close: null },
  { symbol: "KO", day: "2026-11-10", close: 96, prev_close: null },
  { symbol: "KO", day: "2026-11-11", close: 98, prev_close: 96.5 },
  { symbol: "NEW", day: "2026-11-11", close: 10, prev_close: null },
]);

describe("prices", () => {
  it("takes the close on or before a day, else the first one known", () => {
    expect(closeAt(prices, "KO", "2026-11-05")).toBe(95);
    expect(closeAt(prices, "KO", "2026-10-01")).toBe(88);
    expect(closeAt(prices, "NOPE", "2026-11-11")).toBeNull();
  });
  it("uses the stored previous close for the day's move, else the prior row", () => {
    expect(prevCloseAt(prices, "KO", "2026-11-11")).toBe(96.5);
    expect(prevCloseAt(prices, "KO", "2026-11-10")).toBe(95);
    expect(prevCloseAt(prices, "NEW", "2026-11-11")).toBeNull();
  });
});

describe("holdings", () => {
  it("measures day, week and month moves on the shares held now", () => {
    const h = makeHolding("KO", 2, 70, prices, "2026-11-11");
    expect(h.value).toBe(196);
    expect(h.cost).toBe(140);
    expect(h.changes.day.amount).toBeCloseTo(3); // 2 × (98 − 96.5)
    expect(h.changes.week.amount).toBeCloseTo(6); // vs 11/04 close 95
    expect(h.changes.month.amount).toBeCloseTo(20); // vs 10/09 close 88 (latest on/before 10/11)
    expect(changePct(h.changes.month)).toBeCloseTo(20 / 176);
  });
  it("a stock with no history yet shows no move", () => {
    const h = makeHolding("NEW", 5, null, prices, "2026-11-11");
    expect(h.changes.day).toEqual({ amount: 0, base: 0 });
    expect(h.changes.week.amount).toBe(0);
    expect(changePct(h.changes.day)).toBeNull();
  });
  it("merges the same stock across accounts", () => {
    const a = makeHolding("KO", 2, 70, prices, "2026-11-11");
    const b = makeHolding("KO", 1, null, prices, "2026-11-11");
    const [m] = mergeHoldings([[a], [b]]);
    expect(m.shares).toBe(3);
    expect(m.value).toBe(294);
    expect(m.cost).toBeNull();
    expect(m.changes.day.amount).toBeCloseTo(4.5);
  });
});

describe("pie", () => {
  it("keeps the eight biggest and folds the rest into Other", () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ label: `S${i}`, value: 100 - i }));
    const s = pieSlices(items);
    expect(s).toHaveLength(9);
    expect(s[0]).toMatchObject({ label: "S0", color: SERIES_COLORS[0] });
    expect(s[8]).toMatchObject({ label: "Other (3)", value: 92 + 91 + 90, color: OTHER_COLOR });
    expect(s.reduce((t, x) => t + x.share, 0)).toBeCloseTo(1);
  });
  it("drops empty slices and handles nothing at all", () => {
    expect(pieSlices([{ label: "A", value: 0 }])).toEqual([]);
    expect(pieSlices([{ label: "A", value: 5 }])[0].share).toBe(1);
  });
});

describe("dividends", () => {
  it("reads Robinhood's frequency words", () => {
    expect(paymentsPerYear("Monthly")).toBe(12);
    expect(paymentsPerYear("quarterly")).toBe(4);
    expect(paymentsPerYear("Semi-Annual")).toBe(2);
    expect(paymentsPerYear("Annual")).toBe(1);
    expect(paymentsPerYear(null)).toBe(0);
  });

  const info = [
    { symbol: "O", pay_date: "2026-10-15", ex_date: "2026-10-01", per_share: 0.27, frequency: "monthly", yield_pct: 5.4 },
    { symbol: "O", pay_date: "2026-11-13", ex_date: "2026-10-30", per_share: 0.2715, frequency: "monthly", yield_pct: 5.4 },
    { symbol: "VYM", pay_date: "2026-09-22", ex_date: null, per_share: 0.8869, frequency: "quarterly", yield_pct: 2.4 },
    { symbol: "AMD", pay_date: "1995-05-24", ex_date: null, per_share: 0.01, frequency: null, yield_pct: null },
    { symbol: "OLD", pay_date: "2024-01-01", ex_date: null, per_share: 1, frequency: "quarterly", yield_pct: null },
  ];

  it("plans only stocks that still pay", () => {
    const plans = dividendPlans(info, "2026-11-11");
    expect([...plans.keys()].sort()).toEqual(["O", "VYM"]);
    expect(plans.get("O")).toMatchObject({ perShare: 0.2715, ppy: 12, lastPay: "2026-11-13" });
    expect(plans.get("O")!.declared).toEqual([{ payDate: "2026-11-13", perShare: 0.2715 }]);
  });

  it("projects announced payments first, then the usual rhythm", () => {
    const plans = dividendPlans(info, "2026-11-11");
    const o = projectPayments(plans.get("O")!, 10, "robinhood", "2026-11-11", "2027-02-28");
    expect(o.map((p) => [p.payDate, p.declared])).toEqual([
      ["2026-11-13", true],
      ["2026-12-13", false],
      ["2027-01-13", false],
      ["2027-02-13", false],
    ]);
    expect(o[0].amount).toBe(2.72);
    // VYM last paid 9/22: next ones are 12/22 and 3/22.
    const v = projectPayments(plans.get("VYM")!, 4, "robinhood", "2026-11-11", "2027-04-30");
    expect(v.map((p) => p.payDate)).toEqual(["2026-12-22", "2027-03-22"]);
    expect(projectPayments(plans.get("VYM")!, 0, "x", "2026-11-11", "2027-12-31")).toEqual([]);
  });

  it("prefers an imported payout over the sync's estimate of the same one", () => {
    const rows = cleanHistory([
      { accountKey: "robinhood", symbol: "T", payDate: "2026-11-02", amount: 4.17, source: "estimated" },
      { accountKey: "robinhood", symbol: "T", payDate: "2026-11-03", amount: 4.12, source: "csv" },
      { accountKey: "agentic", symbol: "T", payDate: "2026-11-02", amount: 0.5, source: "estimated" },
      { accountKey: "robinhood", symbol: "VZ", payDate: "2026-08-01", amount: 1.4, source: "csv" },
    ]);
    expect(rows.map((r) => `${r.accountKey}:${r.symbol}:${r.source}`)).toEqual([
      "robinhood:T:csv",
      "agentic:T:estimated",
      "robinhood:VZ:csv",
    ]);
  });

  it("buckets paid and expected money by month", () => {
    const months = dividendMonths(
      [{ accountKey: "a", symbol: "T", payDate: "2026-11-02", amount: 4.17, source: "estimated" }],
      [{ symbol: "O", accountKey: "a", payDate: "2026-11-13", perShare: 0.27, shares: 10, amount: 2.7, declared: true }],
      "2026-11-11",
      2,
      1,
    );
    expect(months.map((m) => m.month)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(months[2]).toMatchObject({ label: "Nov '26", paid: 4.17, expected: 2.7 });
  });
});

describe("buildStocks", () => {
  const raw: StocksRaw = {
    accounts: [
      { id: "a1", key: "robinhood", name: "Robinhood", broker: "robinhood", kind: "brokerage", last4: "0637", goal_amount: 10000, goal_date: "2026-12-31", goal_note: null, cash: "0.07", crypto: "28.12", synced_at: "2026-11-11T21:00:00Z", sort_order: 1 },
      { id: "a3", key: "espp", name: "Copart ESPP", broker: "fidelity", kind: "espp", last4: null, goal_amount: null, goal_date: null, goal_note: null, cash: null, crypto: null, synced_at: null, sort_order: 3 },
    ],
    positions: [
      { account_id: "a1", symbol: "KO", quantity: "2", avg_cost: "70" },
      { account_id: "a1", symbol: "CPRT", quantity: "10", avg_cost: "38.95" },
    ],
    lots: [
      { id: "l1", account_id: "a3", symbol: "CPRT", purchase_date: "2026-11-01", shares: 100, purchase_price: 25.5, market_price: 30, sold: false, note: null },
      { id: "l2", account_id: "a3", symbol: "CPRT", purchase_date: null, shares: 50, purchase_price: null, market_price: null, sold: false, note: "start" },
      { id: "l3", account_id: "a3", symbol: "CPRT", purchase_date: "2025-01-01", shares: 5, purchase_price: 20, market_price: null, sold: true, note: null },
    ],
    prices: [
      { symbol: "KO", day: "2026-10-30", close: 94, prev_close: null },
      { symbol: "KO", day: "2026-11-11", close: 98, prev_close: 96.5 },
      { symbol: "CPRT", day: "2026-10-30", close: 30, prev_close: null },
      { symbol: "CPRT", day: "2026-11-11", close: 32, prev_close: 32.5 },
    ],
    values: [
      { account_id: "a1", day: "2026-10-30", value: 516, cost_basis: 529.5, annual_income: null, backfilled: true },
      { account_id: "a1", day: "2026-11-11", value: 544.19, cost_basis: 529.5, annual_income: 4.24, backfilled: false },
    ],
    dividendInfo: [{ symbol: "KO", pay_date: "2026-12-15", ex_date: "2026-12-01", per_share: 0.53, frequency: "quarterly", yield_pct: 2.1 }],
    dividends: [{ id: "d1", account_id: "a1", symbol: "KO", pay_date: "2026-10-01", amount: 1.06, shares: 2, per_share: 0.53, source: "csv" }],
  };
  const v = buildStocks(raw);

  it("values each account at the last close, cash and crypto included", () => {
    expect(v.asOf).toBe("2026-11-11");
    const rh = v.accounts[0];
    expect(rh.value).toBeCloseTo(196 + 320 + 0.07 + 28.12);
    expect(rh.gain).toBeCloseTo(516 - 529.5);
    expect(rh.changes.day.amount).toBeCloseTo(2 * 1.5 + 10 * -0.5);
    expect(rh.goal).toEqual({ amount: 10000, date: "2026-12-31", note: null });
  });

  it("builds the ESPP from unsold lots, cost unknown until every lot has a price", () => {
    const espp = v.accounts[1];
    expect(espp.holdings).toHaveLength(1);
    expect(espp.holdings[0]).toMatchObject({ symbol: "CPRT", shares: 150, value: 4800, cost: null });
    expect(espp.lots[0]).toMatchObject({ id: "l1", discount: 450, gain: 100 * 32 - 2550 });
    // Lot l1 was bought 11/1, so it isn't in the 10/30 value.
    expect(espp.series).toEqual([
      { day: "2026-10-30", value: 1500, backfilled: false },
      { day: "2026-11-11", value: 4800, backfilled: false },
    ]);
  });

  it("adds up the whole portfolio, CPRT across accounts", () => {
    expect(v.total.holdings[0]).toMatchObject({ symbol: "CPRT", shares: 160 });
    expect(v.total.value).toBeCloseTo(544.19 + 4800);
    expect(v.total.series.map((p) => p.day)).toEqual(["2026-10-30", "2026-11-11"]);
    expect(v.total.cost).toBeNull();
  });

  it("works out dividends paid, coming and per year", () => {
    const d = v.dividends;
    expect(d.annualIncome).toBeCloseTo(2 * 0.53 * 4);
    expect(d.paidThisYear).toBe(1.06);
    expect(d.stillThisYear).toBe(1.06); // KO 12/15
    expect(d.upcoming[0]).toMatchObject({ symbol: "KO", payDate: "2026-12-15", declared: true });
    expect(d.bySymbol[0].nextPay?.payDate).toBe("2026-12-15");
    expect(d.incomeTrend).toEqual([{ day: "2026-11-11", income: 4.24 }]);
  });

  it("counts a sold ESPP lot as realized profit, not as shares held", () => {
    const sold = buildStocks({
      ...raw,
      lots: [
        ...raw.lots,
        { id: "l4", account_id: "a3", symbol: "CPRT", purchase_date: "2026-01-02", shares: 10, purchase_price: 25, market_price: null, sold: false, note: null, sale_date: "2026-11-05", sale_price: 33 },
      ],
    }).accounts[1];
    expect(sold.holdings[0].shares).toBe(150);
    expect(sold.realized).toBeCloseTo(80); // 10 × (33 − 25); the l3 lot has no sale price, so it's left out
    const l4 = sold.lots.find((l) => l.id === "l4")!;
    expect(l4).toMatchObject({ sold: true, value: 0, gain: 80 });
    // Held on 10/30 (before the sale), gone by 11/11.
    expect(sold.series[0].value).toBe(1500 + 300);
    expect(sold.series[1].value).toBe(4800);
  });

  it("lays live prices over the daily closes", () => {
    const live = buildStocks({
      ...raw,
      live: [{ symbol: "KO", price: 100, prevClose: 98, day: "2026-11-12", at: "2026-11-12T16:30:00Z" }],
    });
    expect(live.asOf).toBe("2026-11-12");
    expect(live.liveAt).toBe("2026-11-12T16:30:00Z");
    const rh = live.accounts[0];
    expect(rh.changes.day.amount).toBeCloseTo(2 * 2); // KO moved; CPRT has no live quote, so no move today
    expect(rh.value).toBeCloseTo(200 + 320 + 0.07 + 28.12);
    expect(rh.series[rh.series.length - 1]).toMatchObject({ day: "2026-11-12", backfilled: false });
    expect(buildStocks(raw).liveAt).toBeNull();
  });

  it("summarises each account for the Board", () => {
    const s = stocksSummary(v)!;
    expect(s.accounts.map((a) => a.key)).toEqual(["robinhood", "espp"]);
    expect(s.total.value).toBeCloseTo(v.total.value);
    expect(stocksSummary(buildStocks({ ...raw, prices: [] }))).toBeNull();
  });
});
