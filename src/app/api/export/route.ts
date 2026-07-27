/**
 * CSV export of the signed-in user's data: /api/export?table=expenses.
 * Session-authenticated (the auth middleware runs on this path); RLS scopes
 * every query to the caller. Your numbers are yours — take them anywhere.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Table → ordered export columns. Never includes user_id. */
const EXPORTS: Record<string, string[]> = {
  expenses: ["name", "amount", "bucket_id", "due_date", "cadence", "is_paused", "created_at"],
  buckets: ["name", "allocation_type", "allocation_value", "is_savings", "is_flexible", "rolls_over", "is_paused", "apy", "starting_balance", "goal_amount", "sort_order", "created_at"],
  income_sources: ["name", "amount", "frequency", "kind", "anchor_date", "created_at"],
  income_entries: ["amount", "received_date", "note", "is_windfall", "created_at"],
  transfers: ["from_bucket_id", "to_bucket_id", "amount", "transfer_date", "note", "created_at"],
  goals: ["name", "target_amount", "target_date", "notes", "achieved_at", "created_at"],
  assets: ["name", "category", "current_value", "notes", "is_archived", "created_at"],
  liabilities: ["name", "category", "current_balance", "interest_rate", "minimum_payment", "notes", "is_archived", "created_at"],
};

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const table = new URL(request.url).searchParams.get("table") ?? "expenses";
  const columns = EXPORTS[table];
  if (!columns) {
    return NextResponse.json(
      { error: `Unknown table. One of: ${Object.keys(EXPORTS).join(", ")}` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from(table)
    .select(columns.join(","))
    .order("created_at");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const csv = [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")),
  ].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tillpayday-${table}.csv"`,
    },
  });
}
