import { describe, expect, it } from "vitest";
import { buildActivity } from "./activity";
import type { ExpenseRow, IncomeEntryRow, TransferRow } from "./rows";

const OWNER = "owner-uid";
const PARTNER = "partner-uid";

const expense = (over: Partial<ExpenseRow>): ExpenseRow =>
  ({
    id: "e1", name: "McDonald's", amount: 12.5, bucket_id: "fun",
    due_date: "2026-08-01", cadence: "one_time", is_paused: false,
    renewal_date: null, created_by: OWNER, split_ways: 1,
    created_at: "2026-08-01T12:00:00Z", ...over,
  }) as ExpenseRow;

describe("buildActivity", () => {
  const buckets = new Map([["fun", "Fun"]]);
  const partners = new Map([[PARTNER, "sam@x.com"]]);

  it("merges kinds newest-first with partner attribution", () => {
    const items = buildActivity(
      OWNER,
      [
        expense({}),
        expense({ id: "e2", created_by: PARTNER, created_at: "2026-08-02T09:00:00Z" }),
      ],
      [
        {
          id: "t1", from_bucket_id: "fun", to_bucket_id: null, amount: 40,
          transfer_date: "2026-08-01", note: null, created_at: "2026-08-01T15:00:00Z",
        } as TransferRow,
      ],
      [
        {
          id: "i1", amount: 1500, received_date: "2026-08-03", note: null,
          is_windfall: false, windfall_allocation: null,
          created_at: "2026-08-03T08:00:00Z",
        } as IncomeEntryRow,
      ],
      [{ expense_id: "e1", old_amount: 12.5, new_amount: 14, changed_at: "2026-08-04T10:00:00Z" }],
      buckets,
      partners,
      "2026-07-28",
    );
    expect(items.map((i) => i.at)).toEqual([
      "2026-08-04T10:00:00Z",
      "2026-08-03T08:00:00Z",
      "2026-08-02T09:00:00Z",
      "2026-08-01T15:00:00Z",
      "2026-08-01T12:00:00Z",
    ]);
    expect(items[2].by).toBe("sam@x.com");
    expect(items[4].by).toBeNull();
    expect(items[0].text).toContain("$12.50 → $14.00");
    expect(items[3].text).toContain("Fun → Savings / leftover");
  });

  it("drops items before the window and respects the limit", () => {
    const items = buildActivity(
      OWNER,
      [expense({ created_at: "2026-07-01T00:00:00Z" })],
      [], [], [], buckets, partners, "2026-07-28",
    );
    expect(items).toHaveLength(0);
  });
});
