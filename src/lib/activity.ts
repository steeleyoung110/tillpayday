/**
 * Activity feed: everything that changed recently, merged newest-first —
 * spends logged, transfers moved, income landed, bill amounts edited. With
 * partners able to write now, the "who" matters: rows created by someone
 * other than the owner carry their email.
 */
import type { ExpenseRow, IncomeEntryRow, TransferRow } from "@/lib/rows";

const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export interface ActivityItem {
  at: string; // ISO timestamp (sort key)
  day: string; // YYYY-MM-DD for display
  text: string;
  /** Email of the partner who did it (null = the owner). */
  by: string | null;
}

export function buildActivity(
  ownerId: string,
  expenses: ExpenseRow[],
  transfers: TransferRow[],
  entries: IncomeEntryRow[],
  amountEdits: { expense_id: string; old_amount: number; new_amount: number; changed_at: string }[],
  bucketNameById: Map<string, string>,
  partnerEmailByUid: Map<string, string>,
  sinceISO: string,
  limit = 12,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  const bucketName = (id: string | null) =>
    id === null ? "Savings / leftover" : bucketNameById.get(id) ?? "a bucket";

  for (const e of expenses) {
    if (e.created_at < sinceISO) continue;
    const by =
      e.created_by && e.created_by !== ownerId
        ? partnerEmailByUid.get(e.created_by) ?? "a partner"
        : null;
    items.push({
      at: e.created_at,
      day: e.created_at.slice(0, 10),
      text:
        e.cadence === "one_time"
          ? `logged ${e.name} — ${cents.format(Number(e.amount))} out of ${bucketName(e.bucket_id)}`
          : `added the bill ${e.name} — ${cents.format(Number(e.amount))}`,
      by,
    });
  }
  for (const t of transfers) {
    if (t.created_at < sinceISO) continue;
    items.push({
      at: t.created_at,
      day: t.created_at.slice(0, 10),
      text: `moved ${cents.format(Number(t.amount))}: ${bucketName(t.from_bucket_id)} → ${bucketName(t.to_bucket_id)}`,
      by: null,
    });
  }
  for (const i of entries) {
    if (i.created_at < sinceISO) continue;
    items.push({
      at: i.created_at,
      day: i.created_at.slice(0, 10),
      text: `${i.is_windfall ? "logged a windfall" : "logged income"} — ${cents.format(Number(i.amount))}`,
      by: null,
    });
  }
  const expenseName = new Map(expenses.map((e) => [e.id, e.name]));
  for (const h of amountEdits) {
    if (h.changed_at < sinceISO) continue;
    const name = expenseName.get(h.expense_id);
    if (!name) continue;
    items.push({
      at: h.changed_at,
      day: h.changed_at.slice(0, 10),
      text: `changed ${name}: ${cents.format(Number(h.old_amount))} → ${cents.format(Number(h.new_amount))}`,
      by: null,
    });
  }

  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}
