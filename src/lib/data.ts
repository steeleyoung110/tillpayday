/**
 * Server-side data access: fetches the signed-in user's rows from Supabase.
 * Row-level security scopes every query to the current user automatically.
 */
import { createClient } from "@/lib/supabase/server";
import type {
  AssetRow,
  BucketRow,
  CelebratedPaydayRow,
  DashboardData,
  ExpenseRow,
  GoalRow,
  IncomeEntryRow,
  IncomeRow,
  LiabilityRow,
  NetWorthRow,
  SnapshotRow,
  WhatIfRow,
} from "@/lib/rows";

export type { DashboardData } from "@/lib/rows";

export interface NetWorthData {
  assets: AssetRow[];
  liabilities: LiabilityRow[];
  snapshots: SnapshotRow[];
}

/** Fetch the Net Worth module's tables (phase 9). */
export async function getNetWorthData(): Promise<NetWorthData> {
  const supabase = await createClient();
  const [assets, liabilities, snapshots] = await Promise.all([
    supabase.from("assets").select("*").order("created_at"),
    supabase.from("liabilities").select("*").order("created_at"),
    supabase.from("net_worth_snapshots").select("*").order("snapshot_date"),
  ]);
  return {
    assets: (assets.data as AssetRow[]) ?? [],
    liabilities: (liabilities.data as LiabilityRow[]) ?? [],
    snapshots: (snapshots.data as SnapshotRow[]) ?? [],
  };
}

/** Fetch all seven tables for the signed-in user. */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  const [income, buckets, expenses, whatIf, assets, liabilities, celebrated, entries, goals] =
    await Promise.all([
      supabase.from("income_sources").select("*").order("created_at"),
      supabase.from("buckets").select("*").order("sort_order").order("created_at"),
      supabase.from("expenses").select("*").order("due_date"),
      supabase.from("whatif_items").select("*").order("created_at"),
      supabase.from("assets").select("*").eq("is_archived", false),
      supabase.from("liabilities").select("*").eq("is_archived", false),
      supabase.from("celebrated_paydays").select("*").order("payday"),
      supabase.from("income_entries").select("*").order("received_date"),
      supabase.from("goals").select("*").order("target_date"),
    ]);

  // The dashboard's liquid-savings seeding reads the Net Worth module now,
  // mapped into the legacy shape its consumers already understand.
  const netWorth: NetWorthRow[] = [
    ...(((assets.data as AssetRow[]) ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      kind: "asset" as const,
      category: a.category as NetWorthRow["category"],
      amount: Number(a.current_value),
      apy: 0,
      created_at: a.created_at,
    }))),
    ...(((liabilities.data as LiabilityRow[]) ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      kind: "liability" as const,
      category: l.category as NetWorthRow["category"],
      amount: Number(l.current_balance),
      apy: Number(l.interest_rate ?? 0),
      created_at: l.created_at,
    }))),
  ];

  return {
    income: (income.data as IncomeRow[]) ?? [],
    buckets: (buckets.data as BucketRow[]) ?? [],
    expenses: (expenses.data as ExpenseRow[]) ?? [],
    whatIf: (whatIf.data as WhatIfRow[]) ?? [],
    netWorth,
    celebrated: (celebrated.data as CelebratedPaydayRow[]) ?? [],
    incomeEntries: (entries.data as IncomeEntryRow[]) ?? [],
    goals: (goals.data as GoalRow[]) ?? [],
  };
}
