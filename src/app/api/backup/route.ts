/**
 * Full JSON backup: everything the user has entered, one tap, one file.
 * RLS scopes every query to the signed-in user; nothing to configure.
 * Your numbers are yours — including the right to walk away with them.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TABLES = [
  "income_sources",
  "buckets",
  "expenses",
  "income_entries",
  "transfers",
  "goals",
  "whatif_items",
  "assets",
  "liabilities",
  "net_worth_snapshots",
  "celebrated_paydays",
  "review_checkins",
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Not signed in" }, { status: 401 });
  }

  const backup: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    app: "Till Payday",
    account_email: user.email,
  };
  for (const table of TABLES) {
    const { data } = await supabase.from(table).select("*").order("created_at");
    backup[table] = data ?? [];
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="till-payday-backup-${today}.json"`,
    },
  });
}
