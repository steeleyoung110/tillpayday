"use server";

/**
 * Server Actions for the ops board and rent payment plans. Same contract as
 * the property actions: the signed-in user's Supabase session, RLS keeping
 * everyone in their own rows, and a revalidate of every page that shows the
 * data. Each action checks the session itself, since actions are reachable by
 * direct POST.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isISODate, nextDue, todayIn } from "@/lib/ops/board";
import type { OpsRepeat, RentFrequency } from "@/lib/ops/rows";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const FAIL: ActionResult = { ok: false, error: "That didn't save. Check your connection and try again." };

function str(form: FormData, key: string, max = 500): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}
function optStr(form: FormData, key: string, max = 500): string | null {
  const s = str(form, key, max);
  return s ? s : null;
}
function optDate(form: FormData, key: string): string | null {
  const s = str(form, key, 10);
  return isISODate(s) ? s : null;
}
function money(form: FormData, key: string): number {
  const n = Number(String(form.get(key) ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
const REPEATS: OpsRepeat[] = ["daily", "weekly", "monthly"];
const EXPENSE_CATEGORIES = ["repairs", "maintenance", "capex", "taxes", "insurance", "utilities", "hoa", "management", "legal", "supplies", "travel", "other"];
const FREQUENCIES: RentFrequency[] = ["weekly", "biweekly", "monthly"];

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidateBoard(propertyId?: string | null) {
  revalidatePath("/board");
  if (propertyId) {
    revalidatePath("/");
    revalidatePath("/properties");
    revalidatePath(`/properties/${propertyId}`);
  }
}

// ---------------------------------------------------------------------------
// Sections and lines
// ---------------------------------------------------------------------------

/** First visit: one column per property, plus a general to-do column. */
export async function createStarterBoard(): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const { count } = await supabase.from("ops_sections").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return { ok: true };
  const { data: props } = await supabase
    .from("properties")
    .select("id, name, property_type")
    .eq("is_archived", false)
    .order("created_at");
  const rows = [
    ...(props ?? []).map((p, i) => ({
      name: String(p.name).slice(0, 80),
      icon: p.property_type === "commercial" ? "store" : "home",
      property_id: p.id,
      sort_order: i + 1,
    })),
    { name: "To-dos", icon: "clipboard", property_id: null, sort_order: (props?.length ?? 0) + 1 },
  ];
  const { data: secs, error } = await supabase.from("ops_sections").insert(rows).select("id, property_id");
  if (error || !secs) return FAIL;
  await supabase.from("ops_lines").insert(
    secs.map((s) => ({ section_id: s.id, name: s.property_id ? "Repairs & requests" : "General", sort_order: 1 })),
  );
  revalidateBoard();
  return { ok: true };
}

export async function addOpsSection(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const name = str(form, "name", 80);
  if (!name) return { ok: false, error: "Give the column a name." };
  const propertyId = optStr(form, "property_id", 40);
  const { data: last } = await supabase
    .from("ops_sections")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const { error } = await supabase.from("ops_sections").insert({
    name,
    icon: str(form, "icon", 20) || (propertyId ? "home" : "clipboard"),
    property_id: propertyId,
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
  });
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

export async function updateOpsSection(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const name = str(form, "name", 80);
  if (!id || !name) return { ok: false, error: "Give the column a name." };
  const patch: Record<string, unknown> = { name };
  const icon = str(form, "icon", 20);
  if (icon) patch.icon = icon;
  const { error } = await supabase.from("ops_sections").update(patch).eq("id", id);
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

/** Move a column one step left (-1) or right (+1). */
export async function moveOpsSection(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const dir = Number(form.get("dir")) < 0 ? -1 : 1;
  const { data: all } = await supabase.from("ops_sections").select("id, sort_order").order("sort_order").order("created_at");
  if (!all) return FAIL;
  const i = all.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return { ok: true };
  const order = all.map((s) => s.id);
  [order[i], order[j]] = [order[j], order[i]];
  for (let k = 0; k < order.length; k += 1) {
    if (all.find((s) => s.id === order[k])!.sort_order !== k + 1) {
      await supabase.from("ops_sections").update({ sort_order: k + 1 }).eq("id", order[k]);
    }
  }
  revalidateBoard();
  return { ok: true };
}

export async function deleteOpsSection(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  if (!id) return FAIL;
  // Lines and tasks go with it (on delete cascade).
  const { error } = await supabase.from("ops_sections").delete().eq("id", id);
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

export async function addOpsLine(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const sectionId = str(form, "section_id", 40);
  const name = str(form, "name", 80);
  if (!sectionId || !name) return { ok: false, error: "Give the line a name." };
  const { data: last } = await supabase
    .from("ops_lines")
    .select("sort_order")
    .eq("section_id", sectionId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const { error } = await supabase.from("ops_lines").insert({
    section_id: sectionId,
    name,
    info: optStr(form, "info", 400),
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
  });
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

export async function updateOpsLine(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const name = str(form, "name", 80);
  if (!id || !name) return { ok: false, error: "Give the line a name." };
  const patch: Record<string, unknown> = {
    name,
    info: optStr(form, "info", 400),
    dated: form.get("dated") === "on" || form.get("dated") === "true",
  };
  if (form.has("bill_category")) {
    const cat = str(form, "bill_category", 20);
    patch.bill_category = (EXPENSE_CATEGORIES as string[]).includes(cat) ? cat : null;
  }
  const { error } = await supabase.from("ops_lines").update(patch).eq("id", id);
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

export async function deleteOpsLine(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  if (!id) return FAIL;
  const { error } = await supabase.from("ops_lines").delete().eq("id", id);
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function taskFields(form: FormData) {
  const repeat = str(form, "repeat", 10) as OpsRepeat;
  const fields: Record<string, unknown> = {
    title: str(form, "title", 200),
    assignee: optStr(form, "assignee", 60),
    due_date: optDate(form, "due_date"),
    repeat: REPEATS.includes(repeat) ? repeat : null,
    notes: optStr(form, "notes", 1000),
  };
  // Bill lines carry a usual amount (prefilled when the bill is checked off).
  if (form.has("amount")) fields.amount = money(form, "amount") || null;
  return fields as { title: string } & Record<string, unknown>;
}

export async function addOpsTask(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const lineId = str(form, "line_id", 40);
  const fields = taskFields(form);
  if (!lineId || !fields.title) return { ok: false, error: "Give the task a name." };
  const { error } = await supabase.from("ops_tasks").insert({ line_id: lineId, ...fields });
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

export async function updateOpsTask(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const fields = taskFields(form);
  if (!id || !fields.title) return { ok: false, error: "Give the task a name." };
  const { error } = await supabase.from("ops_tasks").update(fields).eq("id", id);
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

export async function deleteOpsTask(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  if (!id) return FAIL;
  const { error } = await supabase.from("ops_tasks").delete().eq("id", id);
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

/** Check a task off; a repeating one puts its next copy on the board. */
export async function completeOpsTask(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const { data: t } = await supabase.from("ops_tasks").select("*").eq("id", id).single();
  if (!t || t.done_at) return { ok: true };
  const { error } = await supabase.from("ops_tasks").update({ done_at: new Date().toISOString() }).eq("id", id);
  if (error) return FAIL;
  if (t.repeat && t.due_date) {
    await supabase.from("ops_tasks").insert({
      line_id: t.line_id,
      title: t.title,
      assignee: t.assignee,
      due_date: nextDue(t.due_date, t.repeat, todayIn()),
      repeat: t.repeat,
      notes: t.notes,
      amount: t.amount,
      is_sample: t.is_sample,
    });
  }
  revalidateBoard();
  return { ok: true };
}

export async function reopenOpsTask(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const { data: t } = await supabase.from("ops_tasks").select("expense_id").eq("id", id).single();
  // A bill checked off from the board logged an expense: reopening takes it back out.
  let propertyId: string | null = null;
  if (t?.expense_id) {
    const { data: e } = await supabase.from("property_expenses").select("property_id").eq("id", t.expense_id).single();
    propertyId = e?.property_id ?? null;
    await supabase.from("property_expenses").delete().eq("id", t.expense_id);
  }
  const { error } = await supabase.from("ops_tasks").update({ done_at: null, expense_id: null }).eq("id", id);
  if (error) return FAIL;
  revalidateBoard(propertyId);
  return { ok: true };
}

/**
 * Check off a bill: log what was paid as a property expense in the line's
 * category (unless a repeating expense already counts that bill), remember the
 * amount for next time, and put the next copy on the board if it repeats.
 */
export async function completeBillTask(form: FormData): Promise<ActionResult & { logged?: boolean }> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const amount = money(form, "amount");
  const paidOn = optDate(form, "paid_date") ?? todayIn();
  const { data: t } = await supabase.from("ops_tasks").select("*").eq("id", id).single();
  if (!t) return FAIL;
  if (t.done_at) return { ok: true };
  const { data: line } = await supabase.from("ops_lines").select("bill_category, section_id").eq("id", t.line_id).single();
  const { data: sec } = line
    ? await supabase.from("ops_sections").select("property_id").eq("id", line.section_id).single()
    : { data: null };
  const category = line?.bill_category as string | null;
  const propertyId = sec?.property_id as string | null;

  let expenseId: string | null = null;
  if (category && propertyId) {
    const { data: auto } = await supabase
      .from("property_expenses")
      .select("id")
      .eq("property_id", propertyId)
      .eq("category", category)
      .neq("cadence", "one_time")
      .lte("expense_date", paidOn)
      .limit(1);
    if (!auto?.length) {
      if (amount <= 0) return { ok: false, error: "Enter what was paid." };
      const { data: e, error } = await supabase
        .from("property_expenses")
        .insert({
          property_id: propertyId,
          amount,
          expense_date: paidOn,
          category,
          cadence: "one_time",
          vendor: String(t.title).slice(0, 120),
          note: "Logged from the board",
        })
        .select("id")
        .single();
      if (error || !e) return FAIL;
      expenseId = e.id;
    }
  }

  const keep = amount > 0 ? amount : t.amount;
  const { error } = await supabase
    .from("ops_tasks")
    .update({ done_at: new Date().toISOString(), amount: keep, expense_id: expenseId })
    .eq("id", id);
  if (error) {
    if (expenseId) await supabase.from("property_expenses").delete().eq("id", expenseId);
    return FAIL;
  }
  if (t.repeat && t.due_date) {
    await supabase.from("ops_tasks").insert({
      line_id: t.line_id,
      title: t.title,
      assignee: t.assignee,
      due_date: nextDue(t.due_date, t.repeat, todayIn()),
      repeat: t.repeat,
      notes: t.notes,
      amount: keep,
      is_sample: t.is_sample,
    });
  }
  revalidateBoard(propertyId);
  return { ok: true, logged: !!expenseId };
}

export async function clearSampleTasks(): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const { error } = await supabase.from("ops_tasks").delete().eq("is_sample", true);
  if (error) return FAIL;
  revalidateBoard();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rent: answering an installment from the board
// ---------------------------------------------------------------------------

/**
 * "Has it been received?" — Yes logs a received payment; Promised logs a
 * pending one (counts toward nothing until it lands). Either way the payment
 * goes into the property's rent ledger, so balances, cash flow and the Excel
 * download all update from the same row.
 */
export async function recordInstallmentPayment(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const propertyId = str(form, "property_id", 40);
  const leaseId = optStr(form, "lease_id", 40);
  const scheduleId = optStr(form, "schedule_id", 40);
  const installment = optDate(form, "installment_date");
  const date = optDate(form, "date");
  const amount = money(form, "amount");
  const pending = str(form, "status", 10) === "pending";
  if (!propertyId || !installment || !date || amount <= 0) {
    return { ok: false, error: "Enter an amount and a date." };
  }
  const method = optStr(form, "method", 40);
  const from = optStr(form, "from", 80);
  const note = optStr(form, "note", 300);
  const { error } = await supabase.from("rent_payments").insert({
    property_id: propertyId,
    lease_id: leaseId,
    schedule_id: scheduleId,
    installment_date: installment,
    amount,
    status: pending ? "pending" : "received",
    paid_date: pending ? null : date,
    expected_date: pending ? date : null,
    period_month: `${installment.slice(0, 7)}-01`,
    method,
    note: [from ? `from ${from}` : null, note].filter(Boolean).join(" · ") || null,
  });
  if (error) return FAIL;
  revalidateBoard(propertyId);
  return { ok: true };
}

/** A promised payment landed. */
export async function markPromisedReceived(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const propertyId = str(form, "property_id", 40);
  const paidDate = optDate(form, "paid_date") ?? todayIn();
  const { error } = await supabase
    .from("rent_payments")
    .update({ status: "received", paid_date: paidDate })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return FAIL;
  revalidateBoard(propertyId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rent payment plans
// ---------------------------------------------------------------------------

export async function addRentSchedule(form: FormData): Promise<void> {
  const { supabase, user } = await session();
  if (!user) return;
  const leaseId = str(form, "lease_id", 40);
  const propertyId = str(form, "property_id", 40);
  const amount = money(form, "amount");
  const start = optDate(form, "start_date");
  const frequency = str(form, "frequency", 10) as RentFrequency;
  if (!leaseId || !propertyId || amount <= 0 || !start || !FREQUENCIES.includes(frequency)) return;
  const end = optDate(form, "end_date");
  await supabase.from("rent_schedules").insert({
    lease_id: leaseId,
    property_id: propertyId,
    amount,
    frequency,
    start_date: start,
    end_date: end && end >= start ? end : null,
    note: optStr(form, "note", 300),
  });
  revalidateBoard(propertyId);
}

export async function endRentSchedule(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const propertyId = str(form, "property_id", 40);
  const { error } = await supabase.from("rent_schedules").update({ end_date: todayIn() }).eq("id", id);
  if (error) return FAIL;
  revalidateBoard(propertyId);
  return { ok: true };
}

export async function deleteRentSchedule(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const propertyId = str(form, "property_id", 40);
  const { error } = await supabase.from("rent_schedules").delete().eq("id", id);
  if (error) return FAIL;
  revalidateBoard(propertyId);
  return { ok: true };
}
