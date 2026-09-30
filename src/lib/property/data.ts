/**
 * Server-side data access for the property screens. Row-level security scopes
 * every query to the signed-in user; these tables are not part of the old
 * budget-sharing feature, so no explicit user_id filtering is needed.
 */
import { createClient } from "@/lib/supabase/server";
import type {
  BookingRow,
  LeaseRow,
  MortgagePaymentRow,
  MortgageRow,
  PortfolioData,
  PropertyExpenseRow,
  PropertyRow,
  RentPaymentRow,
  TenantRow,
  UnitRow,
} from "./rows";

/** Fetch every property table in one pass. */
export async function getPortfolioData(): Promise<PortfolioData> {
  const supabase = await createClient();

  const [properties, units, tenants, leases, rents, expenses, mortgages, mortgagePayments, bookings] =
    await Promise.all([
      supabase.from("properties").select("*").order("created_at"),
      supabase.from("units").select("*").order("sort_order").order("created_at"),
      supabase.from("tenants").select("*").order("full_name"),
      supabase.from("leases").select("*").order("start_date", { ascending: false }),
      supabase.from("rent_payments").select("*").order("paid_date", { ascending: false }),
      supabase.from("property_expenses").select("*").order("expense_date", { ascending: false }),
      supabase.from("mortgages").select("*").order("created_at"),
      supabase.from("mortgage_payments").select("*").order("paid_date", { ascending: false }),
      supabase.from("bookings").select("*").order("check_in", { ascending: false }),
    ]);

  return {
    properties: (properties.data as PropertyRow[]) ?? [],
    units: (units.data as UnitRow[]) ?? [],
    tenants: (tenants.data as TenantRow[]) ?? [],
    leases: (leases.data as LeaseRow[]) ?? [],
    rentPayments: (rents.data as RentPaymentRow[]) ?? [],
    expenses: (expenses.data as PropertyExpenseRow[]) ?? [],
    mortgages: (mortgages.data as MortgageRow[]) ?? [],
    mortgagePayments: (mortgagePayments.data as MortgagePaymentRow[]) ?? [],
    bookings: (bookings.data as BookingRow[]) ?? [],
  };
}
