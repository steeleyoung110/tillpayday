"use client";

/**
 * Inline "comes out of" selector on each bill row: pick a different bucket
 * and it saves instantly with an undo toast — the fix for bills that fell
 * back to savings after a bucket was deleted.
 */
import { useTransition } from "react";
import { undoRestore, updateExpenseBucket } from "@/app/actions";
import { showToast } from "@/components/InstantAction";

export function ExpenseBucketSelect({
  expenseId,
  expenseName,
  current,
  buckets,
}: {
  expenseId: string;
  expenseName: string;
  current: string | null;
  buckets: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const nameFor = (id: string) =>
    buckets.find((b) => b.id === id)?.name ?? "Savings / leftover";

  return (
    <select
      value={current ?? ""}
      disabled={pending}
      title="Which bucket this bill comes out of"
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          const fd = new FormData();
          fd.append("id", expenseId);
          fd.append("bucket_id", next);
          const recipe = await updateExpenseBucket(fd);
          showToast(
            `${expenseName} now comes out of ${next ? nameFor(next) : "Savings / leftover"}.`,
            recipe
              ? () =>
                  startTransition(async () => {
                    const ufd = new FormData();
                    ufd.append("payload", JSON.stringify(recipe));
                    await undoRestore(ufd);
                    showToast("Put back 👍");
                  })
              : undefined,
          );
        });
      }}
      className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-emerald-400"
    >
      <option value="">Savings / leftover</option>
      {buckets.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
