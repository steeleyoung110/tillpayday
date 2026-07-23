/**
 * Starter templates: one-tap bucket setups offered when an account has no
 * buckets yet. Pure data — the applyTemplate server action inserts these rows.
 *
 * Percent buckets take their share of each paycheck (after any fixed buckets);
 * whatever a template leaves unallocated flows to the savings bucket
 * automatically, so "rest to savings" needs no explicit allocation.
 */

export interface TemplateBucket {
  name: string;
  allocation_type: "percent";
  allocation_value: number;
  is_savings: boolean;
  is_flexible: boolean;
  sort_order: number;
}

export interface StarterTemplate {
  key: string;
  title: string;
  tagline: string;
  /** Human summary of where each paycheck goes, shown on the card. */
  breakdown: string[];
  buckets: TemplateBucket[];
}

const bucket = (
  name: string,
  pct: number,
  sort: number,
  opts: { savings?: boolean; flexible?: boolean } = {},
): TemplateBucket => ({
  name,
  allocation_type: "percent",
  allocation_value: pct,
  is_savings: opts.savings ?? false,
  is_flexible: opts.flexible ?? false,
  sort_order: sort,
});

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: "simple",
    title: "Simple",
    tagline: "Three buckets, zero thinking.",
    breakdown: ["Bills 50%", "Life 30% 💸", "Fun 20% 💸", "leftovers → Savings"],
    buckets: [
      bucket("Bills", 50, 0),
      bucket("Life", 30, 1, { flexible: true }),
      bucket("Fun", 20, 2, { flexible: true }),
      bucket("Savings", 0, 3, { savings: true }),
    ],
  },
  {
    key: "fifty-thirty-twenty",
    title: "50/30/20",
    tagline: "The classic budgeting rule.",
    breakdown: ["Needs 50%", "Wants 30% 💸", "Savings gets the remaining 20%"],
    buckets: [
      bucket("Needs", 50, 0),
      bucket("Wants", 30, 1, { flexible: true }),
      bucket("Savings", 0, 2, { savings: true }),
    ],
  },
  {
    key: "aggressive-saver",
    title: "Aggressive saver",
    tagline: "Keep lifestyle lean, bank the rest.",
    breakdown: ["Bills 50%", "Essentials 25%", "Fun 10% 💸", "Savings gets the remaining 15%"],
    buckets: [
      bucket("Bills", 50, 0),
      bucket("Essentials", 25, 1),
      bucket("Fun", 10, 2, { flexible: true }),
      bucket("Savings", 0, 3, { savings: true }),
    ],
  },
];

export function getTemplate(key: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.key === key);
}
