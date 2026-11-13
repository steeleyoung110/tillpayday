/**
 * Row shapes for the Stocks tables (migration 0039). Stocks live apart from
 * the property money: nothing here is read by the dashboard, the ledgers,
 * the board tiles or the tax pack.
 *
 * Numeric columns can arrive as strings from PostgREST, so every reader goes
 * through Number().
 */

export type StockAccountKind = "brokerage" | "agentic" | "espp";
export type DividendSource = "estimated" | "csv" | "manual";

export interface StockAccountRow {
  id: string;
  key: string;
  name: string;
  broker: "robinhood" | "fidelity" | "etrade" | "ally" | "other";
  kind: StockAccountKind;
  last4: string | null;
  /** Statement accounts: period end of the statement the shares and cash came from (migration 0044). */
  statement_date?: string | null;
  goal_amount: number | string | null;
  goal_date: string | null;
  goal_note: string | null;
  cash: number | string | null;
  crypto: number | string | null;
  synced_at: string | null;
  sort_order: number;
}

export interface StockPositionRow {
  account_id: string;
  symbol: string;
  quantity: number | string;
  avg_cost: number | string | null;
}

export interface StockLotRow {
  id: string;
  account_id: string;
  symbol: string;
  purchase_date: string | null;
  shares: number | string;
  purchase_price: number | string | null;
  market_price: number | string | null;
  sold: boolean;
  note: string | null;
  sale_date?: string | null;
  sale_price?: number | string | null;
}

export interface StockPriceRow {
  symbol: string;
  day: string;
  close: number | string;
  prev_close: number | string | null;
}

export interface StockValueRow {
  account_id: string;
  day: string;
  value: number | string;
  cost_basis: number | string | null;
  annual_income: number | string | null;
  backfilled: boolean;
}

export interface DividendInfoRow {
  symbol: string;
  pay_date: string;
  ex_date: string | null;
  per_share: number | string;
  frequency: string | null;
  yield_pct: number | string | null;
}

/** A live quote fetched while the page loads (Finnhub), layered over the daily closes. */
export interface LiveQuote {
  symbol: string;
  price: number;
  prevClose: number | null;
  /** America/New_York trading day the price belongs to. */
  day: string;
  /** When the price was last traded (ISO). */
  at: string;
}

export interface DividendRow {
  id: string;
  account_id: string;
  symbol: string;
  pay_date: string;
  amount: number | string;
  shares: number | string | null;
  per_share: number | string | null;
  source: DividendSource;
}

/** Everything the Stocks pages read, straight from the tables. */
export interface StocksRaw {
  accounts: StockAccountRow[];
  positions: StockPositionRow[];
  lots: StockLotRow[];
  prices: StockPriceRow[];
  values: StockValueRow[];
  dividendInfo: DividendInfoRow[];
  dividends: DividendRow[];
  /** Live prices, when a market-data key is set up. */
  live?: LiveQuote[];
}

export const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const optNum = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
