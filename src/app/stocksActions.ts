"use server";

/**
 * Server Actions for the Stocks tab. Read-only toward the brokers: nothing
 * here (or anywhere in the app) can place a trade. These only keep the
 * hand-entered parts — ESPP purchases and sales, and goals.
 * Stocks never touch the property tables, so only /stocks and /board are
 * revalidated.
 */

import { revalidatePath } from "next/cache";
import { isISODate } from "@/lib/ops/board";
import { createClient } from "@/lib/supabase/server";

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
  const saleDate = String(form.get("sale_date") ?? "").trim();
  const salePrice = num(form, "sale_price");
  if (!id) return FAIL;
  if (!shares || shares <= 0) return { ok: false, error: "Enter how many shares you bought." };
  if (date && !isISODate(date)) return { ok: false, error: "That purchase date doesn't look right." };
  if (saleDate && !isISODate(saleDate)) return { ok: false, error: "That sale date doesn't look right." };
  const { error } = await supabase
    .from("stock_lots")
    .update({
      shares,
      purchase_date: date || null,
      purchase_price: num(form, "purchase_price"),
      market_price: num(form, "market_price"),
      sale_date: saleDate || null,
      sale_price: salePrice,
      sold: !!saleDate || salePrice !== null,
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
