"use server";

/**
 * Server Actions for the property-management screens. Same contract as the
 * rest of the app: they run with the signed-in user's Supabase session, RLS
 * keeps everyone inside their own rows, and each write revalidates the pages
 * that show the data.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function num(form: FormData, key: string): number {
  const n = Number(form.get(key));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Optional numeric field: empty/invalid → null (not silently 0). */
function optNum(form: FormData, key: string): number | null {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Optional string field: empty → null. */
function optStr(form: FormData, key: string): string | null {
  const s = str(form, key);
  return s ? s : null;
}

function revalidateProperty(propertyId?: string) {
  revalidatePath("/");
  revalidatePath("/properties");
  if (propertyId) revalidatePath(`/properties/${propertyId}`);
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export async function addProperty(formData: FormData) {
  const supabase = await createClient();
  const name = str(formData, "name");
  if (!name) return;

  const { data, error } = await supabase
    .from("properties")
    .insert({
      name,
      address: str(formData, "address"),
      property_type: str(formData, "property_type") || "single_family",
      purchase_date: optStr(formData, "purchase_date"),
      purchase_price: optNum(formData, "purchase_price"),
      current_value: optNum(formData, "current_value"),
    })
    .select("id")
    .single();
  if (error || !data) return;

  // Every property starts with one rentable unit; multi-unit buildings add more.
  await supabase.from("units").insert({ property_id: data.id, label: "Main" });

  revalidateProperty(data.id);
  redirect(`/properties/${data.id}`);
}

export async function updatePropertyValue(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const value = optNum(formData, "current_value");
  if (!id || value == null) return;
  await supabase.from("properties").update({ current_value: value }).eq("id", id);
  revalidateProperty(id);
}

export async function setPropertyArchived(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;
  await supabase
    .from("properties")
    .update({ is_archived: str(formData, "archived") === "true" })
    .eq("id", id);
  revalidateProperty(id);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export async function addUnit(formData: FormData) {
  const supabase = await createClient();
  const propertyId = str(formData, "property_id");
  const label = str(formData, "label");
  if (!propertyId || !label) return;
  await supabase.from("units").insert({
    property_id: propertyId,
    label,
    sort_order: num(formData, "sort_order"),
  });
  revalidateProperty(propertyId);
}

export async function deleteUnit(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;
  await supabase.from("units").delete().eq("id", id);
  revalidateProperty(str(formData, "property_id"));
}

// ---------------------------------------------------------------------------
// Leases (creates or reuses the tenant by name in the same step)
// ---------------------------------------------------------------------------

export async function addLease(formData: FormData) {
  const supabase = await createClient();
  const unitId = str(formData, "unit_id");
  const propertyId = str(formData, "property_id");
  const tenantName = str(formData, "tenant_name");
  const startDate = str(formData, "start_date");
  if (!unitId || !startDate) return;

  // Reuse an existing tenant with the same name rather than duplicating them.
  let tenantId: string | null = null;
  if (tenantName) {
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .ilike("full_name", tenantName)
      .limit(1)
      .maybeSingle();
    if (existing) {
      tenantId = existing.id;
    } else {
      const { data: created } = await supabase
        .from("tenants")
        .insert({
          full_name: tenantName,
          email: optStr(formData, "tenant_email"),
          phone: optStr(formData, "tenant_phone"),
        })
        .select("id")
        .single();
      tenantId = created?.id ?? null;
    }
  }

  const dueDay = Math.min(28, Math.max(1, Math.round(num(formData, "due_day") || 1)));
  await supabase.from("leases").insert({
    unit_id: unitId,
    tenant_id: tenantId,
    rent_amount: num(formData, "rent_amount"),
    due_day: dueDay,
    start_date: startDate,
    end_date: optStr(formData, "end_date"),
    deposit_amount: num(formData, "deposit_amount"),
  });
  revalidateProperty(propertyId);
}

export async function endLease(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const endDate = str(formData, "end_date");
  if (!id || !endDate) return;
  await supabase
    .from("leases")
    .update({ status: "ended", end_date: endDate })
    .eq("id", id);
  revalidateProperty(str(formData, "property_id"));
}

export async function deleteLease(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;
  await supabase.from("leases").delete().eq("id", id);
  revalidateProperty(str(formData, "property_id"));
}

// ---------------------------------------------------------------------------
// Rent payments
// ---------------------------------------------------------------------------

export async function logRentPayment(formData: FormData) {
  const supabase = await createClient();
  const propertyId = str(formData, "property_id");
  const paidDate = str(formData, "paid_date");
  const amount = num(formData, "amount");
  if (!propertyId || !paidDate || amount <= 0) return;

  // "Covers month" arrives as YYYY-MM from a month input; store its first day.
  const period = str(formData, "period_month");
  await supabase.from("rent_payments").insert({
    property_id: propertyId,
    lease_id: optStr(formData, "lease_id"),
    amount,
    paid_date: paidDate,
    period_month: period ? `${period.slice(0, 7)}-01` : null,
    method: optStr(formData, "method"),
    note: optStr(formData, "note"),
  });
  revalidateProperty(propertyId);
}

export async function deleteRentPayment(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;
  await supabase.from("rent_payments").delete().eq("id", id);
  revalidateProperty(str(formData, "property_id"));
}

// ---------------------------------------------------------------------------
// Property expenses
// ---------------------------------------------------------------------------

export async function addPropertyExpense(formData: FormData) {
  const supabase = await createClient();
  const propertyId = str(formData, "property_id");
  const date = str(formData, "expense_date");
  const amount = num(formData, "amount");
  if (!propertyId || !date || amount <= 0) return;
  await supabase.from("property_expenses").insert({
    property_id: propertyId,
    unit_id: optStr(formData, "unit_id"),
    amount,
    expense_date: date,
    category: str(formData, "category") || "other",
    vendor: optStr(formData, "vendor"),
    note: optStr(formData, "note"),
  });
  revalidateProperty(propertyId);
}

export async function deletePropertyExpense(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;
  await supabase.from("property_expenses").delete().eq("id", id);
  revalidateProperty(str(formData, "property_id"));
}

// ---------------------------------------------------------------------------
// Mortgages
// ---------------------------------------------------------------------------

export async function addMortgage(formData: FormData) {
  const supabase = await createClient();
  const propertyId = str(formData, "property_id");
  const lender = str(formData, "lender");
  if (!propertyId || !lender) return;
  await supabase.from("mortgages").insert({
    property_id: propertyId,
    lender,
    original_amount: optNum(formData, "original_amount"),
    current_balance: num(formData, "current_balance"),
    interest_rate: optNum(formData, "interest_rate"),
    monthly_payment: num(formData, "monthly_payment"),
    start_date: optStr(formData, "start_date"),
  });
  revalidateProperty(propertyId);
}

export async function updateMortgageBalance(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const balance = optNum(formData, "current_balance");
  if (!id || balance == null) return;
  await supabase.from("mortgages").update({ current_balance: balance }).eq("id", id);
  revalidateProperty(str(formData, "property_id"));
}

export async function deleteMortgage(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;
  await supabase.from("mortgages").delete().eq("id", id);
  revalidateProperty(str(formData, "property_id"));
}

/**
 * Log a mortgage payment. When a split is given and the principal is known,
 * the loan balance steps down by that principal automatically — the ledger
 * and the balance never drift apart silently.
 */
export async function logMortgagePayment(formData: FormData) {
  const supabase = await createClient();
  const mortgageId = str(formData, "mortgage_id");
  const propertyId = str(formData, "property_id");
  const paidDate = str(formData, "paid_date");
  const amount = num(formData, "amount");
  if (!mortgageId || !propertyId || !paidDate || amount <= 0) return;

  const principal = optNum(formData, "principal");
  await supabase.from("mortgage_payments").insert({
    mortgage_id: mortgageId,
    property_id: propertyId,
    amount,
    principal,
    interest: optNum(formData, "interest"),
    escrow: optNum(formData, "escrow"),
    paid_date: paidDate,
    note: optStr(formData, "note"),
  });

  if (principal != null && principal > 0) {
    const { data: m } = await supabase
      .from("mortgages")
      .select("current_balance")
      .eq("id", mortgageId)
      .single();
    if (m) {
      const next = Math.max(0, Number(m.current_balance) - principal);
      await supabase.from("mortgages").update({ current_balance: next }).eq("id", mortgageId);
    }
  }
  revalidateProperty(propertyId);
}

export async function deleteMortgagePayment(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;
  // Put the principal back on the balance if this payment had reduced it.
  const { data: p } = await supabase
    .from("mortgage_payments")
    .select("mortgage_id, principal")
    .eq("id", id)
    .single();
  await supabase.from("mortgage_payments").delete().eq("id", id);
  if (p?.principal != null && Number(p.principal) > 0) {
    const { data: m } = await supabase
      .from("mortgages")
      .select("current_balance")
      .eq("id", p.mortgage_id)
      .single();
    if (m) {
      await supabase
        .from("mortgages")
        .update({ current_balance: Number(m.current_balance) + Number(p.principal) })
        .eq("id", p.mortgage_id);
    }
  }
  revalidateProperty(str(formData, "property_id"));
}
