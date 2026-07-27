/**
 * Dashboard-side "log a spend" card. Thin wrapper around the same quick form
 * the Budget page uses — logging a spend is the most frequent action in any
 * budget app, so it belongs on the glance screen too, not just behind
 * "Manage budget →".
 */
import { AddExpenseForm, type BucketOption } from "@/components/AddExpenseForm";
import type { DashboardData } from "@/lib/rows";

export function QuickSpend({
  data,
  balances,
  todayISO,
}: {
  data: DashboardData;
  balances?: Record<string, number>;
  todayISO: string;
}) {
  const funBucket = data.buckets.find((b) => b.is_flexible && !b.is_savings);
  const options: BucketOption[] = [
    { id: "", name: "Savings / leftover", balance: balances?.[""] },
    ...data.buckets.map((b) => ({
      id: b.id,
      name: b.name,
      balance: balances?.[b.id],
    })),
  ];

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300/80">
        Log a spend
      </p>
      <AddExpenseForm
        options={options}
        todayISO={todayISO}
        variant="quick"
        defaultBucketId={funBucket?.id ?? ""}
      />
    </div>
  );
}
