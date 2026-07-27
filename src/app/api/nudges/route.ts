/**
 * Daily nudge emails, meant to be hit by Vercel Cron (see vercel.json).
 *
 * Requires two env vars to actually run:
 *   - CRON_SECRET: Vercel sends it as "Authorization: Bearer <secret>" on
 *     cron invocations; any other caller is rejected.
 *   - SUPABASE_SERVICE_ROLE_KEY: needed to enumerate users and read their
 *     data server-side (RLS doesn't apply to the service role — this key
 *     must only ever live in server env, never the browser).
 * Without either, the route reports itself unconfigured and does nothing.
 * Emails go through sendEmail(), which falls back to console logging until
 * RESEND_API_KEY is set.
 */
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import { computeNudges } from "@/lib/nudges";
import type { DashboardData } from "@/lib/rows";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!secret || !serviceKey || !url) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "Unconfigured: set CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY in the server environment.",
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: users, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  }

  let emailed = 0;
  let checked = 0;
  for (const user of users.users) {
    if (!user.email || user.email.endsWith("@tillpayday.local")) continue; // skip test fixtures
    checked += 1;

    const [income, buckets, expenses, entries, transfers, assets] = await Promise.all([
      admin.from("income_sources").select("*").eq("user_id", user.id),
      admin.from("buckets").select("*").eq("user_id", user.id).order("sort_order"),
      admin.from("expenses").select("*").eq("user_id", user.id),
      admin.from("income_entries").select("*").eq("user_id", user.id),
      admin.from("transfers").select("*").eq("user_id", user.id),
      admin.from("assets").select("*").eq("user_id", user.id).eq("is_archived", false),
    ]);

    const data = {
      income: income.data ?? [],
      buckets: buckets.data ?? [],
      expenses: expenses.data ?? [],
      whatIf: [],
      netWorth: (assets.data ?? []).map((a: Record<string, unknown>) => ({
        id: a.id,
        name: a.name,
        kind: "asset" as const,
        category: a.category,
        amount: Number(a.current_value),
        apy: 0,
        created_at: a.created_at,
      })),
      celebrated: [],
      incomeEntries: entries.data ?? [],
      goals: [],
      transfers: transfers.data ?? [],
    } as DashboardData;

    const nudges = computeNudges(data, todayISO);
    if (nudges.length === 0) continue;

    const name =
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
      user.email.split("@")[0];
    const lines = nudges.map((n) => `• ${n.message}`);
    await sendEmail({
      to: user.email,
      subject:
        nudges.length === 1
          ? "Till Payday: one thing needs your eyes today"
          : `Till Payday: ${nudges.length} things need your eyes today`,
      text: [`Hi ${name},`, "", ...lines, "", "— Till Payday"].join("\n"),
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">
        <p>Hi ${name},</p>
        <ul>${nudges.map((n) => `<li style="margin:8px 0">${n.message}</li>`).join("")}</ul>
        <p style="color:#666">— Till Payday</p>
      </div>`,
    });
    emailed += 1;
  }

  return NextResponse.json({ ok: true, checked, emailed });
}
