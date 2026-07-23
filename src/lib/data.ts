/**
 * Server-side data access: fetches the signed-in user's rows from Supabase.
 * Row-level security scopes every query to the current user automatically.
 */
import { createClient } from "@/lib/supabase/server";
import type {
  BucketRow,
  CelebratedPaydayRow,
  DashboardData,
  ExpenseRow,
  IncomeRow,
  NetWorthRow,
  WhatIfRow,
} from "@/lib/rows";

export type { DashboardData } from "@/lib/rows";

/** Fetch all six tables for the signed-in user. */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  const [income, buckets, expenses, whatIf, netWorth, celebrated] =
    await Promise.all([
      supabase.from("income_sources").select("*").order("created_at"),
      supabase.from("buckets").select("*").order("sort_order").order("created_at"),
      supabase.from("expenses").select("*").order("due_date"),
      supabase.from("whatif_items").select("*").order("created_at"),
      supabase.from("net_worth_items").select("*").order("created_at"),
      supabase.from("celebrated_paydays").select("*").order("payday"),
    ]);

  return {
    income: (income.data as IncomeRow[]) ?? [],
    buckets: (buckets.data as BucketRow[]) ?? [],
    expenses: (expenses.data as ExpenseRow[]) ?? [],
    whatIf: (whatIf.data as WhatIfRow[]) ?? [],
    netWorth: (netWorth.data as NetWorthRow[]) ?? [],
    celebrated: (celebrated.data as CelebratedPaydayRow[]) ?? [],
  };
}
