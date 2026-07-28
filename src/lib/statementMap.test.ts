import { describe, expect, it } from "vitest";
import { bucketForCategory, type MappableBucket } from "./statementMap";

const b = (id: string, name: string, over: Partial<MappableBucket> = {}): MappableBucket => ({
  id,
  name,
  is_savings: false,
  is_flexible: false,
  ...over,
});

const jaydenBuckets = [
  b("bills", "Bills"),
  b("food", "Food"),
  b("fun", "Fun Money", { is_flexible: true }),
  b("save", "Savings", { is_savings: true }),
];

describe("bucketForCategory", () => {
  it("routes categories to same-named-meaning buckets", () => {
    expect(bucketForCategory("food", jaydenBuckets)).toBe("food");
    expect(bucketForCategory("bills", jaydenBuckets)).toBe("bills");
    expect(bucketForCategory("fun", jaydenBuckets)).toBe("fun");
  });

  it("savings/investment charges go to savings-leftover ('')", () => {
    expect(bucketForCategory("savings", jaydenBuckets)).toBe("");
    expect(bucketForCategory("investment", jaydenBuckets)).toBe("");
  });

  it("fun falls back to any flexible bucket when no fun-named bucket exists", () => {
    const buckets = [b("misc", "Misc", { is_flexible: true }), b("save", "Savings", { is_savings: true })];
    expect(bucketForCategory("fun", buckets)).toBe("misc");
  });

  it("unknown/other falls back to the first spending bucket, never savings", () => {
    expect(bucketForCategory("other", [b("groc", "Groceries"), b("save", "Savings", { is_savings: true })])).toBe("groc");
    expect(bucketForCategory("other", [b("save", "Savings", { is_savings: true })])).toBe("");
  });

  it("paused buckets are never targets", () => {
    const buckets = [
      b("food", "Food", { is_paused: true }),
      b("bills", "Bills"),
    ];
    expect(bucketForCategory("food", buckets)).toBe("bills");
  });
});
