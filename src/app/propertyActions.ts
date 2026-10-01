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
// Short-term rentals: unit mode, stays, and CSV import
// ---------------------------------------------------------------------------

export async function setUnitRentalType(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const type = str(formData, "rental_type");
  if (!id || (type !== "long_term" && type !== "short_term")) return;
  await supabase.from("units").update({ rental_type: type }).eq("id", id);
  revalidateProperty(str(formData, "property_id"));
}

export async function addBooking(formData: FormData) {
  const supabase = await createClient();
  const propertyId = str(formData, "property_id");
  const checkIn = str(formData, "check_in");
  const checkOut = str(formData, "check_out");
  const payout = num(formData, "payout");
  if (!propertyId || !checkIn || !checkOut || checkOut <= checkIn || payout <= 0) return;
  await supabase.from("bookings").insert({
    property_id: propertyId,
    unit_id: optStr(formData, "unit_id"),
    guest_name: optStr(formData, "guest_name"),
    platform: str(formData, "platform") || "direct",
    check_in: checkIn,
    check_out: checkOut,
    payout,
    source: "manual",
  });
  revalidateProperty(propertyId);
}

export async function deleteBooking(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;
  await supabase.from("bookings").delete().eq("id", id);
  revalidateProperty(str(formData, "property_id"));
}

export interface ImportBookingsResult {
  imported: number;
  duplicates: number;
  rejected: number;
  error?: string;
}

/**
 * Bulk-insert CSV-parsed stays for one property. Rows whose external_id the
 * property has already seen are dropped (re-importing an export is a no-op);
 * malformed rows are rejected, never silently mangled.
 */
export async function importBookings(formData: FormData): Promise<ImportBookingsResult> {
  const supabase = await createClient();
  const propertyId = str(formData, "property_id");
  const unitId = optStr(formData, "unit_id");
  const platform = str(formData, "platform") || "other";

  let rows: unknown;
  try {
    rows = JSON.parse(str(formData, "payload"));
  } catch {
    return { imported: 0, duplicates: 0, rejected: 0, error: "unreadable payload" };
  }
  if (!propertyId || !Array.isArray(rows) || rows.length === 0) {
    return { imported: 0, duplicates: 0, rejected: 0, error: "nothing to import" };
  }
  if (rows.length > 2000) {
    return { imported: 0, duplicates: 0, rejected: 0, error: "that file has more than 2,000 stays — split it up" };
  }

  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const optMoney = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0
      ? Math.round(v * 100) / 100
      : null;

  let rejected = 0;
  const clean: Record<string, unknown>[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const checkIn = typeof r.check_in === "string" && DATE.test(r.check_in) ? r.check_in : null;
    const checkOut = typeof r.check_out === "string" && DATE.test(r.check_out) ? r.check_out : null;
    const payout = optMoney(r.payout);
    const externalId = typeof r.external_id === "string" && r.external_id ? r.external_id.slice(0, 120) : null;
    if (!checkIn || !checkOut || checkOut <= checkIn || payout == null || !externalId) {
      rejected += 1;
      continue;
    }
    const allowed = ["airbnb", "vrbo", "booking", "direct", "other"];
    // A row's own platform column (e.g. "Booking Site") beats the form default.
    const rowPlatform =
      typeof r.platform === "string" && allowed.includes(r.platform) ? r.platform : null;
    clean.push({
      property_id: propertyId,
      unit_id: unitId,
      guest_name: typeof r.guest_name === "string" && r.guest_name ? r.guest_name.slice(0, 200) : null,
      platform: rowPlatform ?? (allowed.includes(platform) ? platform : "other"),
      check_in: checkIn,
      check_out: checkOut,
      payout,
      gross_amount: optMoney(r.gross_amount),
      cleaning_fee: optMoney(r.cleaning_fee),
      platform_fee: optMoney(r.platform_fee),
      external_id: externalId,
      source: "csv",
    });
  }

  // Drop rows this property has already imported (same confirmation code).
  const { data: existing } = await supabase
    .from("bookings")
    .select("external_id")
    .eq("property_id", propertyId)
    .in("external_id", clean.map((c) => c.external_id as string));
  const seen = new Set((existing ?? []).map((e) => e.external_id));
  const fresh = clean.filter((c) => !seen.has(c.external_id));

  if (fresh.length > 0) {
    const { error } = await supabase.from("bookings").insert(fresh);
    if (error) {
      return { imported: 0, duplicates: clean.length - fresh.length, rejected, error: "the database said no — try again" };
    }
  }
  revalidateProperty(propertyId);
  return { imported: fresh.length, duplicates: clean.length - fresh.length, rejected };
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

/**
 * "Mortgage of $X a month starting <date>" is enough to create the loan.
 * Balance, rate and the rest can be filled in later with updateMortgage,
 * once the statement is in hand.
 */
export async function addMortgage(formData: FormData) {
  const supabase = await createClient();
  const propertyId = str(formData, "property_id");
  const lender = str(formData, "lender");
  if (!propertyId || !lender) return;
  await supabase.from("mortgages").insert({
    property_id: propertyId,
    lender,
    original_amount: optNum(formData, "original_amount"),
    current_balance: optNum(formData, "current_balance"),
    interest_rate: optNum(formData, "interest_rate"),
    monthly_payment: num(formData, "monthly_payment"),
    start_date: optStr(formData, "start_date"),
  });
  revalidateProperty(propertyId);
}

/** Fill in or correct loan details — only the fields that were typed change. */
export async function updateMortgage(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;

  const patch: Record<string, number | string> = {};
  const balance = optNum(formData, "current_balance");
  const rate = optNum(formData, "interest_rate");
  const payment = optNum(formData, "monthly_payment");
  const original = optNum(formData, "original_amount");
  const startDate = optStr(formData, "start_date");
  if (balance != null) patch.current_balance = balance;
  if (rate != null) patch.interest_rate = rate;
  if (payment != null) patch.monthly_payment = payment;
  if (original != null) patch.original_amount = original;
  if (startDate) patch.start_date = startDate;
  if (Object.keys(patch).length === 0) return;

  await supabase.from("mortgages").update(patch).eq("id", id);
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
    // No known balance means nothing to step down — the payment still logs.
    if (m && m.current_balance != null) {
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
