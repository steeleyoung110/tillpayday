/**
 * Crisis mode: the plan for the worst day. If income stopped now — what's
 * essential, what gets paused first, and how long the money lasts in each
 * world. Composes runway (real spending pace) with a bills-only austerity
 * number and a ranked pause list.
 */
import type { BucketRow, ExpenseRow } from "@/lib/rows";

const DAYS_PER_MONTH = 30.44;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function monthly(e: { amount: number; cadence: string }): number {
  const amount = Number(e.amount);
  if (e.cadence === "monthly") return amount;
  if (e.cadence === "quarterly") return amount / 3;
  if (e.cadence === "yearly") return amount / 12;
  return 0;
}

export interface CrisisCandidate {
  expenseId: string;
  name: string;
  monthlyCost: number;
  bucketName: string;
  isPaused: boolean;
}

export interface CrisisPlan {
  liquid: number;
  /** Recurring bills in non-flexible buckets — the keep-the-lights-on load. */
  essentialMonthly: number;
  /** Days the liquid lasts covering ONLY essentials. */
  essentialRunwayDays: number | null;
  /** Bills in flexible (fun-adjacent) buckets, biggest first — pause these. */
  candidates: CrisisCandidate[];
  /** Monthly total the candidates free up if all paused. */
  cutMonthly: number;
}

export function crisisPlan(
  liquid: number,
  expenses: ExpenseRow[],
  buckets: BucketRow[],
): CrisisPlan {
  const flexibleIds = new Set(
    buckets.filter((b) => b.is_flexible && !b.is_savings).map((b) => b.id),
  );
  const nameById = new Map(buckets.map((b) => [b.id, b.name]));

  let essentialMonthly = 0;
  const candidates: CrisisCandidate[] = [];
  for (const e of expenses) {
    const m = monthly(e);
    if (m <= 0) continue; // one-time spends aren't a standing obligation
    if (e.bucket_id !== null && flexibleIds.has(e.bucket_id)) {
      candidates.push({
        expenseId: e.id,
        name: e.name,
        monthlyCost: round2(m),
        bucketName: nameById.get(e.bucket_id) ?? "its bucket",
        isPaused: e.is_paused,
      });
    } else if (!e.is_paused) {
      essentialMonthly += m;
    }
  }
  essentialMonthly = round2(essentialMonthly);
  candidates.sort((a, b) => b.monthlyCost - a.monthlyCost);

  const held = Math.max(liquid, 0);
  return {
    liquid: round2(held),
    essentialMonthly,
    essentialRunwayDays:
      essentialMonthly > 0
        ? Math.floor(held / (essentialMonthly / DAYS_PER_MONTH))
        : null,
    candidates,
    cutMonthly: round2(
      candidates.filter((c) => !c.isPaused).reduce((s, c) => s + c.monthlyCost, 0),
    ),
  };
}
