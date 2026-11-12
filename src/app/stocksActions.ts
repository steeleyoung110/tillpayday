"use server";

/**
 * Server Actions for the Stocks tab. Read-only toward the brokers: nothing
 * here (or anywhere in the app) can place a trade. These only keep the
 * hand-entered parts — ESPP purchases, imported dividend history, goals.
 * Stocks never touch the property tables, so only /stocks and /board are
 * revalidated.
 */

import { revalidatePath } from "next/cache";
import { isISODate } from "@/lib/ops/board";
import { createClient } from "@/lib/supabase/server";
import type { CsvDividend } from "@/lib/stocks/view";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const FAIL: ActionResult = { ok: false, error: "That didn't save. Check your connection and try again." };
const SYMBOL = /^[A-Z0-9.\-]{1,12}$/;

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refresh() {
  revalidatePath("/stocks", "layout");
  revalidatePath("/board");
}

function num(form: FormData, key: string): number | null {
  const raw = String(form.get(key) ?? "").replace(/[$,\s]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The caller's own account with this key (never trust an id from the form). */
async function accountId(supabase: Awaited<ReturnType<typeof createClient>>, key: string): Promise<string | null> {
  const { data } = await supabase.from("stock_accounts").select("id").eq("key", key).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// ESPP purchase lots
// ---------------------------------------------------------------------------

export async function addStockLot(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = await accountId(supabase, String(form.get("account") ?? "espp"));
  if (!id) return { ok: false, error: "Couldn't find that account." };
  const symbol = String(form.get("symbol") ?? "CPRT").trim().toUpperCase() || "CPRT";
  const shares = num(form, "shares");
  const date = String(form.get("purchase_date") ?? "").trim();
  if (!SYMBOL.test(symbol)) return { ok: false, error: "Enter a ticker like CPRT." };
  if (!shares || shares <= 0) return { ok: false, error: "Enter how many shares you bought." };
  if (date && !isISODate(date)) return { ok: false, error: "That purchase date doesn't look right." };
  const { error } = await supabase.from("stock_lots").insert({
    account_id: id,
    symbol,
    shares,
    purchase_date: date || null,
    purchase_price: num(form, "purchase_price"),
    market_price: num(form, "market_price"),
    note: String(form.get("note") ?? "").trim().slice(0, 200) || null,
  });
  if (error) return FAIL;
  refresh();
  return { ok: true };
}

export async function updateStockLot(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = String(form.get("id") ?? "");
  const shares = num(form, "shares");
  const date = String(form.get("purchase_date") ?? "").trim();
  if (!id) return FAIL;
  if (!shares || shares <= 0) return { ok: false, error: "Enter how many shares you bought." };
  if (date && !isISODate(date)) return { ok: false, error: "That purchase date doesn't look right." };
  const { error } = await supabase
    .from("stock_lots")
    .update({
      shares,
      purchase_date: date || null,
      purchase_price: num(form, "purchase_price"),
      market_price: num(form, "market_price"),
      sold: form.get("sold") === "on",
      note: String(form.get("note") ?? "").trim().slice(0, 200) || null,
    })
    .eq("id", id);
  if (error) return FAIL;
  refresh();
  return { ok: true };
}

export async function deleteStockLot(id: string): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user || !id) return FAIL;
  const { error } = await supabase.from("stock_lots").delete().eq("id", id);
  if (error) return FAIL;
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dividend history from a Robinhood activity CSV (parsed in the browser)
// ---------------------------------------------------------------------------

export async function importDividends(
  accountKey: string,
  rows: CsvDividend[],
): Promise<ActionResult & { saved?: number }> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = await accountId(supabase, accountKey);
  if (!id) return { ok: false, error: "Couldn't find that account." };
  const clean = (Array.isArray(rows) ? rows : [])
    .filter(
      (r) =>
        r &&
        SYMBOL.test(String(r.symbol)) &&
        isISODate(r.payDate) &&
        Number.isFinite(Number(r.amount)) &&
        Number(r.amount) > 0 &&
        Number(r.amount) < 1_000_000,
    )
    .slice(0, 5000)
    .map((r) => ({
      account_id: id,
      symbol: String(r.symbol),
      pay_date: r.payDate,
      amount: Math.round(Number(r.amount) * 100) / 100,
      source: "csv" as const,
    }));
  if (!clean.length) return { ok: false, error: "No dividend payments to save." };
  // Same file twice just rewrites the same rows.
  const { error } = await supabase
    .from("stock_dividends")
    .upsert(clean, { onConflict: "account_id,symbol,pay_date,source" });
  if (error) return FAIL;
  refresh();
  return { ok: true, saved: clean.length };
}

export async function clearImportedDividends(accountKey: string): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = await accountId(supabase, accountKey);
  if (!id) return FAIL;
  const { error } = await supabase.from("stock_dividends").delete().eq("account_id", id).eq("source", "csv");
  if (error) return FAIL;
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export async function setStockGoal(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = await accountId(supabase, String(form.get("account") ?? ""));
  if (!id) return FAIL;
  const amount = num(form, "goal_amount");
  const date = String(form.get("goal_date") ?? "").trim();
  if (date && !isISODate(date)) return { ok: false, error: "That date doesn't look right." };
  const { error } = await supabase
    .from("stock_accounts")
    .update({ goal_amount: amount && amount > 0 ? amount : null, goal_date: date || null })
    .eq("id", id);
  if (error) return FAIL;
  refresh();
  return { ok: true };
}
