/**
 * Ops board row shapes (snake_case, as stored in Supabase).
 * No server dependencies — safe to import from server and browser code.
 */

export type OpsRepeat = "daily" | "weekly" | "monthly";

export const REPEAT_LABELS: Record<OpsRepeat, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/** Column icons offered on the board (keys of the icon set in OpsBoard). */
export const SECTION_ICONS = [
  ["home", "House"],
  ["store", "Storefront"],
  ["wrench", "Wrench"],
  ["tent", "Events"],
  ["megaphone", "Marketing"],
  ["key", "Key"],
  ["truck", "Truck"],
  ["clipboard", "Clipboard"],
] as const;

export interface OpsSectionRow {
  id: string;
  name: string;
  icon: string;
  /** Set = this column belongs to a property and shows its rent line. */
  property_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface OpsLineRow {
  id: string;
  section_id: string;
  name: string;
  info: string | null;
  /** false = tasks here have no due dates; red/orange show NA. */
  dated: boolean;
  sort_order: number;
  created_at: string;
}

export interface OpsTaskRow {
  id: string;
  line_id: string;
  title: string;
  assignee: string | null;
  due_date: string | null;
  repeat: OpsRepeat | null;
  notes: string | null;
  /** null = still open. */
  done_at: string | null;
  is_sample: boolean;
  created_at: string;
}

export type RentFrequency = "weekly" | "biweekly" | "monthly";

export const FREQUENCY_LABELS: Record<RentFrequency, string> = {
  weekly: "every week",
  biweekly: "every 2 weeks",
  monthly: "every month",
};

/** When a lease's payments are expected, if not on its monthly due day. */
export interface RentScheduleRow {
  id: string;
  lease_id: string;
  property_id: string;
  amount: number;
  frequency: RentFrequency;
  start_date: string;
  end_date: string | null;
  note: string | null;
  created_at: string;
}
