/**
 * ICS calendar feed: /api/calendar?token=<uuid>. Calendar apps fetch this
 * unauthenticated (the route is excluded from the auth middleware); the
 * unguessable token authorizes it via the calendar_feed security-definer
 * function, which exposes only bill/payday fields. Invalid token → empty
 * calendar, not an error — no enumeration signal.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildCalendarFeed, type FeedExpense, type FeedIncome } from "@/lib/ics";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "Bad token" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("calendar_feed", {
    feed_token: token,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const feed = (data ?? { income: [], expenses: [] }) as {
    income: FeedIncome[];
    expenses: FeedExpense[];
  };
  const todayISO = new Date().toISOString().slice(0, 10);
  const ics = buildCalendarFeed(feed.income ?? [], feed.expenses ?? [], todayISO);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tillpayday.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
