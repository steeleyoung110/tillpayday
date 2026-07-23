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
import { coolingState } from "@/lib/coolingOff";
import { getDashboardData } from "@/lib/data";
import { buildPaydayRecapEmail } from "@/lib/email/paydayRecap";
import { sendEmail } from "@/lib/email/send";
import { paydayRecap } from "@/lib/engine";
import {
  LIQUID_CATEGORIES,
  bucketToEngine,
  expenseToEngine,
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
  const supabase = await createClient();
  const name = str(formData, "name");
  const { data, error } = await supabase.auth.signUp({
    email: str(formData, "email"),
    password: String(formData.get("password") ?? ""),
    options: name ? { data: { full_name: name } } : undefined,
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

// ---------------------------------------------------------------------------
// Undo (8E): routine actions apply instantly and return a recipe that can
// put things back; undoRestore executes it. RLS guarantees a user can only
// ever restore their own rows.
// ---------------------------------------------------------------------------

export interface UndoRecipe {
  inserts?: { table: string; row: Record<string, unknown> }[];
  patches?: { table: string; id: string; patch: Record<string, unknown> }[];
}

const UNDOABLE_TABLES = new Set([
  "income_sources",
  "buckets",
  "expenses",
  "whatif_items",
  "net_worth_items",
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
  await supabase.from("expenses").insert({
    name: str(formData, "name"),
    amount: num(formData, "amount"),
    bucket_id: bucketId || null,
    due_date: str(formData, "due_date"),
    cadence: str(formData, "cadence"),
  });
  revalidatePath("/");
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
