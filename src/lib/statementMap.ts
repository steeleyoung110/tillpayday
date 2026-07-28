/**
 * Map an extracted transaction's semantic category onto the user's actual
 * buckets — a "food" charge should land in whatever THEY call their food
 * bucket. Falls back sensibly instead of guessing wildly. Pure.
 */
import { classifyBucket, type SpendCategory } from "@/lib/bucketColor";

export interface MappableBucket {
  id: string;
  name: string;
  is_savings: boolean;
  is_flexible: boolean;
  is_paused?: boolean;
}

/**
 * Pick the bucket id for a category ("" = savings/leftover). Preference:
 * a bucket that classifies to the same category → for "fun", any flexible
 * bucket → for everything else, the first non-savings bucket → savings.
 */
export function bucketForCategory(
  category: string,
  buckets: MappableBucket[],
): string {
  const active = buckets.filter((b) => !b.is_paused);
  const byCategory = (cat: SpendCategory) =>
    active.find(
      (b) =>
        !b.is_savings &&
        classifyBucket(b.name, {
          isSavings: b.is_savings,
          isFlexible: b.is_flexible,
        }) === cat,
    );

  const direct = byCategory(category as SpendCategory);
  if (direct) return direct.id;

  if (category === "savings" || category === "investment") return "";
  if (category === "fun") {
    const flexible = active.find((b) => b.is_flexible && !b.is_savings);
    if (flexible) return flexible.id;
  }
  const firstSpending = active.find((b) => !b.is_savings);
  return firstSpending?.id ?? "";
}
