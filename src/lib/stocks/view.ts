/**
 * Stocks math, kept pure so it can be tested: holdings and their value, the
 * day / week / month moves, the pie breakdown, dividend plans, upcoming
 * payments, payout history and the month-by-month picture.
 *
 * "Up or down" means what the market did to the shares held now:
 * shares × (price now − price then). Deposits and new buys don't count as
 * gains, which is what you want when asking "how did my stocks do this week".
 */
import { addDays, addMonths, diffDays } from "@/lib/ops/board";
import {
  num,
  optNum,
  type DividendInfoRow,
  type DividendSource,
  type LiveQuote,
  type StockAccountKind,
  type StockPriceRow,
  type StocksRaw,
} from "./rows";

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export interface PricePoint {
  day: string;
  close: number;
  prev: number | null;
}
export type PriceIndex = Map<string, PricePoint[]>;

export function priceIndex(rows: StockPriceRow[]): PriceIndex {
  const idx: PriceIndex = new Map();
  for (const r of rows) {
    const list = idx.get(r.symbol) ?? [];
    list.push({ day: r.day, close: num(r.close), prev: optNum(r.prev_close) });
    idx.set(r.symbol, list);
  }
  for (const list of idx.values()) list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return idx;
}

/** The most recent close in the table: what every number is "as of". */
export function lastPriceDay(idx: PriceIndex): string | null {
  let last: string | null = null;
  for (const list of idx.values()) {
    const d = list[list.length - 1]?.day;
    if (d && (!last || d > last)) last = d;
  }
  return last;
}

/** Close on or before `day`. If the history starts later, its first close. */
export function closeAt(idx: PriceIndex, symbol: string, day: string): number | null {
  const pts = idx.get(symbol);
  if (!pts?.length) return null;
  let best: PricePoint | null = null;
  for (const p of pts) {
    if (p.day <= day) best = p;
    else break;
  }
  return (best ?? pts[0]).close;
}

/** The close before the session on or before `asOf` (for the day's move). */
export function prevCloseAt(idx: PriceIndex, symbol: string, asOf: string): number | null {
  const pts = idx.get(symbol);
  if (!pts?.length) return null;
  let i = -1;
  for (let k = 0; k < pts.length; k += 1) if (pts[k].day <= asOf) i = k;
  if (i < 0) return null;
  // No price for that day itself (didn't trade, or no live quote): no move.
  if (pts[i].day < asOf) return pts[i].close;
  if (pts[i].prev !== null) return pts[i].prev;
  return i > 0 ? pts[i - 1].close : null;
}

// ---------------------------------------------------------------------------
// Holdings and moves
// ---------------------------------------------------------------------------

export type PeriodKey = "day" | "week" | "month";
export const PERIODS: PeriodKey[] = ["day", "week", "month"];
export const PERIOD_LABELS: Record<PeriodKey, string> = { day: "Day", week: "Week", month: "Month" };

/** A move in dollars, and the value it moved from (for the percent). */
export interface Change {
  amount: number;
  base: number;
}
export type Changes = Record<PeriodKey, Change>;

export const ZERO: Change = { amount: 0, base: 0 };
export const changePct = (c: Change): number | null => (c.base > 0 ? c.amount / c.base : null);
const addChange = (a: Change, b: Change): Change => ({ amount: a.amount + b.amount, base: a.base + b.base });
export const zeroChanges = (): Changes => ({ day: { ...ZERO }, week: { ...ZERO }, month: { ...ZERO } });
export function sumChanges(list: Changes[]): Changes {
  const out = zeroChanges();
  for (const c of list) for (const p of PERIODS) out[p] = addChange(out[p], c[p]);
  return out;
}

/** The days the week and month moves are measured from. */
export function periodStarts(asOf: string): { week: string; month: string } {
  return { week: addDays(asOf, -7), month: addMonths(asOf, -1) };
}

export interface Holding {
  symbol: string;
  shares: number;
  avgCost: number | null;
  price: number | null;
  value: number;
  cost: number | null;
  changes: Changes;
}

export function makeHolding(
  symbol: string,
  shares: number,
  avgCost: number | null,
  idx: PriceIndex,
  asOf: string,
): Holding {
  const price = closeAt(idx, symbol, asOf);
  const starts = periodStarts(asOf);
  const move = (ref: number | null): Change =>
    price === null || ref === null ? { ...ZERO } : { amount: shares * (price - ref), base: shares * ref };
  return {
    symbol,
    shares,
    avgCost,
    price,
    value: price === null ? 0 : shares * price,
    cost: avgCost === null ? null : shares * avgCost,
    changes: {
      day: move(prevCloseAt(idx, symbol, asOf)),
      week: move(closeAt(idx, symbol, starts.week)),
      month: move(closeAt(idx, symbol, starts.month)),
    },
  };
}

/** Pie items for a holdings list: value, shares and price per share. */
export const holdingSlices = (holdings: Holding[]) =>
  pieSlices(holdings.map((h) => ({ label: h.symbol, value: h.value, shares: h.shares, price: h.price })));

/** One row per symbol across several holdings lists (the combined portfolio). */
export function mergeHoldings(lists: Holding[][]): Holding[] {
  const by = new Map<string, Holding>();
  for (const h of lists.flat()) {
    const cur = by.get(h.symbol);
    if (!cur) {
      by.set(h.symbol, { ...h, changes: sumChanges([h.changes]) });
      continue;
    }
    const shares = cur.shares + h.shares;
    const cost = cur.cost === null || h.cost === null ? null : cur.cost + h.cost;
    by.set(h.symbol, {
      symbol: h.symbol,
      shares,
      price: cur.price ?? h.price,
      value: cur.value + h.value,
      cost,
      avgCost: cost === null || shares <= 0 ? null : cost / shares,
      changes: sumChanges([cur.changes, h.changes]),
    });
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Pie
// ---------------------------------------------------------------------------

/**
 * Series colors for the dark app surface (validated: lightness band, chroma,
 * colorblind separation of neighbours, 3:1 contrast on slate-900). Fixed
 * order — slices take them biggest first; anything past eight is "Other".
 */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const OTHER_COLOR = "#64748b";

export interface Slice {
  label: string;
  value: number;
  share: number;
  color: string;
  /** Shares held and price per share (not on "Other"). */
  shares?: number;
  price?: number | null;
  /** For "Other": what's folded into it. */
  members?: string[];
}

export function pieSlices(
  items: { label: string; value: number; shares?: number; price?: number | null }[],
  max = SERIES_COLORS.length,
): Slice[] {
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];
  const head = sorted.length > max ? sorted.slice(0, max) : sorted;
  const rest = sorted.length > max ? sorted.slice(max) : [];
  const slices: Slice[] = head.map((i, k) => ({
    label: i.label,
    value: i.value,
    share: i.value / total,
    color: SERIES_COLORS[k],
    ...(i.shares !== undefined ? { shares: i.shares } : {}),
    ...(i.price !== undefined ? { price: i.price } : {}),
  }));
  if (rest.length) {
    const v = rest.reduce((s, i) => s + i.value, 0);
    slices.push({ label: `Other (${rest.length})`, value: v, share: v / total, color: OTHER_COLOR, members: rest.map((i) => i.label) });
  }
  return slices;
}

// ---------------------------------------------------------------------------
// Dividends
// ---------------------------------------------------------------------------

/** "Monthly" → 12, "Quarterly" → 4, "Semi-Annual" → 2, "Annual" → 1. */
export function paymentsPerYear(freq: string | null | undefined): number {
  const f = (freq ?? "").toLowerCase().replace(/[-\s]/g, "");
  if (f.startsWith("month")) return 12;
  if (f.startsWith("quarter")) return 4;
  if (f.startsWith("semi")) return 2;
  if (f.startsWith("annual") || f.startsWith("year")) return 1;
  return 0;
}

export const FREQUENCY_LABEL: Record<number, string> = { 12: "Monthly", 4: "Quarterly", 2: "Twice a year", 1: "Yearly" };

export interface DividendPlan {
  symbol: string;
  perShare: number;
  ppy: number;
  /** Latest pay date Robinhood has shown (past or announced). */
  lastPay: string;
  yieldPct: number | null;
  /** Announced payments still to come. */
  declared: { payDate: string; perShare: number }[];
}

/** One plan per stock that actually pays (skips non-payers and stale data). */
export function dividendPlans(info: DividendInfoRow[], asOf: string): Map<string, DividendPlan> {
  const by = new Map<string, DividendInfoRow[]>();
  for (const r of info) by.set(r.symbol, [...(by.get(r.symbol) ?? []), r]);
  const plans = new Map<string, DividendPlan>();
  for (const [symbol, rows] of by) {
    rows.sort((a, b) => (a.pay_date < b.pay_date ? -1 : 1));
    const latest = rows[rows.length - 1];
    const ppy = paymentsPerYear(latest.frequency);
    if (!ppy || latest.pay_date < addDays(asOf, -400) || num(latest.per_share) <= 0) continue;
    plans.set(symbol, {
      symbol,
      perShare: num(latest.per_share),
      ppy,
      lastPay: latest.pay_date,
      yieldPct: optNum(latest.yield_pct),
      declared: rows.filter((r) => r.pay_date > asOf).map((r) => ({ payDate: r.pay_date, perShare: num(r.per_share) })),
    });
  }
  return plans;
}

export interface Payment {
  symbol: string;
  accountKey: string;
  payDate: string;
  perShare: number;
  shares: number;
  amount: number;
  /** Announced by the company (vs. projected from its usual schedule). */
  declared: boolean;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Payments after `asOf` up to `until`: announced ones, then the usual rhythm. */
export function projectPayments(
  plan: DividendPlan,
  shares: number,
  accountKey: string,
  asOf: string,
  until: string,
): Payment[] {
  if (shares <= 0) return [];
  const out: Payment[] = [];
  for (const d of plan.declared) {
    if (d.payDate > asOf && d.payDate <= until) {
      out.push({ symbol: plan.symbol, accountKey, payDate: d.payDate, perShare: d.perShare, shares, amount: cents(shares * d.perShare), declared: true });
    }
  }
  const stepMonths = 12 / plan.ppy;
  for (let k = 1; k < 200; k += 1) {
    const day = addMonths(plan.lastPay, stepMonths * k);
    if (day > until) break;
    if (day <= asOf) continue;
    if (out.some((p) => Math.abs(diffDays(p.payDate, day)) <= 10)) continue;
    out.push({ symbol: plan.symbol, accountKey, payDate: day, perShare: plan.perShare, shares, amount: cents(shares * plan.perShare), declared: false });
  }
  return out.sort((a, b) => (a.payDate < b.payDate ? -1 : 1));
}

export interface PaidDividend {
  accountKey: string;
  symbol: string;
  payDate: string;
  amount: number;
  source: DividendSource;
}

/**
 * The daily sync records an estimate when a dividend pays. If an exact
 * amount is ever entered for the same payment (same account and stock,
 * within a week), keep the exact one.
 */
export function cleanHistory(rows: PaidDividend[]): PaidDividend[] {
  const exact = rows.filter((r) => r.source !== "estimated");
  return rows
    .filter(
      (r) =>
        r.source !== "estimated" ||
        !exact.some((e) => e.accountKey === r.accountKey && e.symbol === r.symbol && Math.abs(diffDays(e.payDate, r.payDate)) <= 7),
    )
    .sort((a, b) => (a.payDate < b.payDate ? 1 : a.payDate > b.payDate ? -1 : a.symbol.localeCompare(b.symbol)));
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} '${ym.slice(2, 4)}`;

export interface MonthBar {
  month: string;
  label: string;
  paid: number;
  expected: number;
}

/** Past `back` months of payouts through the next `ahead` months of expected ones. */
export function dividendMonths(paid: PaidDividend[], upcoming: Payment[], asOf: string, back = 11, ahead = 12): MonthBar[] {
  const first = addMonths(`${asOf.slice(0, 7)}-01`, -back);
  const bars: MonthBar[] = [];
  for (let k = 0; k <= back + ahead; k += 1) {
    const month = addMonths(first, k).slice(0, 7);
    bars.push({ month, label: monthLabel(month), paid: 0, expected: 0 });
  }
  const at = new Map(bars.map((b) => [b.month, b]));
  for (const p of paid) {
    const b = at.get(p.payDate.slice(0, 7));
    if (b) b.paid = cents(b.paid + p.amount);
  }
  for (const p of upcoming) {
    const b = at.get(p.payDate.slice(0, 7));
    if (b) b.expected = cents(b.expected + p.amount);
  }
  return bars;
}

// ---------------------------------------------------------------------------
// The whole view
// ---------------------------------------------------------------------------

export interface LotView {
  id: string;
  symbol: string;
  purchaseDate: string | null;
  shares: number;
  purchasePrice: number | null;
  marketPrice: number | null;
  sold: boolean;
  note: string | null;
  saleDate: string | null;
  salePrice: number | null;
  /** Worth now (0 once sold). */
  value: number;
  cost: number | null;
  /** Unrealized while held; realized (sale price − cost) once sold. */
  gain: number | null;
  /** What the ESPP discount was worth on purchase day. */
  discount: number | null;
}

export interface AccountView {
  id: string;
  key: string;
  name: string;
  kind: StockAccountKind;
  broker: string;
  last4: string | null;
  syncedAt: string | null;
  /**
   * Kept from statements (any broker but Robinhood, not the ESPP): shares and
   * cash are entered from each statement; the daily sync prices them.
   */
  fromStatement: boolean;
  statementDate: string | null;
  holdings: Holding[];
  cash: number;
  crypto: number;
  value: number;
  cost: number | null;
  gain: number | null;
  changes: Changes;
  goal: { amount: number; date: string | null; note: string | null } | null;
  lots: LotView[];
  /** Profit or loss already locked in by sales (ESPP lots). */
  realized: number;
  annualIncome: number;
  series: { day: string; value: number; backfilled: boolean }[];
  /** Price per share over time, for an account that holds one stock (the ESPP). */
  priceSeries: { symbol: string; points: { day: string; price: number }[] } | null;
}

export interface SymbolIncome {
  symbol: string;
  shares: number;
  /** Stock price per share now, and what the shares are worth. */
  price: number | null;
  value: number;
  /** Dividend per share, per payment. */
  perShare: number;
  ppy: number;
  annual: number;
  yieldPct: number | null;
  yieldOnCost: number | null;
  nextPay: Payment | null;
}

export interface StocksView {
  asOf: string | null;
  syncedAt: string | null;
  /** Set when prices are live (time of the latest live trade). */
  liveAt: string | null;
  accounts: AccountView[];
  total: {
    value: number;
    cost: number | null;
    gain: number | null;
    changes: Changes;
    holdings: Holding[];
    series: { day: string; value: number }[];
  };
  dividends: {
    bySymbol: SymbolIncome[];
    upcoming: Payment[];
    history: PaidDividend[];
    annualIncome: number;
    paidThisYear: number;
    stillThisYear: number;
    trailing12: number;
    months: MonthBar[];
    incomeTrend: { day: string; income: number }[];
    historyFrom: string | null;
  };
}

/** Kept from statements: not synced from Robinhood, and not the lot-based ESPP. */
export const isStatementAccount = (a: { broker: string; kind: StockAccountKind }) => a.broker !== "robinhood" && a.kind !== "espp";

/** An account's value on `day`: its latest point on or before it, else its first point. */
export function valueOn(series: { day: string; value: number }[], day: string): number {
  let best = series[0]?.value ?? 0;
  for (const p of series) {
    if (p.day <= day) best = p.value;
    else break;
  }
  return best;
}

function lotViews(raw: StocksRaw, accountId: string, idx: PriceIndex, asOf: string): LotView[] {
  return raw.lots
    .filter((l) => l.account_id === accountId)
    .map((l) => {
      const shares = num(l.shares);
      const purchasePrice = optNum(l.purchase_price);
      const marketPrice = optNum(l.market_price);
      const salePrice = optNum(l.sale_price);
      const sold = l.sold || !!l.sale_date || salePrice !== null;
      const price = closeAt(idx, l.symbol, asOf);
      const value = sold || price === null ? 0 : shares * price;
      const cost = purchasePrice === null ? null : shares * purchasePrice;
      const gain = cost === null ? null : sold ? (salePrice === null ? null : shares * salePrice - cost) : value - cost;
      return {
        id: l.id,
        symbol: l.symbol,
        purchaseDate: l.purchase_date,
        shares,
        purchasePrice,
        marketPrice,
        sold,
        note: l.note,
        saleDate: l.sale_date ?? null,
        salePrice,
        value,
        cost,
        gain,
        discount: purchasePrice !== null && marketPrice !== null ? shares * (marketPrice - purchasePrice) : null,
      };
    })
    .sort((a, b) => ((a.purchaseDate ?? "") < (b.purchaseDate ?? "") ? 1 : -1));
}

/** Lay live quotes over the stored daily closes (a live price replaces that day's row). */
export function withLive(prices: StockPriceRow[], live: LiveQuote[] = []): StockPriceRow[] {
  if (!live.length) return prices;
  const at = new Map(prices.map((p) => [`${p.symbol}|${p.day}`, p]));
  for (const q of live) at.set(`${q.symbol}|${q.day}`, { symbol: q.symbol, day: q.day, close: q.price, prev_close: q.prevClose });
  return [...at.values()];
}

export function buildStocks(raw: StocksRaw): StocksView {
  const idx = priceIndex(withLive(raw.prices, raw.live));
  const asOf = lastPriceDay(idx);
  const liveToday = (raw.live ?? []).filter((q) => q.day === asOf);
  const liveAt = liveToday.length ? liveToday.map((q) => q.at).sort().pop()! : null;
  const empty: StocksView = {
    asOf: null,
    syncedAt: null,
    liveAt: null,
    accounts: [],
    total: { value: 0, cost: null, gain: null, changes: zeroChanges(), holdings: [], series: [] },
    dividends: {
      bySymbol: [],
      upcoming: [],
      history: [],
      annualIncome: 0,
      paidThisYear: 0,
      stillThisYear: 0,
      trailing12: 0,
      months: [],
      incomeTrend: [],
      historyFrom: null,
    },
  };
  if (!asOf) return { ...empty, accounts: [] };

  const plans = dividendPlans(raw.dividendInfo, asOf);
  const keyOf = new Map(raw.accounts.map((a) => [a.id, a.key]));
  const accounts: AccountView[] = [...raw.accounts]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((a) => {
      const lots = lotViews(raw, a.id, idx, asOf);
      let holdings: Holding[];
      if (a.kind === "espp") {
        const bySym = new Map<string, LotView[]>();
        for (const l of lots.filter((x) => !x.sold)) bySym.set(l.symbol, [...(bySym.get(l.symbol) ?? []), l]);
        holdings = [...bySym].map(([symbol, ls]) => {
          const shares = ls.reduce((s, l) => s + l.shares, 0);
          const known = ls.every((l) => l.purchasePrice !== null);
          const cost = known ? ls.reduce((s, l) => s + (l.cost ?? 0), 0) : null;
          return makeHolding(symbol, shares, cost === null || shares <= 0 ? null : cost / shares, idx, asOf);
        });
      } else {
        holdings = raw.positions
          .filter((p) => p.account_id === a.id && num(p.quantity) > 0)
          .map((p) => makeHolding(p.symbol, num(p.quantity), optNum(p.avg_cost), idx, asOf));
      }
      holdings.sort((x, y) => y.value - x.value);
      const cash = num(a.cash);
      const crypto = num(a.crypto);
      const stockValue = holdings.reduce((s, h) => s + h.value, 0);
      const cost = holdings.length && holdings.every((h) => h.cost !== null) ? holdings.reduce((s, h) => s + (h.cost ?? 0), 0) : null;

      let series: AccountView["series"];
      if (a.kind === "espp") {
        const days = new Set<string>();
        for (const l of lots) for (const p of idx.get(l.symbol) ?? []) if (p.day <= asOf) days.add(p.day);
        series = [...days].sort().map((day) => ({
          day,
          backfilled: false,
          value: lots
            .filter((l) => (!l.purchaseDate || l.purchaseDate <= day) && (!l.sold || (l.saleDate !== null && day < l.saleDate)))
            .reduce((s, l) => s + l.shares * (closeAt(idx, l.symbol, day) ?? 0), 0),
        }));
      } else {
        series = raw.values
          .filter((v) => v.account_id === a.id)
          .map((v) => ({ day: v.day, value: num(v.value), backfilled: v.backfilled }))
          .sort((x, y) => (x.day < y.day ? -1 : 1));
        // Live prices move today's value before the evening sync records it.
        const last = series[series.length - 1];
        if (liveAt && holdings.length && last && last.day < asOf) {
          series.push({ day: asOf, value: Math.round((stockValue + cash + crypto) * 100) / 100, backfilled: false });
        }
      }

      const annualIncome = holdings.reduce((s, h) => {
        const plan = plans.get(h.symbol);
        return s + (plan ? h.shares * plan.perShare * plan.ppy : 0);
      }, 0);
      const goalAmount = optNum(a.goal_amount);
      return {
        id: a.id,
        key: a.key,
        name: a.name,
        kind: a.kind,
        broker: a.broker,
        last4: a.last4,
        syncedAt: a.synced_at,
        fromStatement: isStatementAccount(a),
        statementDate: a.statement_date ?? null,
        holdings,
        cash,
        crypto,
        value: stockValue + cash + crypto,
        cost,
        gain: cost === null ? null : stockValue - cost,
        changes: sumChanges(holdings.map((h) => h.changes)),
        goal: goalAmount ? { amount: goalAmount, date: a.goal_date, note: a.goal_note } : null,
        lots,
        realized: lots.filter((l) => l.sold && l.gain !== null).reduce((sum, l) => sum + (l.gain ?? 0), 0),
        annualIncome,
        series,
        priceSeries:
          holdings.length === 1
            ? {
                symbol: holdings[0].symbol,
                points: (idx.get(holdings[0].symbol) ?? []).filter((p) => p.day <= asOf).map((p) => ({ day: p.day, price: p.close })),
              }
            : null,
      };
    });

  // Combined line. Accounts recorded every day (synced, ESPP) set the days:
  // only days every one of them has a value for. A statement account joins
  // each of those days at its latest value on or before it (its first value
  // before it was added), so adding one doesn't show up as a jump.
  const withSeries = accounts.filter((a) => a.series.length);
  const daily = withSeries.some((a) => !a.fromStatement) ? withSeries.filter((a) => !a.fromStatement) : withSeries;
  const filled = withSeries.filter((a) => !daily.includes(a));
  const dayTotals = new Map<string, { n: number; value: number }>();
  for (const a of daily) {
    for (const p of a.series) {
      const cur = dayTotals.get(p.day) ?? { n: 0, value: 0 };
      dayTotals.set(p.day, { n: cur.n + 1, value: cur.value + p.value });
    }
  }
  const totalSeries = [...dayTotals]
    .filter(([, t]) => t.n === daily.length)
    .map(([day, t]) => ({ day, value: Math.round((t.value + filled.reduce((s, a) => s + valueOn(a.series, day), 0)) * 100) / 100 }))
    .sort((x, y) => (x.day < y.day ? -1 : 1));

  const totalCost = accounts.every((a) => a.cost !== null || !a.holdings.length)
    ? accounts.reduce((s, a) => s + (a.cost ?? 0), 0)
    : null;
  const totalStock = accounts.reduce((s, a) => s + a.value - a.cash - a.crypto, 0);

  // Dividends
  const until = addDays(asOf, 365);
  const upcoming = accounts
    .flatMap((a) =>
      a.holdings.flatMap((h) => {
        const plan = plans.get(h.symbol);
        return plan ? projectPayments(plan, h.shares, a.key, asOf, until) : [];
      }),
    )
    .sort((x, y) => (x.payDate < y.payDate ? -1 : x.payDate > y.payDate ? 1 : x.symbol.localeCompare(y.symbol)));
  const history = cleanHistory(
    raw.dividends.map((d) => ({
      accountKey: keyOf.get(d.account_id) ?? "",
      symbol: d.symbol,
      payDate: d.pay_date,
      amount: num(d.amount),
      source: d.source,
    })),
  );
  const year = asOf.slice(0, 4);
  const yearEnd = `${year}-12-31`;
  const yearAgo = addDays(asOf, -365);
  const combined = mergeHoldings(accounts.map((a) => a.holdings));
  const bySymbol: SymbolIncome[] = combined
    .filter((h) => plans.has(h.symbol))
    .map((h) => {
      const plan = plans.get(h.symbol)!;
      const annual = h.shares * plan.perShare * plan.ppy;
      return {
        symbol: h.symbol,
        shares: h.shares,
        price: h.price,
        value: h.value,
        perShare: plan.perShare,
        ppy: plan.ppy,
        annual,
        yieldPct: h.value > 0 ? (annual / h.value) * 100 : plan.yieldPct,
        yieldOnCost: h.cost ? (annual / h.cost) * 100 : null,
        nextPay: upcoming.find((p) => p.symbol === h.symbol) ?? null,
      };
    })
    .sort((x, y) => y.annual - x.annual);

  // Expected yearly dividends as recorded at each sync, all accounts added up.
  const incomeByDay = new Map<string, number>();
  for (const v of raw.values) {
    if (v.annual_income === null || v.annual_income === undefined) continue;
    incomeByDay.set(v.day, (incomeByDay.get(v.day) ?? 0) + num(v.annual_income));
  }

  return {
    asOf,
    syncedAt: raw.accounts.map((a) => a.synced_at).filter((s): s is string => !!s).sort().pop() ?? null,
    liveAt,
    accounts,
    total: {
      value: accounts.reduce((s, a) => s + a.value, 0),
      cost: totalCost,
      gain: totalCost === null ? null : totalStock - totalCost,
      changes: sumChanges(accounts.map((a) => a.changes)),
      holdings: combined,
      series: totalSeries,
    },
    dividends: {
      bySymbol,
      upcoming,
      history,
      annualIncome: bySymbol.reduce((s, b) => s + b.annual, 0),
      paidThisYear: cents(history.filter((h) => h.payDate.startsWith(year)).reduce((s, h) => s + h.amount, 0)),
      stillThisYear: cents(upcoming.filter((p) => p.payDate <= yearEnd).reduce((s, p) => s + p.amount, 0)),
      trailing12: cents(history.filter((h) => h.payDate > yearAgo && h.payDate <= asOf).reduce((s, h) => s + h.amount, 0)),
      months: dividendMonths(history, upcoming, asOf),
      incomeTrend: [...incomeByDay]
        .map(([day, income]) => ({ day, income: cents(income) }))
        .sort((x, y) => (x.day < y.day ? -1 : 1)),
      historyFrom: history.length ? history[history.length - 1].payDate : null,
    },
  };
}

/** What the Board's stocks dropdown shows. */
export interface StocksSummary {
  asOf: string;
  liveAt: string | null;
  accounts: { key: string; name: string; value: number; changes: Changes }[];
  total: { value: number; changes: Changes };
}

export function stocksSummary(view: StocksView): StocksSummary | null {
  if (!view.asOf || !view.accounts.length) return null;
  return {
    asOf: view.asOf,
    liveAt: view.liveAt,
    accounts: view.accounts.map((a) => ({ key: a.key, name: a.name, value: a.value, changes: a.changes })),
    total: { value: view.total.value, changes: view.total.changes },
  };
}
