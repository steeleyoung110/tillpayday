"use server";

/**
 * Server Actions: every form in the app submits to one of these functions.
 * They run on the server, use the signed-in user's Supabase session, and the
 * database's row-level security guarantees each user can only touch their own
 * rows. After each change we revalidate the dashboard so it re-renders.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APP_VERSION } from "@/lib/version";
import { coolingState } from "@/lib/coolingOff";
import { getDashboardData } from "@/lib/data";
import { buildPaydayRecapEmail } from "@/lib/email/paydayRecap";
import { sendEmail } from "@/lib/email/send";
import { paydayRecap } from "@/lib/engine";
import { computeTotals } from "@/lib/netWorth";
import {
  LIQUID_CATEGORIES,
  bucketToEngine,
  expenseToEngine,
  incomeEntryToEngine,
  incomeToEngine,
} from "@/lib/rows";
import { getTemplate } from "@/lib/templates";
import { createClient } from "@/lib/supabase/server";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function num(form: FormData, key: string): number {
  const n = Number(form.get(key));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: str(formData, "email"),
    password: String(formData.get("password") ?? ""),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function signUp(formData: FormData) {
  // Phase 11: signing up requires acknowledging what the app is (and isn't).
  // The acceptance moment is stored on the user's profile metadata.
  if (formData.get("legal_ack") !== "on") {
    redirect(
      `/login?error=${encodeURIComponent(
        "One more step — check the box acknowledging Till Payday is an educational tool, then hit Sign up again.",
      )}`,
    );
  }

  const supabase = await createClient();
  const name = str(formData, "name");
  const { data, error } = await supabase.auth.signUp({
    email: str(formData, "email"),
    password: String(formData.get("password") ?? ""),
    options: {
      data: {
        ...(name ? { full_name: name } : {}),
        legal_accepted_at: new Date().toISOString(),
      },
    },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  // With email confirmation off, sign-up returns a live session — go straight in.
  if (data.session) redirect("/");
  redirect(
    `/login?message=${encodeURIComponent(
      "Check your email to confirm your account, then sign in.",
    )}`,
  );
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const h = await headers();
  const origin =
    h.get("origin") ??
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Web-push: store/remove this browser's subscription, and a self-test send
 * so you can prove the pipe works from Settings.
 */
export async function savePushSubscription(formData: FormData) {
  const supabase = await createClient();
  const endpoint = str(formData, "endpoint");
  const p256dh = str(formData, "p256dh");
  const auth = str(formData, "auth");
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return;
  await supabase
    .from("push_subscriptions")
    .upsert({ endpoint, p256dh, auth }, { onConflict: "endpoint" });
}

export async function removePushSubscription(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", str(formData, "endpoint"));
}

export async function sendTestPush(): Promise<{ delivered: number; total: number }> {
  const supabase = await createClient();
  const { sendPush } = await import("@/lib/push");
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  const subs = data ?? [];
  const delivered = await sendPush(supabase, subs, {
    title: "Till Payday 🔔",
    body: "Push works. This is what a bill warning will feel like.",
    url: "/",
  });
  return { delivered, total: subs.length };
}

/**
 * Starter setup: seed a sensible first budget (the same shape as Sam's demo)
 * for a brand-new account. Guarded — refuses if any buckets already exist.
 */
export async function adoptStarterSetup() {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("buckets").select("id").limit(1);
  if ((existing ?? []).length > 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const { data: income } = await supabase.from("income_sources").select("id").limit(1);
  if ((income ?? []).length === 0) {
    await supabase.from("income_sources").insert({
      name: "My paycheck",
      amount: 1400,
      frequency: "biweekly",
      kind: "paycheck",
      anchor_date: today,
    });
  }
  await supabase.from("buckets").insert([
    { name: "Rent", allocation_type: "fixed", allocation_value: 600, is_savings: false, is_flexible: false, rolls_over: false, sort_order: 0, starting_balance: 0 },
    { name: "Food", allocation_type: "percent", allocation_value: 15, is_savings: false, is_flexible: false, rolls_over: false, sort_order: 1, starting_balance: 0 },
    { name: "Fun money", allocation_type: "percent", allocation_value: 10, is_savings: false, is_flexible: true, rolls_over: false, sort_order: 2, starting_balance: 0 },
    { name: "Savings", allocation_type: "fixed", allocation_value: 0, is_savings: true, is_flexible: false, rolls_over: false, sort_order: 3, starting_balance: 0 },
  ]);
  revalidatePath("/");
  revalidatePath("/budget");
}

/**
 * Wipe my data: deletes every budget row this account owns (RLS-scoped);
 * the account itself, admin status, and filed suggestions stay. Requires
 * the literal confirmation text — this one has no undo.
 */
export async function wipeMyData(formData: FormData) {
  if (str(formData, "confirm").trim() !== "DELETE") return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Order respects foreign keys; the rest cascades.
  const tables = [
    "whatif_items",
    "transfers",
    "expenses",
    "goals",
    "income_entries",
    "income_sources",
    "buckets",
    "assets",
    "liabilities",
    "net_worth_snapshots",
    "celebrated_paydays",
    "push_subscriptions",
    "calendar_tokens",
  ];
  for (const t of tables) {
    await supabase.from(t).delete().not("id", "is", null);
  }
  await supabase.from("shared_access").delete().eq("owner_id", user.id);
  revalidatePath("/");
  redirect("/");
}

/**
 * Auto-tune: apply a suggested refill change to a bucket. Undoable — the
 * old allocation comes back with one tap.
 */
export async function applyBucketTune(
  formData: FormData,
): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const value = num(formData, "value");
  if (!(value > 0)) return null;
  const { data: cur } = await supabase
    .from("buckets")
    .select("allocation_value")
    .eq("id", id)
    .single();
  if (!cur) return null;
  await supabase.from("buckets").update({ allocation_value: value }).eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
  return {
    patches: [
      { table: "buckets", id, patch: { allocation_value: Number(cur.allocation_value) } },
    ],
  };
}

/**
 * Work-hours lens: your hourly wage, stored on the auth user's metadata (no
 * table needed). With it set, spends can be shown as hours of your life.
 */
export async function setHourlyWage(formData: FormData) {
  const supabase = await createClient();
  const wage = num(formData, "hourly_wage");
  await supabase.auth.updateUser({
    data: { hourly_wage: wage > 0 ? wage : null },
  });
  revalidatePath("/settings");
  revalidatePath("/budget");
}

/**
 * Expense amount edits: the change applies AND the old→new gets logged, so
 * price creep on recurring bills is visible as a fact later.
 */
export async function updateExpenseAmount(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const amount = num(formData, "amount");
  if (!(amount > 0)) return;
  const { data: cur } = await supabase
    .from("expenses")
    .select("amount")
    .eq("id", id)
    .single();
  if (!cur || Number(cur.amount) === amount) return;
  await supabase.from("expense_amount_history").insert({
    expense_id: id,
    old_amount: Number(cur.amount),
    new_amount: amount,
  });
  await supabase.from("expenses").update({ amount }).eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
}

/**
 * Announcements: admin broadcast banner + per-user dismissals. RLS enforces
 * who can write (admins) and who can dismiss (each user, for themselves).
 */
export async function postAnnouncement(formData: FormData) {
  const supabase = await createClient();
  const message = str(formData, "message").trim().slice(0, 500);
  if (!message) return;
  await supabase.from("announcements").insert({ message });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function toggleAnnouncement(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("announcements")
    .update({ active: str(formData, "active") === "true" })
    .eq("id", str(formData, "id"));
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function deleteAnnouncement(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("announcements").delete().eq("id", str(formData, "id"));
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function dismissAnnouncement(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("announcement_dismissals")
    .upsert(
      { announcement_id: str(formData, "id") },
      { onConflict: "user_id,announcement_id", ignoreDuplicates: true },
    );
  revalidatePath("/");
}

/**
 * Suggestions: anyone signed in can drop one in the box; admins work the
 * inbox from /admin (status changes, deletes — enforced by RLS).
 */
export async function submitSuggestion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const message = str(formData, "message").trim().slice(0, 2000);
  if (!message) return;
  const kind = str(formData, "kind");
  // Context, not content: which screen and which build. Enough to reproduce,
  // nothing about the numbers on it.
  const route = str(formData, "route").slice(0, 120) || null;
  await supabase.from("suggestions").insert({
    message,
    email: user.email ?? null,
    kind: ["idea", "bug", "question"].includes(kind) ? kind : "idea",
    route,
    app_version: APP_VERSION,
  });
  revalidatePath("/settings");
  revalidatePath("/updates");
  revalidatePath("/admin");
}

/**
 * The other half of the loop: an admin answers a suggestion, and the person
 * who sent it sees the answer next time they open Updates. Existing RLS does
 * the enforcing — only admins may update a suggestion row, and everyone may
 * read their own.
 */
export async function replyToSuggestion(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const reply = str(formData, "reply").trim().slice(0, 2000);
  if (!id || !reply) return;
  await supabase
    .from("suggestions")
    .update({ reply, replied_at: new Date().toISOString(), status: "seen" })
    .eq("id", id);
  revalidatePath("/updates");
  revalidatePath("/admin");
}

export async function setSuggestionStatus(formData: FormData) {
  const supabase = await createClient();
  const status = str(formData, "status");
  if (!["new", "seen", "done"].includes(status)) return;
  await supabase
    .from("suggestions")
    .update({ status })
    .eq("id", str(formData, "id"));
  revalidatePath("/admin");
  revalidatePath("/updates");
}

export async function deleteSuggestion(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("suggestions").delete().eq("id", str(formData, "id"));
  revalidatePath("/admin");
}

/**
 * Calendar feed: create or rotate the per-user feed token. Rotating kills
 * the old URL immediately (anyone who had it loses access).
 */
export async function rotateCalendarToken() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("calendar_tokens")
    .upsert(
      { user_id: user.id, token: crypto.randomUUID() },
      { onConflict: "user_id" },
    );
  revalidatePath("/settings");
}

export async function deleteCalendarToken() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("calendar_tokens").delete().eq("user_id", user.id);
  revalidatePath("/settings");
}

/**
 * Household sharing (read-only): grant a viewer, by email, SELECT access to
 * your budget. They see your numbers exactly as you do; they can't touch
 * anything — RLS only ever extends reads.
 */
export async function addShare(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;
  const viewer = str(formData, "viewer_email").trim().toLowerCase();
  if (!viewer || !viewer.includes("@") || viewer === user.email.toLowerCase()) return;
  await supabase.from("shared_access").insert({
    owner_email: user.email,
    viewer_email: viewer,
  });
  revalidatePath("/settings");
}

export async function removeShare(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const row = await captureRow("shared_access", id);
  await supabase.from("shared_access").delete().eq("id", id);
  revalidatePath("/settings");
  return row ? { inserts: [{ table: "shared_access", row }] } : null;
}

/**
 * The OAuth path's legal moment: Google signups never saw the sign-up
 * checkbox, so /legal-accept collects the same acknowledgment before the
 * app opens up. Stored identically to the email path.
 */
export async function acknowledgeLegal(formData: FormData) {
  if (formData.get("legal_ack") !== "on") {
    redirect(
      `/legal-accept?error=${encodeURIComponent(
        "Check the box to continue — it matters that you know what this app is and isn't.",
      )}`,
    );
  }
  const supabase = await createClient();
  await supabase.auth.updateUser({
    data: { legal_accepted_at: new Date().toISOString() },
  });
  redirect("/");
}

// ---------------------------------------------------------------------------
// Undo (8E): routine actions apply instantly and return a recipe that can
// put things back; undoRestore executes it. RLS guarantees a user can only
// ever restore their own rows.
// ---------------------------------------------------------------------------

export interface UndoRecipe {
  inserts?: { table: string; row: Record<string, unknown> }[];
  patches?: { table: string; id: string; patch: Record<string, unknown> }[];
  /** Rows to delete on undo (reverses a bulk insert, e.g. a CSV import). */
  deletes?: { table: string; id: string }[];
}

const UNDOABLE_TABLES = new Set([
  "income_sources",
  "buckets",
  "expenses",
  "whatif_items",
  "net_worth_items",
  "income_entries",
  "assets",
  "liabilities",
  "goals",
  "transfers",
  "shared_access",
]);

export async function undoRestore(formData: FormData) {
  let recipe: UndoRecipe;
  try {
    recipe = JSON.parse(str(formData, "payload"));
  } catch {
    return;
  }
  const supabase = await createClient();
  for (const ins of recipe.inserts ?? []) {
    if (!UNDOABLE_TABLES.has(ins.table)) continue;
    await supabase.from(ins.table).insert(ins.row);
  }
  for (const p of recipe.patches ?? []) {
    if (!UNDOABLE_TABLES.has(p.table) || typeof p.id !== "string") continue;
    await supabase.from(p.table).update(p.patch).eq("id", p.id);
  }
  for (const d of recipe.deletes ?? []) {
    if (!UNDOABLE_TABLES.has(d.table) || typeof d.id !== "string") continue;
    await supabase.from(d.table).delete().eq("id", d.id);
  }
  // Undoing a net-worth change re-snapshots today so history stays truthful.
  const touched = [
    ...(recipe.inserts ?? []).map((i) => i.table),
    ...(recipe.patches ?? []).map((p) => p.table),
  ];
  if (touched.some((t) => t === "assets" || t === "liabilities")) {
    await writeSnapshot();
    revalidatePath("/net-worth");
  }
  revalidatePath("/");
}

/** Fetch a row before deleting it, so the delete can hand back an undo. */
async function captureRow(
  table: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("*").eq("id", id).single();
  return (data as Record<string, unknown>) ?? null;
}

// ---------------------------------------------------------------------------
// Transfers: move money between buckets on purpose. Balances derive from
// replay, so deleting a transfer un-moves the money.
// ---------------------------------------------------------------------------

export async function addTransfer(formData: FormData) {
  const supabase = await createClient();
  const from = str(formData, "from_bucket_id");
  const to = str(formData, "to_bucket_id");
  const amount = num(formData, "amount");
  if (from === to || !(amount > 0)) return;
  await supabase.from("transfers").insert({
    from_bucket_id: from || null,
    to_bucket_id: to || null,
    amount,
    transfer_date:
      str(formData, "transfer_date") || new Date().toISOString().slice(0, 10),
    note: str(formData, "note") || null,
  });
  revalidatePath("/");
  revalidatePath("/budget");
}

export async function deleteTransfer(
  formData: FormData,
): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const row = await captureRow("transfers", id);
  await supabase.from("transfers").delete().eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
  return row ? { inserts: [{ table: "transfers", row }] } : null;
}

// ---------------------------------------------------------------------------
// Income sources
// ---------------------------------------------------------------------------

export async function addIncome(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("income_sources").insert({
    name: str(formData, "name"),
    amount: num(formData, "amount"),
    frequency: str(formData, "frequency"),
    kind: str(formData, "kind") || "paycheck",
    anchor_date: str(formData, "anchor_date"),
  });
  revalidatePath("/");
}

export async function deleteIncome(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const row = await captureRow("income_sources", id);
  await supabase.from("income_sources").delete().eq("id", id);
  revalidatePath("/");
  return row ? { inserts: [{ table: "income_sources", row }] } : null;
}

// ---------------------------------------------------------------------------
// Logged income (8F): money as it actually arrives. Windfalls carry a split.
// ---------------------------------------------------------------------------

export async function logIncome(formData: FormData) {
  const supabase = await createClient();
  const amount = num(formData, "amount");
  const date = str(formData, "received_date");
  if (amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  const isWindfall = str(formData, "is_windfall") === "true";
  let allocation: { bucket_id: string | null; amount: number }[] | null = null;
  if (isWindfall) {
    try {
      const raw = JSON.parse(str(formData, "allocation"));
      if (Array.isArray(raw)) {
        allocation = raw
          .filter(
            (a) =>
              (a.bucket_id === null || typeof a.bucket_id === "string") &&
              Number(a.amount) > 0,
          )
          .map((a) => ({ bucket_id: a.bucket_id, amount: Number(a.amount) }));
        // A split can never hand out more than arrived.
        const total = allocation.reduce((s, a) => s + a.amount, 0);
        if (total > amount + 0.005) allocation = null;
      }
    } catch {
      allocation = null;
    }
  }

  await supabase.from("income_entries").insert({
    amount,
    received_date: date,
    note: str(formData, "note") || null,
    is_windfall: isWindfall,
    windfall_allocation: allocation,
  });
  revalidatePath("/");
}

export async function deleteIncomeEntry(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const row = await captureRow("income_entries", id);
  await supabase.from("income_entries").delete().eq("id", id);
  revalidatePath("/");
  return row ? { inserts: [{ table: "income_entries", row }] } : null;
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export async function addBucket(formData: FormData) {
  const supabase = await createClient();
  const isSavings = formData.get("is_savings") === "on";

  if (isSavings) {
    // Only one savings bucket allowed — demote any current one first.
    await supabase.from("buckets").update({ is_savings: false }).eq("is_savings", true);
  }
  await supabase.from("buckets").insert({
    name: str(formData, "name"),
    allocation_type: str(formData, "allocation_type"),
    allocation_value: num(formData, "allocation_value"),
    is_savings: isSavings,
    is_flexible: formData.get("is_flexible") === "on",
    rolls_over: formData.get("rolls_over") === "on",
    apy: num(formData, "apy"),
    starting_balance: num(formData, "starting_balance"),
  });
  revalidatePath("/");
}

export async function toggleBucketRollsOver(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("buckets")
    .update({ rolls_over: str(formData, "rolls_over") === "true" })
    .eq("id", str(formData, "id"));
  revalidatePath("/");
}

/**
 * Three-question onboarding, submitted in one go: income setup (regular
 * schedule or irregular with logged history) plus a starter bucket template.
 * Guarded so it can never overwrite an existing setup.
 */
export async function completeOnboarding(formData: FormData) {
  let payload: {
    mode?: string;
    amount?: number;
    frequency?: string;
    nextPayday?: string;
    entries?: { amount?: number; date?: string }[];
    template?: string;
  };
  try {
    payload = JSON.parse(str(formData, "payload"));
  } catch {
    return;
  }
  const template = getTemplate(payload.template ?? "");
  if (!template) return;

  const supabase = await createClient();
  const { count: bucketCount } = await supabase
    .from("buckets")
    .select("id", { count: "exact", head: true });
  if ((bucketCount ?? 0) > 0) return; // already set up — never clobber

  const { count: incomeCount } = await supabase
    .from("income_sources")
    .select("id", { count: "exact", head: true });

  const isDate = (s: unknown): s is string =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

  if ((incomeCount ?? 0) === 0) {
    if (payload.mode === "irregular") {
      await supabase.from("income_sources").insert({
        name: "My income",
        amount: 0,
        frequency: "irregular",
        kind: "paycheck",
        anchor_date: new Date().toISOString().slice(0, 10),
      });
      const entries = (payload.entries ?? [])
        .filter((e) => Number(e.amount) > 0 && isDate(e.date))
        .slice(0, 12)
        .map((e) => ({ amount: Number(e.amount), received_date: e.date! }));
      if (entries.length > 0) {
        await supabase.from("income_entries").insert(entries);
      }
    } else if (
      Number(payload.amount) > 0 &&
      ["weekly", "biweekly", "semimonthly", "monthly"].includes(payload.frequency ?? "") &&
      isDate(payload.nextPayday)
    ) {
      await supabase.from("income_sources").insert({
        name: "My paycheck",
        amount: Number(payload.amount),
        frequency: payload.frequency,
        kind: "paycheck",
        anchor_date: payload.nextPayday,
      });
    }
  }

  await supabase.from("buckets").insert(template.buckets);
  revalidatePath("/");
}

/**
 * One-tap fix for a shortfall warning: set aside a little more from every
 * paycheck into the short bucket. Fixed buckets get the dollars added to
 * their refill; percent buckets get the equivalent percent bump, sized
 * against the smallest paycheck (rounded up) so it covers on every check.
 */
export async function applyShortfallFix(formData: FormData) {
  const supabase = await createClient();
  const bucketId = str(formData, "bucket_id");
  const extra = num(formData, "extra");
  if (!bucketId || extra <= 0) return;

  const { data: bucket } = await supabase
    .from("buckets")
    .select("allocation_type, allocation_value, is_savings")
    .eq("id", bucketId)
    .single();
  if (!bucket || bucket.is_savings) return;

  if (bucket.allocation_type === "fixed") {
    await supabase
      .from("buckets")
      .update({ allocation_value: Number(bucket.allocation_value) + extra })
      .eq("id", bucketId);
  } else {
    const { data: sources } = await supabase
      .from("income_sources")
      .select("amount")
      .eq("kind", "paycheck")
      .gt("amount", 0);
    const amounts = (sources ?? []).map((s) => Number(s.amount));
    if (amounts.length === 0) return;
    const smallest = Math.min(...amounts);
    const bump = Math.ceil((extra / smallest) * 10000) / 100; // % with 2dp, up
    await supabase
      .from("buckets")
      .update({ allocation_value: Number(bucket.allocation_value) + bump })
      .eq("id", bucketId);
  }
  revalidatePath("/");
}

/**
 * One-tap fix for an underfunded fixed bucket: shrink its refill to what a
 * paycheck can actually cover, so the plan matches reality.
 */
export async function rightSizeBucket(formData: FormData) {
  const supabase = await createClient();
  const value = num(formData, "value");
  await supabase
    .from("buckets")
    .update({ allocation_value: value })
    .eq("id", str(formData, "bucket_id"))
    .eq("allocation_type", "fixed");
  revalidatePath("/");
}

export async function setBucketGoal(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("buckets")
    .update({ goal_amount: num(formData, "goal_amount") })
    .eq("id", str(formData, "id"));
  revalidatePath("/");
}

/**
 * Mark a payday's celebration as seen so it never shows again — and send the
 * payday recap email exactly once, keyed off the same insert: the upsert with
 * ignoreDuplicates only returns a row when it actually inserted one, so a
 * double-submit can neither error nor double-send.
 */
export async function celebratePayday(formData: FormData) {
  const supabase = await createClient();
  const payday = str(formData, "payday");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payday)) return;

  const { data: inserted } = await supabase
    .from("celebrated_paydays")
    .upsert({ payday }, { onConflict: "user_id,payday", ignoreDuplicates: true })
    .select("id");

  if (inserted && inserted.length > 0) {
    try {
      await sendPaydayRecapEmail(payday);
    } catch (e) {
      // Email is a nice-to-have; never let it break the dismissal.
      console.error("payday recap email failed:", e);
    }
  }
  revalidatePath("/");
}

/** Rebuild the recap the celebration screen showed and email it to the user. */
async function sendPaydayRecapEmail(payday: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;

  const data = await getDashboardData();
  const savingsRow = data.buckets.find((b) => b.is_savings);
  const liquid = data.netWorth
    .filter((i) => i.kind === "asset" && LIQUID_CATEGORIES.includes(i.category))
    .reduce((sum, i) => sum + Number(i.amount), 0);
  const startingSavings =
    savingsRow && Number(savingsRow.starting_balance) > 0
      ? Number(savingsRow.starting_balance)
      : liquid;

  const recap = paydayRecap(
    data.income.map(incomeToEngine),
    data.buckets.map(bucketToEngine),
    data.expenses.map(expenseToEngine),
    startingSavings,
    new Date().toISOString().slice(0, 10),
  );
  if (!recap || recap.payday !== payday) return; // stale dismissal — skip

  const meta = user.user_metadata as Record<string, unknown>;
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    user.email.split("@")[0];
  const goal = savingsRow ? Number(savingsRow.goal_amount) : 0;

  await sendEmail(buildPaydayRecapEmail(user.email, name, recap, goal));
}

/**
 * Pause / resume a bucket or expense (8G). Paused buckets stop refilling and
 * sweeping; paused expenses stop deducting. Returns an undo recipe so the
 * toast can flip it right back.
 */
export async function togglePaused(formData: FormData): Promise<UndoRecipe | null> {
  const table = str(formData, "table");
  if (table !== "buckets" && table !== "expenses") return null;
  const id = str(formData, "id");
  const paused = str(formData, "paused") === "true";

  const supabase = await createClient();
  await supabase.from(table).update({ is_paused: paused }).eq("id", id);
  revalidatePath("/");
  return { patches: [{ table, id, patch: { is_paused: !paused } }] };
}

export async function toggleBucketFlexible(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("buckets")
    .update({ is_flexible: str(formData, "flexible") === "true" })
    .eq("id", str(formData, "id"));
  revalidatePath("/");
}

export async function setBucketStartingBalance(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("buckets")
    .update({ starting_balance: num(formData, "starting_balance") })
    .eq("id", str(formData, "id"));
  revalidatePath("/");
}

export async function setBucketApy(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("buckets")
    .update({ apy: num(formData, "apy") })
    .eq("id", str(formData, "id"));
  revalidatePath("/");
}

export async function deleteBucket(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const row = await captureRow("buckets", id);
  if (!row) return null;

  // Deleting a bucket nulls the bucket_id on its expenses and what-ifs, so
  // the undo recipe restores those links too.
  const [{ data: exps }, { data: wifs }] = await Promise.all([
    supabase.from("expenses").select("id").eq("bucket_id", id),
    supabase.from("whatif_items").select("id").eq("bucket_id", id),
  ]);

  await supabase.from("buckets").delete().eq("id", id);
  revalidatePath("/");
  return {
    inserts: [{ table: "buckets", row }],
    patches: [
      ...(exps ?? []).map((e) => ({
        table: "expenses",
        id: e.id as string,
        patch: { bucket_id: id },
      })),
      ...(wifs ?? []).map((w) => ({
        table: "whatif_items",
        id: w.id as string,
        patch: { bucket_id: id },
      })),
    ],
  };
}

export async function makeSavingsBucket(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("buckets").update({ is_savings: false }).eq("is_savings", true);
  await supabase
    .from("buckets")
    .update({ is_savings: true })
    .eq("id", str(formData, "id"));
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export async function addExpense(formData: FormData) {
  const supabase = await createClient();
  const bucketId = str(formData, "bucket_id");
  const owner = str(formData, "owner");
  const row: Record<string, unknown> = {
    name: str(formData, "name"),
    amount: num(formData, "amount"),
    bucket_id: bucketId || null,
    due_date: str(formData, "due_date"),
    cadence: str(formData, "cadence"),
  };
  // Partner mode: logging into someone else's budget requires their can_edit
  // grant — checked here for a clean no-op, enforced again by RLS.
  if (owner) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && owner !== user.id) {
      const { data: grant } = await supabase
        .from("shared_access")
        .select("id")
        .eq("owner_id", owner)
        .eq("can_edit", true)
        .maybeSingle();
      if (!grant) return;
      row.user_id = owner;
    }
  }
  await supabase.from("expenses").insert(row);
  // Round-up rule: only on YOUR OWN one-time spends (a partner's round-up
  // would land in their transfers, not this budget).
  if (!row.user_id && str(formData, "cadence") === "one_time") {
    await applyRoundup(supabase, num(formData, "amount"), bucketId || null);
  }
  revalidatePath("/");
  revalidatePath("/budget");
}

/**
 * Ctrl+K natural logging: "12.50 mcdonalds" → a one-time spend from the fun
 * bucket, today. Parsing lives server-side so the palette stays data-free.
 */
export async function quickLogSpend(
  formData: FormData,
): Promise<{ ok: boolean; name?: string; amount?: number; bucketName?: string }> {
  const supabase = await createClient();
  const m = str(formData, "text")
    .trim()
    .match(/^\$?(\d+(?:\.\d{1,2})?)\s+(.{2,60})$/);
  if (!m) return { ok: false };
  const amount = Number(m[1]);
  const name = m[2].trim();
  if (!(amount > 0)) return { ok: false };
  const { data: fun } = await supabase
    .from("buckets")
    .select("id, name")
    .eq("is_flexible", true)
    .eq("is_savings", false)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  await supabase.from("expenses").insert({
    name,
    amount,
    bucket_id: fun?.id ?? null,
    due_date: new Date().toISOString().slice(0, 10),
    cadence: "one_time",
  });
  await applyRoundup(supabase, amount, fun?.id ?? null);
  revalidatePath("/");
  revalidatePath("/budget");
  return { ok: true, name, amount, bucketName: fun?.name ?? "Savings / leftover" };
}

/** Roommate mode: how many ways a bill is split (1 clears it). */
export async function setSplitWays(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const ways = Math.round(num(formData, "split_ways"));
  if (ways < 1 || ways > 12) return;
  await supabase.from("expenses").update({ split_ways: ways }).eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
}

/** Weekly review: mark this week's check-in done (idempotent per week). */
export async function completeReview(formData: FormData) {
  const supabase = await createClient();
  const weekStart = str(formData, "week_start");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return;
  await supabase
    .from("review_checkins")
    .upsert({ week_start: weekStart }, { onConflict: "user_id,week_start", ignoreDuplicates: true });
  revalidatePath("/");
  revalidatePath("/review");
}

/**
 * First-run coach marks: remember which tabs someone has already been shown
 * a tip on. Stored on the auth user rather than in localStorage so the tour
 * doesn't start over on their phone after they've seen it on a laptop.
 */
export async function dismissCoachMark(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const key = str(formData, "key").slice(0, 40);
  if (!key) return;
  const seen = Array.isArray(user.user_metadata?.coach_seen)
    ? (user.user_metadata.coach_seen as string[])
    : [];
  if (seen.includes(key)) return;
  await supabase.auth.updateUser({ data: { coach_seen: [...seen, key] } });
  revalidatePath("/", "layout");
}

/** Challenges: start/stop lives in user metadata (no tables, no ceremony). */
export async function setChallenge(formData: FormData) {
  const supabase = await createClient();
  const kind = str(formData, "kind"); // "nospend" | "week52"
  const on = str(formData, "state") === "start";
  if (!["nospend", "week52"].includes(kind)) return;
  await supabase.auth.updateUser({
    data: {
      [`challenge_${kind}_start`]: on ? new Date().toISOString().slice(0, 10) : null,
    },
  });
  revalidatePath("/");
  revalidatePath("/budget");
}

/**
 * Bank reconciliation: the user types their REAL bank balance; we book the
 * drift as an honest adjustment — unlogged spending (expense) or unlogged
 * income (income entry) — so the model snaps back to reality. Undoable.
 */
export async function reconcile(
  formData: FormData,
): Promise<{ ok: boolean; drift?: number; recipe?: UndoRecipe | null }> {
  const supabase = await createClient();
  const bank = num(formData, "bank_balance");
  const model = num(formData, "model_balance");
  if (!Number.isFinite(bank) || !Number.isFinite(model)) return { ok: false };
  const drift = Math.round((bank - model) * 100) / 100;
  if (Math.abs(drift) < 0.01) return { ok: true, drift: 0, recipe: null };

  const today = new Date().toISOString().slice(0, 10);
  let recipe: UndoRecipe | null = null;
  if (drift < 0) {
    const { data: row } = await supabase
      .from("expenses")
      .insert({
        name: "Reconcile: unlogged spending",
        amount: -drift,
        bucket_id: null,
        due_date: today,
        cadence: "one_time",
      })
      .select("id")
      .single();
    if (row) recipe = { deletes: [{ table: "expenses", id: row.id }] };
  } else {
    const { data: row } = await supabase
      .from("income_entries")
      .insert({
        amount: drift,
        received_date: today,
        note: "Reconcile: unlogged income",
      })
      .select("id")
      .single();
    if (row) recipe = { deletes: [{ table: "income_entries", id: row.id }] };
  }
  revalidatePath("/");
  revalidatePath("/budget");
  return { ok: true, drift, recipe };
}

/** Quick-spend presets: up to 6 one-tap chips, stored on the auth user. */
export async function saveSpendPreset(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const name = str(formData, "name").trim().slice(0, 30);
  const amount = num(formData, "amount");
  if (!name || !(amount > 0)) return;
  const current = Array.isArray(user.user_metadata?.spend_presets)
    ? (user.user_metadata.spend_presets as { name: string; amount: number }[])
    : [];
  const next = [...current.filter((p) => p.name !== name), { name, amount }].slice(0, 6);
  await supabase.auth.updateUser({ data: { spend_presets: next } });
  revalidatePath("/");
}

export async function removeSpendPreset(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const name = str(formData, "name");
  const current = Array.isArray(user.user_metadata?.spend_presets)
    ? (user.user_metadata.spend_presets as { name: string; amount: number }[])
    : [];
  await supabase.auth.updateUser({
    data: { spend_presets: current.filter((p) => p.name !== name) },
  });
  revalidatePath("/");
}

/** Round-up rule: 0 = off, else round each logged spend up to the next $N. */
export async function setRoundup(formData: FormData) {
  const supabase = await createClient();
  const to = num(formData, "roundup_to");
  await supabase.auth.updateUser({
    data: { roundup_to: [1, 5].includes(to) ? to : null },
  });
  revalidatePath("/settings");
}

/**
 * Round-up bookkeeping shared by the spend paths: move the spare change from
 * the spend's bucket into savings, marked so the user can see the rule work.
 */
async function applyRoundup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  amount: number,
  bucketId: string | null,
) {
  if (!bucketId) return; // savings-funded spends have no bucket to skim
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const to = user?.user_metadata?.roundup_to;
  if (to !== 1 && to !== 5) return;
  const roundup = Math.round((Math.ceil(amount / to) * to - amount) * 100) / 100;
  if (roundup <= 0) return;
  await supabase.from("transfers").insert({
    from_bucket_id: bucketId,
    to_bucket_id: null,
    amount: roundup,
    transfer_date: new Date().toISOString().slice(0, 10),
    note: "round-up",
  });
}

/** Notification preferences: which nudge types may reach the lock screen. */
export async function saveNudgePrefs(formData: FormData) {
  const supabase = await createClient();
  const prefs: Record<string, boolean> = {};
  for (const key of ["bill-underfunded", "payday-tomorrow", "renewal-soon", "danger-tomorrow", "manual-due", "autopay-check"]) {
    prefs[key] = formData.get(`pref_${key}`) === "on";
  }
  await supabase.auth.updateUser({ data: { nudge_prefs: prefs } });
  revalidatePath("/settings");
}

/** Split tuner: apply several bucket allocation changes at once, undoably. */
export async function applySplitTune(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  let changes: { id: string; value: number }[];
  try {
    changes = JSON.parse(str(formData, "changes"));
  } catch {
    return null;
  }
  const patches: NonNullable<UndoRecipe["patches"]> = [];
  for (const c of changes) {
    if (typeof c.id !== "string" || !(c.value >= 0)) continue;
    const { data: cur } = await supabase
      .from("buckets")
      .select("allocation_value")
      .eq("id", c.id)
      .single();
    if (!cur || Number(cur.allocation_value) === c.value) continue;
    await supabase.from("buckets").update({ allocation_value: c.value }).eq("id", c.id);
    patches.push({
      table: "buckets",
      id: c.id,
      patch: { allocation_value: Number(cur.allocation_value) },
    });
  }
  revalidatePath("/");
  revalidatePath("/budget");
  return patches.length > 0 ? { patches } : null;
}

/**
 * Cycle-end debt sweep: kept money goes at a debt. Books the outflow as a
 * one-time expense from savings AND decrements the liability balance —
 * one undo puts both back.
 */
export async function applyDebtSweep(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const liabilityId = str(formData, "liability_id");
  const amount = num(formData, "amount");
  if (!liabilityId || !(amount > 0)) return null;
  const { data: liability } = await supabase
    .from("liabilities")
    .select("id, name, current_balance")
    .eq("id", liabilityId)
    .single();
  if (!liability) return null;
  const applied = Math.min(amount, Number(liability.current_balance));
  if (!(applied > 0)) return null;

  const newBalance = Math.round((Number(liability.current_balance) - applied) * 100) / 100;
  await supabase.from("liabilities").update({ current_balance: newBalance }).eq("id", liabilityId);
  const { data: row } = await supabase
    .from("expenses")
    .insert({
      name: `Extra payment: ${liability.name}`,
      amount: applied,
      bucket_id: null,
      due_date: new Date().toISOString().slice(0, 10),
      cadence: "one_time",
    })
    .select("id")
    .single();

  revalidatePath("/");
  revalidatePath("/budget");
  revalidatePath("/net-worth");
  return {
    patches: [
      {
        table: "liabilities",
        id: liabilityId,
        patch: { current_balance: Number(liability.current_balance) },
      },
    ],
    ...(row ? { deletes: [{ table: "expenses", id: row.id }] } : {}),
  };
}

/**
 * Pass-through pairing: mark a bill as funded by a specific income source
 * (rent → that property's mortgage), or clear the link.
 */
export async function setFundedBy(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const incomeId = str(formData, "funded_by_income_id");
  if (incomeId) {
    // Only link to an income source you own (RLS would block anyway).
    const { data: src } = await supabase
      .from("income_sources")
      .select("id")
      .eq("id", incomeId)
      .maybeSingle();
    if (!src) return;
  }
  await supabase
    .from("expenses")
    .update({ funded_by_income_id: incomeId || null })
    .eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
}

/** Autopay audit: classify a bill (autopay / manual / unset). */
export async function setAutopay(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const mode = str(formData, "autopay"); // "true" | "false" | ""
  await supabase
    .from("expenses")
    .update({ autopay: mode === "" ? null : mode === "true" })
    .eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
}

/** Contract watch: set (or clear) the date a bill's contract renews. */
export async function setRenewalDate(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const date = str(formData, "renewal_date");
  await supabase
    .from("expenses")
    .update({ renewal_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null })
    .eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
}

/** Emergency fund target, in months of bills (0 clears it). */
export async function setEfundTarget(formData: FormData) {
  const supabase = await createClient();
  const months = num(formData, "months");
  await supabase.auth.updateUser({
    data: { ef_months: [1, 3, 6].includes(months) ? months : null },
  });
  revalidatePath("/");
}

/** Partner mode: flip a sharing grant between read-only and can-edit. */
export async function toggleShareEdit(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const canEdit = str(formData, "can_edit") === "true";
  await supabase.from("shared_access").update({ can_edit: canEdit }).eq("id", id);
  revalidatePath("/settings");
}

/**
 * Bulk-import spends from a CSV (8: catch up after a lazy week). Rows arrive
 * as JSON [{name, amount, due_date}]; every row gets ALL keys explicitly
 * (PostgREST fills missing keys with NULL, not column defaults). Returns a
 * deletes-recipe so one Undo removes the whole import.
 */
export async function bulkAddExpenses(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const bucketId = str(formData, "bucket_id") || null;
  let rows: { name: string; amount: number; due_date: string }[];
  try {
    rows = JSON.parse(str(formData, "rows"));
  } catch {
    return null;
  }
  const clean = rows
    .filter(
      (r) =>
        typeof r.name === "string" &&
        r.name.length > 0 &&
        Number(r.amount) > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(r.due_date)),
    )
    .slice(0, 500)
    .map((r) => ({
      name: String(r.name).slice(0, 120),
      amount: Number(r.amount),
      bucket_id: bucketId,
      due_date: r.due_date,
      cadence: "one_time",
      is_paused: false,
    }));
  if (clean.length === 0) return null;

  const { data } = await supabase.from("expenses").insert(clean).select("id");
  revalidatePath("/");
  revalidatePath("/budget");
  const ids = (data ?? []).map((d) => d.id as string);
  return ids.length > 0
    ? { deletes: ids.map((id) => ({ table: "expenses", id })) }
    : null;
}

/**
 * Statement Drop import: like bulkAddExpenses, but each row carries its own
 * bucket (the auto-categorized mapping, possibly overridden in the preview).
 * Bucket ids that aren't the user's own are nulled to savings/leftover.
 */
export async function bulkAddExpensesTagged(
  formData: FormData,
): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  let rows: { name: string; amount: number; due_date: string; bucket_id?: string | null }[];
  try {
    rows = JSON.parse(str(formData, "rows"));
  } catch {
    return null;
  }
  const { data: myBuckets } = await supabase.from("buckets").select("id");
  const mine = new Set((myBuckets ?? []).map((b) => b.id as string));

  const clean = rows
    .filter(
      (r) =>
        typeof r.name === "string" &&
        r.name.length > 0 &&
        Number(r.amount) > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(r.due_date)),
    )
    .slice(0, 500)
    .map((r) => ({
      name: String(r.name).slice(0, 120),
      amount: Number(r.amount),
      bucket_id: r.bucket_id && mine.has(r.bucket_id) ? r.bucket_id : null,
      due_date: r.due_date,
      cadence: "one_time",
      is_paused: false,
    }));
  if (clean.length === 0) return null;

  const { data } = await supabase.from("expenses").insert(clean).select("id");
  revalidatePath("/");
  revalidatePath("/budget");
  const ids = (data ?? []).map((d) => d.id as string);
  return ids.length > 0
    ? { deletes: ids.map((id) => ({ table: "expenses", id })) }
    : null;
}

/** Re-point a bill at a different bucket ("McDonalds should come out of Food"). */
export async function updateExpenseBucket(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const bucketId = str(formData, "bucket_id") || null;

  const { data: old } = await supabase
    .from("expenses")
    .select("bucket_id")
    .eq("id", id)
    .single();
  if (old === null) return null;
  await supabase.from("expenses").update({ bucket_id: bucketId }).eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
  return {
    patches: [
      { table: "expenses", id, patch: { bucket_id: old.bucket_id as string | null } },
    ],
  };
}

export async function deleteExpense(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const row = await captureRow("expenses", id);
  await supabase.from("expenses").delete().eq("id", id);
  revalidatePath("/");
  return row ? { inserts: [{ table: "expenses", row }] } : null;
}

// ---------------------------------------------------------------------------
// Goals: things worth saving toward.
// ---------------------------------------------------------------------------

export async function addGoal(formData: FormData) {
  const supabase = await createClient();
  const target = num(formData, "target_amount");
  const date = str(formData, "target_date");
  if (target <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await supabase.from("goals").insert({
    name: str(formData, "name"),
    target_amount: target,
    target_date: date,
    notes: str(formData, "notes") || null,
  });
  revalidatePath("/");
  revalidatePath("/budget");
}

export async function deleteGoal(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const row = await captureRow("goals", id);
  await supabase.from("goals").delete().eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
  return row ? { inserts: [{ table: "goals", row }] } : null;
}

export async function markGoalAchieved(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  await supabase
    .from("goals")
    .update({ achieved_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/");
  revalidatePath("/budget");
  return { patches: [{ table: "goals", id, patch: { achieved_at: null } }] };
}

// ---------------------------------------------------------------------------
// Net Worth module (phase 9): assets, liabilities, automatic daily snapshots,
// and the opt-in budget bridge.
// ---------------------------------------------------------------------------

const ASSET_CATS = new Set([
  "cash", "savings", "investment", "retirement", "property", "vehicle", "other",
]);
const LIABILITY_CATS = new Set([
  "credit_card", "auto_loan", "student_loan", "mortgage", "personal_loan", "other",
]);

/** Budget savings balance for the bridge — 0 unless the savings bucket opted in. */
async function bridgeValue(): Promise<number> {
  const data = await getDashboardData();
  const savings = data.buckets.find((b) => b.is_savings);
  if (!savings || !savings.include_in_net_worth) return 0;

  const liquid = data.netWorth
    .filter((i) => i.kind === "asset" && LIQUID_CATEGORIES.includes(i.category))
    .reduce((sum, i) => sum + Number(i.amount), 0);
  const startingSavings =
    Number(savings.starting_balance) > 0 ? Number(savings.starting_balance) : liquid;
  const recap = paydayRecap(
    data.income.map(incomeToEngine),
    data.buckets.map(bucketToEngine),
    data.expenses.map(expenseToEngine),
    startingSavings,
    new Date().toISOString().slice(0, 10),
    data.incomeEntries.map(incomeEntryToEngine),
  );
  return recap?.savingsTotal ?? startingSavings;
}

/**
 * Write (or overwrite) today's snapshot — called after every value change, so
 * history accrues automatically: at most one row per user per day.
 */
async function writeSnapshot(): Promise<void> {
  const supabase = await createClient();
  const [{ data: assets }, { data: liabilities }, bridge] = await Promise.all([
    supabase.from("assets").select("current_value, is_archived"),
    supabase.from("liabilities").select("current_balance, is_archived"),
    bridgeValue(),
  ]);
  const totals = computeTotals(assets ?? [], liabilities ?? [], bridge);
  await supabase.from("net_worth_snapshots").upsert(
    {
      snapshot_date: new Date().toISOString().slice(0, 10),
      total_assets: totals.totalAssets,
      total_liabilities: totals.totalLiabilities,
      net_worth: totals.netWorth,
    },
    { onConflict: "user_id,snapshot_date" },
  );
}

function revalidateNetWorth() {
  revalidatePath("/");
  revalidatePath("/net-worth");
}

export async function addAsset(formData: FormData) {
  const category = str(formData, "category");
  if (!ASSET_CATS.has(category)) return;
  const supabase = await createClient();
  await supabase.from("assets").insert({
    name: str(formData, "name"),
    category,
    current_value: num(formData, "current_value"),
    notes: str(formData, "notes") || null,
  });
  await writeSnapshot();
  revalidateNetWorth();
}

export async function addLiability(formData: FormData) {
  const category = str(formData, "category");
  if (!LIABILITY_CATS.has(category)) return;
  const supabase = await createClient();
  const rate = num(formData, "interest_rate");
  const payment = num(formData, "minimum_payment");
  await supabase.from("liabilities").insert({
    name: str(formData, "name"),
    category,
    current_balance: num(formData, "current_balance"),
    interest_rate: rate > 0 ? rate : null,
    minimum_payment: payment > 0 ? payment : 0,
    notes: str(formData, "notes") || null,
  });
  await writeSnapshot();
  revalidateNetWorth();
}

/** Set a liability's monthly payment (powers the dashboard payoff math).
 * Plain form action like the other "set" forms — re-setting is its own undo. */
export async function setLiabilityPayment(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const payment = num(formData, "minimum_payment");
  await supabase
    .from("liabilities")
    .update({ minimum_payment: payment > 0 ? payment : 0 })
    .eq("id", id);
  revalidateNetWorth();
  revalidatePath("/");
}

/** Inline value edit (9B): auto-saves, snapshots, and hands back an undo. */
export async function updateItemValue(formData: FormData): Promise<UndoRecipe | null> {
  const table = str(formData, "table");
  if (table !== "assets" && table !== "liabilities") return null;
  const field = table === "assets" ? "current_value" : "current_balance";
  const id = str(formData, "id");
  const value = num(formData, "value");

  const supabase = await createClient();
  const { data: old } = await supabase.from(table).select(field).eq("id", id).single();
  if (!old) return null;
  await supabase.from(table).update({ [field]: value }).eq("id", id);
  await writeSnapshot();
  revalidateNetWorth();
  return {
    patches: [{ table, id, patch: { [field]: Number((old as Record<string, unknown>)[field]) } }],
  };
}

export async function toggleArchived(formData: FormData): Promise<UndoRecipe | null> {
  const table = str(formData, "table");
  if (table !== "assets" && table !== "liabilities") return null;
  const id = str(formData, "id");
  const archived = str(formData, "archived") === "true";

  const supabase = await createClient();
  await supabase.from(table).update({ is_archived: archived }).eq("id", id);
  await writeSnapshot();
  revalidateNetWorth();
  return { patches: [{ table, id, patch: { is_archived: !archived } }] };
}

/** 9D: the savings bucket opting in/out of appearing as a read-only asset. */
export async function toggleNetWorthBridge(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("buckets")
    .update({ include_in_net_worth: str(formData, "enabled") === "true" })
    .eq("id", str(formData, "id"))
    .eq("is_savings", true);
  await writeSnapshot();
  revalidateNetWorth();
}

// ---------------------------------------------------------------------------
// Net worth items
// ---------------------------------------------------------------------------

const ASSET_CATEGORIES = new Set([
  "cash", "savings", "investment", "property", "vehicle", "other_asset",
]);
const LIABILITY_CATEGORIES = new Set([
  "credit_card", "student_loan", "auto_loan", "mortgage", "other_debt",
]);

export async function addNetWorthItem(formData: FormData) {
  const supabase = await createClient();
  const kind = str(formData, "kind");
  const category = str(formData, "category");
  const valid =
    (kind === "asset" && ASSET_CATEGORIES.has(category)) ||
    (kind === "liability" && LIABILITY_CATEGORIES.has(category));
  if (!valid) return;

  await supabase.from("net_worth_items").insert({
    name: str(formData, "name"),
    kind,
    category,
    amount: num(formData, "amount"),
    apy: num(formData, "apy"),
  });
  revalidatePath("/");
}

export async function deleteNetWorthItem(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const row = await captureRow("net_worth_items", id);
  await supabase.from("net_worth_items").delete().eq("id", id);
  revalidatePath("/");
  return row ? { inserts: [{ table: "net_worth_items", row }] } : null;
}

// ---------------------------------------------------------------------------
// What-if items
// ---------------------------------------------------------------------------

export async function addWhatIf(formData: FormData) {
  const supabase = await createClient();
  const bucketId = str(formData, "bucket_id");
  await supabase.from("whatif_items").insert({
    name: str(formData, "name"),
    amount: num(formData, "amount"),
    target_date: str(formData, "target_date"),
    bucket_id: bucketId || null,
    status: "considering",
  });
  revalidatePath("/");
}

/** Step 1 of buying: start the 48-hour cooling-off timer. */
export async function startCoolingOff(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("whatif_items")
    .update({ cooling_off_started_at: new Date().toISOString() })
    .eq("id", str(formData, "id"))
    .eq("status", "considering")
    .is("cooling_off_started_at", null);
  revalidatePath("/");
}

export async function decideWhatIf(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const status = str(formData, "status"); // "bought" | "skipped"
  if (status !== "bought" && status !== "skipped") return null;

  // Server-side enforcement of the cooling-off rule: "bought" is only valid
  // once the 48h timer has been started AND has fully expired. Skipping is
  // allowed any time.
  if (status === "bought") {
    const { data: item } = await supabase
      .from("whatif_items")
      .select("cooling_off_started_at")
      .eq("id", str(formData, "id"))
      .single();
    const state = coolingState(
      (item?.cooling_off_started_at as string | null) ?? null,
      Date.now(),
    );
    if (state.phase !== "ready") return null; // timer missing or still running
  }

  const id = str(formData, "id");
  await supabase
    .from("whatif_items")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/");
  return {
    patches: [
      {
        table: "whatif_items",
        id,
        patch: { status: "considering", decided_at: null },
      },
    ],
  };
}

export async function deleteWhatIf(formData: FormData): Promise<UndoRecipe | null> {
  const supabase = await createClient();
  const id = str(formData, "id");
  const row = await captureRow("whatif_items", id);
  await supabase.from("whatif_items").delete().eq("id", id);
  revalidatePath("/");
  return row ? { inserts: [{ table: "whatif_items", row }] } : null;
}
