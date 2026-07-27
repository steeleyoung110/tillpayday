/**
 * Subscription auditor: every repeating bill, annualized. Nobody multiplies
 * $14.99 by 12 in their head — this does, sums the damage, and names the
 * cancel candidates. Pure and unit-tested.
 */
import { classifyBucket } from "@/lib/bucketColor";
import type { BucketRow, ExpenseRow, IncomeRow } from "@/lib/rows";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Occurrences per year for each repeating cadence. */
const PER_YEAR: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

/** Paychecks per year for each income frequency. */
const CHECKS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export interface SubscriptionRow {
  expenseId: string;
  name: string;
  amount: number;
  cadence: string;
  perYear: number;
  yearlyCost: number;
  bucketName: string | null;
  /** Feeds a fun-classified bucket — the first place to look when trimming. */
  cancelCandidate: boolean;
  isPaused: boolean;
}

export interface SubscriptionAudit {
  rows: SubscriptionRow[];
  /** Total yearly cost of ACTIVE repeating bills. */
  yearlyTotal: number;
  /** Yearly income from regular paychecks (0 when unknown). */
  yearlyIncome: number;
  /** Active repeating bills as a share of income, 0–100 (null when unknown). */
  pctOfIncome: number | null;
}

export function auditSubscriptions(
  expenses: ExpenseRow[],
  buckets: BucketRow[],
  income: IncomeRow[],
): SubscriptionAudit {
  const bucketById = new Map(buckets.map((b) => [b.id, b]));

  const rows: SubscriptionRow[] = expenses
    .filter((e) => e.cadence !== "one_time")
    .map((e) => {
      const perYear = PER_YEAR[e.cadence] ?? 0;
      const bucket = e.bucket_id ? bucketById.get(e.bucket_id) : undefined;
      const category = bucket
        ? classifyBucket(bucket.name, {
            isSavings: bucket.is_savings,
            isFlexible: bucket.is_flexible,
          })
        : null;
      return {
        expenseId: e.id,
        name: e.name,
        amount: Number(e.amount),
        cadence: e.cadence,
        perYear,
        yearlyCost: round2(Number(e.amount) * perYear),
        bucketName: bucket?.name ?? null,
        cancelCandidate: category === "fun",
        isPaused: e.is_paused,
      };
    })
    .sort((a, b) => b.yearlyCost - a.yearlyCost);

  const yearlyTotal = round2(
    rows.filter((r) => !r.isPaused).reduce((s, r) => s + r.yearlyCost, 0),
  );

  const yearlyIncome = round2(
    income
      .filter((s) => s.kind === "paycheck")
      .reduce(
        (s, i) => s + Number(i.amount) * (CHECKS_PER_YEAR[i.frequency] ?? 0),
        0,
      ),
  );

  return {
    rows,
    yearlyTotal,
    yearlyIncome,
    pctOfIncome:
      yearlyIncome > 0
        ? Math.round((yearlyTotal / yearlyIncome) * 1000) / 10
        : null,
  };
}
