/**
 * Database row shapes (snake_case, as stored in Supabase) and pure mappers onto
 * the camelCase engine types. This file has no server dependencies, so both
 * server and browser components may import it.
 */
import type {
  Bucket,
  Cadence,
  Expense,
  Frequency,
  IncomeEntry,
  IncomeKind,
  IncomeSource,
  Transfer,
} from "@/lib/engine";

export interface IncomeRow {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  kind: IncomeKind;
  anchor_date: string;
  created_at: string;
}

export interface BucketRow {
  id: string;
  name: string;
  allocation_type: "fixed" | "percent";
  allocation_value: number;
  is_savings: boolean;
  is_flexible: boolean;
  rolls_over: boolean;
  is_paused: boolean;
  include_in_net_worth: boolean;
  sort_order: number;
  apy: number;
  starting_balance: number;
  goal_amount: number;
  created_at: string;
}

// --- Net Worth module (phase 9) ---

export type AssetCategory =
  | "cash" | "savings" | "investment" | "retirement" | "property" | "vehicle" | "other";
export type LiabilityCategory =
  | "credit_card" | "auto_loan" | "student_loan" | "mortgage" | "personal_loan" | "other";

export interface AssetRow {
  id: string;
  name: string;
  category: AssetCategory;
  current_value: number;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface LiabilityRow {
  id: string;
  name: string;
  category: LiabilityCategory;
  current_balance: number;
  interest_rate: number | null;
  /** What you actually pay per month (0 = not set; payoff math needs it). */
  minimum_payment: number;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SnapshotRow {
  id: string;
  snapshot_date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  created_at: string;
}

/** Something worth saving toward, measured against the savings line. */
export interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  target_date: string;
  notes: string | null;
  achieved_at: string | null;
  is_archived: boolean;
  created_at: string;
}

/** A payday whose celebration screen has already been shown. */
export interface CelebratedPaydayRow {
  id: string;
  payday: string;
  created_at: string;
}

export interface ExpenseRow {
  id: string;
  name: string;
  amount: number;
  bucket_id: string | null;
  due_date: string;
  cadence: Cadence;
  is_paused: boolean;
  /** Contract watch: when this bill's contract renews (null = not tracked). */
  renewal_date: string | null;
  /** Who added this row (partner attribution; null on pre-0023 rows). */
  created_by: string | null;
  /** Roommate mode: how many ways this bill is split (1 = all yours). */
  split_ways: number;
  /** Autopay audit: true = autopay, false = manual, null = not classified. */
  autopay: boolean | null;
  created_at: string;
}

/** Your true share of a possibly-split bill. */
export function expenseShare(r: Pick<ExpenseRow, "amount" | "split_ways">): number {
  const ways = Number(r.split_ways) >= 2 ? Number(r.split_ways) : 1;
  return Math.round((Number(r.amount) / ways) * 100) / 100;
}

/** A logged income event (powers irregular mode and windfalls). */
export interface IncomeEntryRow {
  id: string;
  amount: number;
  received_date: string;
  note: string | null;
  is_windfall: boolean;
  windfall_allocation: { bucket_id: string | null; amount: number }[] | null;
  created_at: string;
}

export interface WhatIfRow {
  id: string;
  name: string;
  amount: number;
  target_date: string;
  bucket_id: string | null;
  status: "considering" | "bought" | "skipped";
  decided_at: string | null;
  /** When the 48h cooling-off timer was started (null = not started). */
  cooling_off_started_at: string | null;
  created_at: string;
}

export type NetWorthKind = "asset" | "liability";

export type NetWorthCategory =
  | "cash"
  | "savings"
  | "investment"
  | "property"
  | "vehicle"
  | "other_asset"
  | "credit_card"
  | "student_loan"
  | "auto_loan"
  | "mortgage"
  | "other_debt";

export interface NetWorthRow {
  id: string;
  name: string;
  kind: NetWorthKind;
  category: NetWorthCategory;
  amount: number;
  apy: number;
  created_at: string;
}

/** Categories that count as spendable money (they seed the projection's savings). */
export const LIQUID_CATEGORIES: NetWorthCategory[] = ["cash", "savings"];

/** A deliberate move of money between buckets (null = savings/leftover). */
export interface TransferRow {
  id: string;
  from_bucket_id: string | null;
  to_bucket_id: string | null;
  amount: number;
  transfer_date: string;
  note: string | null;
  created_at: string;
}

export interface DashboardData {
  income: IncomeRow[];
  buckets: BucketRow[];
  expenses: ExpenseRow[];
  whatIf: WhatIfRow[];
  netWorth: NetWorthRow[];
  celebrated: CelebratedPaydayRow[];
  incomeEntries: IncomeEntryRow[];
  goals: GoalRow[];
  transfers: TransferRow[];
}

export function incomeToEngine(r: IncomeRow): IncomeSource {
  return {
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    frequency: r.frequency,
    kind: r.kind,
    anchorDate: r.anchor_date,
  };
}

export function bucketToEngine(r: BucketRow): Bucket {
  return {
    id: r.id,
    name: r.name,
    allocationType: r.allocation_type,
    allocationValue: Number(r.allocation_value),
    isSavings: r.is_savings,
    isFlexible: r.is_flexible,
    rollsOver: r.rolls_over,
    isPaused: r.is_paused,
    priority: r.sort_order,
    startingBalance: Number(r.starting_balance ?? 0),
    apy: Number(r.apy ?? 0),
  };
}

export function expenseToEngine(r: ExpenseRow): Expense {
  return {
    id: r.id,
    name: r.name,
    // Split bills hit YOUR money at your share — the engine only ever sees
    // the part you actually pay.
    amount: expenseShare(r),
    bucketId: r.bucket_id,
    dueDate: r.due_date,
    cadence: r.cadence,
    isPaused: r.is_paused,
  };
}

export function transferToEngine(r: TransferRow): Transfer {
  return {
    id: r.id,
    fromBucketId: r.from_bucket_id,
    toBucketId: r.to_bucket_id,
    amount: Number(r.amount),
    date: r.transfer_date,
  };
}

export function incomeEntryToEngine(r: IncomeEntryRow): IncomeEntry {
  return {
    id: r.id,
    amount: Number(r.amount),
    receivedDate: r.received_date,
    note: r.note,
    isWindfall: r.is_windfall,
    allocation:
      r.windfall_allocation?.map((a) => ({
        bucketId: a.bucket_id,
        amount: Number(a.amount),
      })) ?? null,
  };
}
