import { todayIn } from "@/lib/ops/board";
import type { LiveQuote } from "./rows";

/**
 * Live prices from Finnhub (free plan: 60 calls a minute, one call per
 * stock). Each quote is cached for 60 seconds on the server, so every page
 * and every refresh inside that minute shares one set of calls. Anything
 * that fails or times out is simply left out and that stock falls back to
 * its last daily close.
 */
const TIMEOUT_MS = 4000;
const MAX_SYMBOLS = 50;

interface FinnhubQuote {
  c?: number; // current price
  pc?: number; // previous close
  t?: number; // last trade, unix seconds
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

export async function fetchLiveQuotes(symbols: string[], key: string): Promise<LiveQuote[]> {
  const list = [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, MAX_SYMBOLS);
  const quotes = await Promise.all(
    list.map(async (symbol): Promise<LiveQuote | null> => {
      try {
        const res = await withTimeout(
          fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`, {
            next: { revalidate: 60 },
          }),
          TIMEOUT_MS,
        );
        if (!res || !res.ok) return null;
        const q = (await res.json()) as FinnhubQuote;
        if (!q.c || q.c <= 0 || !q.t) return null; // unknown symbol, or no trade on record
        const at = new Date(q.t * 1000);
        return {
          symbol,
          price: q.c,
          prevClose: q.pc && q.pc > 0 ? q.pc : null,
          day: todayIn("America/New_York", at),
          at: at.toISOString(),
        };
      } catch {
        return null;
      }
    }),
  );
  return quotes.filter((q): q is LiveQuote => q !== null);
}
