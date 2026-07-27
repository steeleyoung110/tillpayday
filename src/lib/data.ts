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
  TransferRow,
  WhatIfRow,
} from "@/lib/rows";

export type { DashboardData } from "@/lib/rows";

export interface NetWorthData {
  assets: AssetRow[];
  liabilities: LiabilityRow[];
  snapshots: SnapshotRow[];
}

/**
 * Resolve whose rows to load: the signed-in user's own, or — when `viewAs`
 * names an owner who has shared with them — that owner's. Sharing grants are
 * SELECT-only RLS policies, so every query must now scope by user_id
 * explicitly; without it a viewer's own dashboard would mingle in shared
 * rows. Returns null when viewAs isn't a budget shared with this user.
 */
export async function resolveViewUser(viewAs?: string): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!viewAs || viewAs === user.id) return user.id;
  const { data } = await supabase
    .from("shared_access")
    .select("owner_id")
    .eq("owner_id", viewAs)
    .ilike("viewer_email", user.email ?? "")
    .maybeSingle();
  return data ? viewAs : null;
}

/** Fetch the Net Worth module's tables (phase 9). */
export async function getNetWorthData(viewUserId?: string): Promise<NetWorthData> {
  const supabase = await createClient();
  const uid =
    viewUserId ?? (await supabase.auth.getUser()).data.user?.id ?? "";
  const [assets, liabilities, snapshots] = await Promise.all([
    supabase.from("assets").select("*").eq("user_id", uid).order("created_at"),
    supabase.from("liabilities").select("*").eq("user_id", uid).order("created_at"),
    supabase.from("net_worth_snapshots").select("*").eq("user_id", uid).order("snapshot_date"),
  ]);
  return {
    assets: (assets.data as AssetRow[]) ?? [],
    liabilities: (liabilities.data as LiabilityRow[]) ?? [],
    snapshots: (snapshots.data as SnapshotRow[]) ?? [],
  };
}

/** Fetch all dashboard tables for one user (self by default). */
export async function getDashboardData(viewUserId?: string): Promise<DashboardData> {
  const supabase = await createClient();
  const uid =
    viewUserId ?? (await supabase.auth.getUser()).data.user?.id ?? "";

  const [income, buckets, expenses, whatIf, assets, liabilities, celebrated, entries, goals, transfers] =
    await Promise.all([
      supabase.from("income_sources").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("buckets").select("*").eq("user_id", uid).order("sort_order").order("created_at"),
      supabase.from("expenses").select("*").eq("user_id", uid).order("due_date"),
      supabase.from("whatif_items").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("assets").select("*").eq("user_id", uid).eq("is_archived", false),
      supabase.from("liabilities").select("*").eq("user_id", uid).eq("is_archived", false),
      supabase.from("celebrated_paydays").select("*").eq("user_id", uid).order("payday"),
      supabase.from("income_entries").select("*").eq("user_id", uid).order("received_date"),
      supabase.from("goals").select("*").eq("user_id", uid).order("target_date"),
      supabase.from("transfers").select("*").eq("user_id", uid).order("transfer_date"),
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
    transfers: (transfers.data as TransferRow[]) ?? [],
  };
}
