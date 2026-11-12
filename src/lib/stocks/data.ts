import { addDays, todayIn } from "@/lib/ops/board";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveQuotes } from "./live";
import { num, type StockPriceRow, type StocksRaw } from "./rows";
import { buildStocks, type StocksView } from "./view";

const PRICE_COLS = "symbol, day, close, prev_close";

/**
 * Every stocks table for the signed-in user (RLS keeps it to their rows).
 * The API returns at most 1,000 rows a request, so prices come in two cuts:
 * the last ~6 weeks of every stock (enough for the day / week / month moves)
 * and the full history of the hand-kept ESPP stock (for its chart).
 */
export async function getStocksRaw(): Promise<StocksRaw> {
  const supabase = await createClient();
  const since = addDays(todayIn(), -45);
  const [accounts, positions, lots, recent, values, info, dividends, settings] = await Promise.all([
    supabase.from("stock_accounts").select("*").order("sort_order"),
    supabase.from("stock_positions").select("account_id, symbol, quantity, avg_cost"),
    supabase.from("stock_lots").select("*"),
    supabase.from("stock_prices").select(PRICE_COLS).gte("day", since).order("day", { ascending: false }).order("symbol").limit(1000),
    supabase
      .from("stock_account_values")
      .select("account_id, day, value, cost_basis, annual_income, backfilled")
      .order("day", { ascending: false })
      .limit(1000),
    supabase.from("stock_dividend_info").select("symbol, pay_date, ex_date, per_share, frequency, yield_pct").limit(1000),
    supabase
      .from("stock_dividends")
      .select("id, account_id, symbol, pay_date, amount, shares, per_share, source")
      .order("pay_date", { ascending: false })
      .limit(1000),
    supabase.from("stock_settings").select("quotes_key").maybeSingle(),
  ]);

  const prices = new Map<string, StockPriceRow>();
  for (const p of recent.data ?? []) prices.set(`${p.symbol}|${p.day}`, p);
  // A big portfolio can pass 1,000 recent closes: page through the rest.
  for (let from = 1000; (recent.data?.length ?? 0) === 1000 && from < 20000; from += 1000) {
    const { data } = await supabase
      .from("stock_prices")
      .select(PRICE_COLS)
      .gte("day", since)
      .order("day", { ascending: false })
      .order("symbol")
      .range(from, from + 999);
    for (const p of data ?? []) prices.set(`${p.symbol}|${p.day}`, p);
    if ((data?.length ?? 0) < 1000) break;
  }
  const lotSymbols = [...new Set((lots.data ?? []).map((l) => l.symbol as string))];
  if (lotSymbols.length) {
    const { data } = await supabase
      .from("stock_prices")
      .select(PRICE_COLS)
      .in("symbol", lotSymbols)
      .order("day", { ascending: false })
      .limit(1000);
    for (const p of data ?? []) prices.set(`${p.symbol}|${p.day}`, p);
  }

  // Live prices while you're on the site, when a market-data key is set up.
  const key = (settings.data?.quotes_key as string | null | undefined) || process.env.FINNHUB_API_KEY || null;
  const held = [
    ...(positions.data ?? []).filter((p) => num(p.quantity) > 0).map((p) => p.symbol as string),
    ...(lots.data ?? []).filter((l) => !l.sold && !l.sale_date).map((l) => l.symbol as string),
  ];
  const live = key && held.length ? await fetchLiveQuotes(held, key) : [];

  return {
    live,
    accounts: accounts.data ?? [],
    positions: positions.data ?? [],
    lots: lots.data ?? [],
    prices: [...prices.values()],
    values: values.data ?? [],
    dividendInfo: info.data ?? [],
    dividends: dividends.data ?? [],
  };
}

export async function getStocksView(): Promise<StocksView> {
  return buildStocks(await getStocksRaw());
}
