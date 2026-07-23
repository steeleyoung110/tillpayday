/** Domain types shared by the projection engine and the UI. */

export type Frequency =
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  /** "It varies" — projected from logged income entries, not a fixed schedule. */
  | "irregular";
export type IncomeKind = "paycheck" | "side";
export type AllocationType = "fixed" | "percent";
export type Cadence = "one_time" | "monthly" | "quarterly" | "yearly";

/** A recurring source of money. */
export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  /**
   * "paycheck" income is divided among buckets by their allocation rules.
   * "side" income is treated as unallocated and flows straight to savings.
   */
  kind: IncomeKind;
  /** One known real pay date; all future pay dates are projected from it. */
  anchorDate: string; // YYYY-MM-DD
}

/** A named envelope that paychecks are divided into. */
export interface Bucket {
  id: string;
  name: string;
  allocationType: AllocationType;
  /** Dollars (when "fixed") or percent 0–100 (when "percent"). */
  allocationValue: number;
  /** Exactly one bucket should be the savings bucket; it receives leftovers. */
  isSavings: boolean;
  /**
   * Flexible day-to-day spending money (fun, groceries…) as opposed to
   * earmarked bills. Safe-to-spend divides these balances by days-to-payday.
   */
  isFlexible?: boolean;
  /**
   * Sinking fund: keeps its balance between paychecks instead of being swept
   * to savings, so its allocation stacks up every payday (a Concert fund
   * growing $100/check) and drains when its expenses hit.
   */
  rollsOver?: boolean;
  /**
   * Funding priority (lower = funded first). When a paycheck can't cover every
   * bucket, money flows down this order and the tail goes underfunded.
   */
  priority?: number;
  /**
   * Starting balance at simulation start (mid-cycle). Meaningful for the
   * savings bucket; the UI stores it in `buckets.starting_balance`.
   */
  startingBalance?: number;
  /**
   * Annual percentage yield (%) of the real account backing this bucket, e.g.
   * 3 for a high-yield savings account or 0.02 for a big-bank one. Interest
   * accrues daily on positive balances and is credited monthly.
   */
  apy?: number;
  /** Paused buckets are frozen: no refill, no sweep — balance stays put. */
  isPaused?: boolean;
}

/** One real income event, logged as it arrived (powers irregular mode). */
export interface IncomeEntry {
  id: string;
  amount: number;
  receivedDate: string; // YYYY-MM-DD
  note?: string | null;
  /** One-time money above the usual — bonuses, tax refunds, gifts. */
  isWindfall?: boolean;
  /**
   * Where a windfall goes: explicit portions per bucket (null bucketId =
   * savings). Whatever the portions don't cover also lands in savings.
   */
  allocation?: { bucketId: string | null; amount: number }[] | null;
}

/** A planned expense that draws down a bucket on its due date, then repeats. */
export interface Expense {
  id: string;
  name: string;
  amount: number;
  /** Which bucket funds this. If null, it draws from the savings bucket. */
  bucketId: string | null;
  dueDate: string; // YYYY-MM-DD (first occurrence)
  cadence: Cadence;
  /** Paused expenses don't deduct while paused. */
  isPaused?: boolean;
}

/** A purchase the user is considering — modeled as a one-time expense. */
export interface WhatIfItem {
  id: string;
  name: string;
  amount: number;
  targetDate: string; // YYYY-MM-DD
  /** Which bucket it hits. If null, it draws from the savings bucket. */
  bucketId: string | null;
}

export interface ProjectionInput {
  /** Simulation start date (usually today). */
  startDate: string; // YYYY-MM-DD
  /** Horizon length in months (default 12). */
  months: number;
  /** Optional starting balance per bucket id (defaults to 0). */
  startingBalances?: Record<string, number>;
  incomeSources: IncomeSource[];
  buckets: Bucket[];
  expenses: Expense[];
  /**
   * Logged income history. Feeds the irregular-income baseline, and windfall
   * entries dated inside the horizon inject on their date.
   */
  incomeEntries?: IncomeEntry[];
}

/** One day of the projection. */
export interface ProjectionPoint {
  date: string; // YYYY-MM-DD
  /** Total money on hand across all buckets. */
  total: number;
  /** Balance in the savings bucket (0 if there is no savings bucket). */
  savings: number;
  /** Balance per bucket id (includes the implicit "unallocated" pool). */
  buckets: Record<string, number>;
}

/** A paycheck couldn't fully fund a bucket (funded in priority order). */
export interface UnderfundedWarning {
  type: "underfunded";
  bucketId: string;
  bucketName: string;
  /** Payday it first happened. */
  date: string;
  /** What the bucket's allocation rule asked for. */
  requested: number;
  /** What it actually received. */
  funded: number;
}

/** An expense hit a bucket that didn't have enough — the bucket went negative. */
export interface ShortfallWarning {
  type: "shortfall";
  bucketId: string;
  bucketName: string;
  /** Due date of the expense that caused it. */
  date: string;
  /** Human month it lands in, e.g. "March 2027". */
  month: string;
  /** How many dollars short the bucket was. */
  amount: number;
  /** Paydays between the simulation start and the shortfall (inclusive). */
  paydaysUntil: number;
  /**
   * The fix: the smallest extra amount to set aside from each paycheck,
   * starting now, that prevents this shortfall. Null when no paydays land
   * before it (no paycheck can help in time).
   */
  fixPerPaycheck: number | null;
}

export type Warning = UnderfundedWarning | ShortfallWarning;

export interface ProjectionResult {
  points: ProjectionPoint[];
  warnings: Warning[];
  endingTotal: number;
  endingSavings: number;
  /** Total income paid out across the horizon (for conservation checks). */
  totalIncome: number;
  /** Total interest credited across the horizon. */
  totalInterest: number;
  /**
   * When irregular income is in play: the conservative weekly amount the
   * projection assumed (85% of the trailing 8-week average of logged
   * entries). Null when no irregular income source exists. The UI labels
   * such projections "based on your typical income."
   */
  irregularWeekly: number | null;
}

/** The verdict comparing a baseline projection to a "with purchase" projection. */
export interface WhatIfVerdict {
  /** Ending total money without the purchase. */
  endingWithout: number;
  /** Ending total money with the purchase. */
  endingWith: number;
  /** How many days the purchase pushes your savings back. */
  setbackDays: number;
  /** Human-friendly setback, e.g. "3 weeks" or "about 2 months". */
  setbackLabel: string;
  /** True if the purchase drives any bucket negative at some point. */
  causesNegative: boolean;
  /** Warnings from the "with purchase" projection. */
  warnings: Warning[];
}
