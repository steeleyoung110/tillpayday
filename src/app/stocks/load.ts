import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getStocksView } from "@/lib/stocks/data";
import type { StocksView } from "@/lib/stocks/view";

/** The signed-in user's stocks (redirects to sign-in otherwise). */
export async function loadStocks(): Promise<StocksView> {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return getStocksView();
}
