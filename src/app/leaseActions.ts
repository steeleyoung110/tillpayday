"use server";

/**
 * Server Actions for lease paperwork and short-term rental reports: indexing
 * uploaded files, renewing leases, and setting a property's report rhythm.
 * The files themselves are uploaded from the browser straight into the
 * private `property-docs` bucket (storage RLS: first folder = the user's id);
 * these actions record and remove the index rows.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO } from "@/lib/property/compliance";

export interface ActionResult {
  ok: boolean;
  error?: string;
}
const FAIL: ActionResult = { ok: false, error: "That didn't save. Check your connection and try again." };

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function str(form: FormData, key: string, max = 500): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}
function money(form: FormData, key: string): number | null {
  const raw = String(form.get(key) ?? "").replace(/[$,\s]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidate(propertyId: string) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
}

/** Record a file the browser just uploaded to storage. */
export async function recordPropertyFile(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const propertyId = str(form, "property_id", 40);
  const kind = str(form, "kind", 20);
  const path = str(form, "storage_path", 600);
  const name = str(form, "file_name", 200);
  const leaseId = str(form, "lease_id", 40) || null;
  const period = str(form, "period_start", 10);
  if (!propertyId || !path || !name || (kind !== "lease" && kind !== "rental_report")) return FAIL;
  // The file must sit in this user's own folder for this property.
  if (!path.startsWith(`${user.id}/${propertyId}/`)) return FAIL;
  if (kind === "rental_report" && !isDate(period)) return FAIL;
  const size = Number(form.get("size_bytes"));
  const { error } = await supabase.from("property_files").insert({
    property_id: propertyId,
    kind,
    lease_id: kind === "lease" ? leaseId : null,
    period_start: kind === "rental_report" ? period : null,
    storage_path: path,
    file_name: name,
    size_bytes: Number.isFinite(size) && size >= 0 ? Math.round(size) : null,
  });
  if (error) {
    // Don't leave an orphaned upload behind.
    await supabase.storage.from("property-docs").remove([path]);
    return FAIL;
  }
  revalidate(propertyId);
  return { ok: true };
}

export async function deletePropertyFile(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const { data: f } = await supabase.from("property_files").select("*").eq("id", id).single();
  if (!f) return FAIL;
  await supabase.storage.from("property-docs").remove([f.storage_path]);
  const { error } = await supabase.from("property_files").delete().eq("id", id);
  if (error) return FAIL;
  revalidate(f.property_id);
  return { ok: true };
}

/**
 * Renew a lease to a new end date. Same rent: the lease simply runs longer,
 * so the balance and payment history carry straight on. New rent: the old
 * lease closes on its end date and a new one starts the next day for the
 * same tenant; payment plans move over with it.
 */
export async function renewLease(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "id", 40);
  const propertyId = str(form, "property_id", 40);
  const newEnd = str(form, "end_date", 10);
  const monthToMonth = form.get("month_to_month") === "on";
  if (!id || (!monthToMonth && !isDate(newEnd))) return { ok: false, error: "Pick the new end date." };
  const { data: lease } = await supabase.from("leases").select("*").eq("id", id).single();
  if (!lease) return FAIL;
  const end = monthToMonth ? null : newEnd;
  if (end && end <= (lease.end_date ?? lease.start_date)) {
    return { ok: false, error: "The new end date has to be after the current one." };
  }
  const rent = money(form, "rent_amount");
  const sameRent = rent === null || Math.abs(rent - Number(lease.rent_amount)) < 0.005;

  if (sameRent || !lease.end_date) {
    const { error } = await supabase
      .from("leases")
      .update({ end_date: end, status: "active", ...(sameRent ? {} : { rent_amount: rent }) })
      .eq("id", id);
    if (error) return FAIL;
  } else {
    const start = addDaysISO(lease.end_date, 1);
    const { data: created, error } = await supabase
      .from("leases")
      .insert({
        unit_id: lease.unit_id,
        tenant_id: lease.tenant_id,
        rent_amount: rent,
        due_day: lease.due_day,
        start_date: start,
        end_date: end,
        deposit_amount: lease.deposit_amount,
      })
      .select("id")
      .single();
    if (error || !created) return FAIL;
    await supabase.from("leases").update({ status: "ended" }).eq("id", id);
    await supabase.from("rent_schedules").update({ lease_id: created.id }).eq("lease_id", id).is("end_date", null);
  }
  revalidate(propertyId);
  return { ok: true };
}

/** Set (or clear) a short-term property's rental-report rhythm. */
export async function setReportSchedule(form: FormData): Promise<ActionResult> {
  const { supabase, user } = await session();
  if (!user) return FAIL;
  const id = str(form, "property_id", 40);
  const cadence = str(form, "report_cadence", 10);
  const start = str(form, "report_start", 10);
  const dueRaw = str(form, "report_due_days", 4);
  const due = dueRaw === "" ? null : Math.round(Number(dueRaw));
  if (!id) return FAIL;
  if (cadence && cadence !== "monthly" && cadence !== "quarterly") return FAIL;
  if (cadence && !isDate(start)) return { ok: false, error: "Pick the first month to track." };
  if (due !== null && (!Number.isFinite(due) || due < 0 || due > 120)) return { ok: false, error: "Grace days must be 0 to 120." };
  const { error } = await supabase
    .from("properties")
    .update({ report_cadence: cadence || null, report_start: cadence ? start : null, report_due_days: due })
    .eq("id", id);
  if (error) return FAIL;
  revalidate(id);
  return { ok: true };
}
