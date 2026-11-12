import { AppShell } from "@/components/AppShell";
import { OpsBoard } from "@/components/OpsBoard";
import { BoardStocks } from "@/components/stocks/BoardStocks";
import { getStocksView } from "@/lib/stocks/data";
import { stocksSummary, type StocksSummary } from "@/lib/stocks/view";
import { loadBoard } from "./load";

/**
 * Ops board: every business and property as a column of red / orange / blue
 * tiles, the way a Copart yard board marks out what's overdue, due soon and
 * open. Property columns also carry their lease or rental-report status and
 * their rent or bookings. A collapsed Stocks dropdown sits under the
 * snapshot; it reads the stock tables only.
 */
export default async function BoardPage() {
  const [props, stocks] = await Promise.all([loadBoard(), loadStocksSummary()]);
  return (
    <AppShell active="board">
      <OpsBoard {...props} extra={<BoardStocks summary={stocks} />} />
    </AppShell>
  );
}

/** A stocks hiccup must never take the board down with it. */
async function loadStocksSummary(): Promise<StocksSummary | null> {
  try {
    return stocksSummary(await getStocksView());
  } catch {
    return null;
  }
}
