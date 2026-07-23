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
  IncomeKind,
  IncomeSource,
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
  sort_order: number;
  apy: number;
  starting_balance: number;
  goal_amount: number;
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

export interface DashboardData {
  income: IncomeRow[];
  buckets: BucketRow[];
  expenses: ExpenseRow[];
  whatIf: WhatIfRow[];
  netWorth: NetWorthRow[];
  celebrated: CelebratedPaydayRow[];
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
    priority: r.sort_order,
    startingBalance: Number(r.starting_balance ?? 0),
    apy: Number(r.apy ?? 0),
  };
}

export function expenseToEngine(r: ExpenseRow): Expense {
  return {
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    bucketId: r.bucket_id,
    dueDate: r.due_date,
    cadence: r.cadence,
  };
}
