/**
 * Semantic bucket colors (the virtue spectrum): green = money working for
 * you, yellow = food, orange = bills you must pay, red = fun / wants.
 * New buckets self-classify by name so the palette stays meaningful —
 * an "Index funds" bucket lands green-ish, an "Impulse buys" bucket red.
 */

export type SpendCategory =
  | "savings"
  | "investment"
  | "food"
  | "bills"
  | "fun"
  | "other";

const MATCHERS: [SpendCategory, RegExp][] = [
  ["investment", /invest|stock|index|brokerage|retire|401k|\bira\b|crypto|dividend/i],
  ["food", /food|grocer|eat|meal|dining|kitchen|lunch|snack|coffee/i],
  [
    "bills",
    /bill|rent|mortgage|utilit|insurance|essential|needs|electric|water|internet|phone|\bgas\b|car|auto|loan|debt|credit/i,
  ],
  [
    "fun",
    /fun|entertain|concert|game|party|shopp|impulse|wants|hobby|going out|bar|drink|vacation|trip|travel|toy/i,
  ],
];

export function classifyBucket(
  name: string,
  opts: { isSavings?: boolean; isFlexible?: boolean } = {},
): SpendCategory {
  if (opts.isSavings) return "savings";
  for (const [category, re] of MATCHERS) {
    if (re.test(name)) return category;
  }
  // Unlabeled flexible money is spending money — treat it as fun.
  if (opts.isFlexible) return "fun";
  return "other";
}

/** Shade ramps per family — first bucket in a family gets the brightest. */
const FAMILY_SHADES: Record<SpendCategory, string[]> = {
  savings: ["#22c55e", "#4ade80", "#86efac"], // bright greens
  investment: ["#2dd4bf", "#5eead4", "#10b981"], // green-teal — still virtuous
  food: ["#eab308", "#facc15", "#fde047"], // yellows
  bills: ["#f97316", "#fb923c", "#fdba74"], // oranges
  fun: ["#ef4444", "#f87171", "#fca5a5"], // reds — the caution end
  other: ["#f59e0b", "#fbbf24", "#fcd34d"], // amber middle ground
};

/** Color for a plan slice: family by meaning, shade by order within family. */
export function planColor(category: SpendCategory, indexInFamily: number): string {
  const ramp = FAMILY_SHADES[category];
  return ramp[indexInFamily % ramp.length];
}

/** Bright red shades for spent slices — every spend reads as an outflow. */
const SPENT_REDS = ["#ef4444", "#f43f5e", "#dc2626", "#fb7185", "#b91c1c", "#f87171"];
export function spentRed(index: number): string {
  return SPENT_REDS[index % SPENT_REDS.length];
}

/** The one green on the spent chart: money still unspent. */
export const UNSPENT_GREEN = "#22c55e";
