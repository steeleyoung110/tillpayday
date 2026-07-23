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
  "income_entries",
  "assets",
  "liabilities",
  "goals",
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
  await supabase.from("liabilities").insert({
    name: str(formData, "name"),
    category,
    current_balance: num(formData, "current_balance"),
    interest_rate: rate > 0 ? rate : null,
    notes: str(formData, "notes") || null,
  });
  await writeSnapshot();
  revalidateNetWorth();
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
