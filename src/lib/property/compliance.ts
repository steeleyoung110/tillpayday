/**
 * Paperwork status for each property — pure and tested.
 *
 * Leases: where each one stands.
 *   in_progress — running, more than `soonDays` from its end (or open-ended)
 *   due_soon    — ends within `soonDays` (default 60, about 2 months)
 *   past_due    — end date has passed but it was never renewed or closed out
 *   complete    — closed out (ended)
 *
 * Rental reports (short-term units): one upload per month or quarter of
 * completed stays. A period is due once it ends, and past due after its grace
 * days run out with nothing uploaded.
 */
import type { LeaseRow } from "./rows";

export const LEASE_SOON_DAYS = 60;

export type LeaseState = "in_progress" | "due_soon" | "past_due" | "complete";

export const LEASE_STATE_LABELS: Record<LeaseState, string> = {
  in_progress: "In progress",
  due_soon: "Due soon",
  past_due: "Past due",
  complete: "Complete",
};

const pad = (n: number) => String(n).padStart(2, "0");
const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
};
const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

export interface LeaseStatus {
  state: LeaseState;
  /** Days until the end date (negative = days since it passed); null = open-ended. */
  daysLeft: number | null;
}

export function leaseStatus(
  lease: Pick<LeaseRow, "status" | "end_date">,
  today: string,
  soonDays = LEASE_SOON_DAYS,
): LeaseStatus {
  if (lease.status === "ended") return { state: "complete", daysLeft: null };
  if (!lease.end_date) return { state: "in_progress", daysLeft: null };
  const n = diffDays(today, lease.end_date);
  if (n < 0) return { state: "past_due", daysLeft: n };
  if (n <= soonDays) return { state: "due_soon", daysLeft: n };
  return { state: "in_progress", daysLeft: n };
}

/**
 * The lease that governs a unit right now: the most recent one that hasn't
 * been closed out and has started. An expired lease nobody renewed still
 * counts — the tenant is still there, and it shows as past due.
 */
export function currentLease<L extends Pick<LeaseRow, "unit_id" | "status" | "start_date">>(
  leases: L[],
  unitId: string,
  today: string,
): L | null {
  const open = leases
    .filter((l) => l.unit_id === unitId && l.status === "active" && l.start_date <= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return open[0] ?? null;
}

// ---------------------------------------------------------------------------
// Rental reports
// ---------------------------------------------------------------------------

export type ReportCadence = "monthly" | "quarterly";
export type ReportState = "uploaded" | "in_progress" | "due" | "past_due";

export const DEFAULT_REPORT_DUE_DAYS: Record<ReportCadence, number> = { monthly: 15, quarterly: 30 };

export interface ReportPeriod {
  /** First day of the period. */
  start: string;
  /** Last day of the period. */
  end: string;
  /** "Oct 2026" or "Q4 2026". */
  label: string;
  /** Upload is past due after this day. */
  dueDate: string;
  state: ReportState;
  fileCount: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function periodStartFor(cadence: ReportCadence, iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const startMonth = cadence === "monthly" ? m : Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${pad(startMonth)}-01`;
}

function nextPeriodStart(cadence: ReportCadence, start: string): string {
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7)) + (cadence === "monthly" ? 1 : 3);
  return m > 12 ? `${y + 1}-${pad(m - 12)}-01` : `${y}-${pad(m)}-01`;
}

/**
 * Every period from the tracking start through the one running today,
 * newest first, with where its upload stands.
 */
export function reportPeriods(
  cadence: ReportCadence,
  trackingStart: string,
  dueDays: number | null,
  uploadedStarts: string[],
  today: string,
): ReportPeriod[] {
  const grace = dueDays ?? DEFAULT_REPORT_DUE_DAYS[cadence];
  const counts = new Map<string, number>();
  for (const s of uploadedStarts) counts.set(s, (counts.get(s) ?? 0) + 1);
  const out: ReportPeriod[] = [];
  let start = periodStartFor(cadence, trackingStart);
  for (let i = 0; i < 600 && start <= today; i += 1) {
    const next = nextPeriodStart(cadence, start);
    const end = addDays(next, -1);
    const dueDate = addDays(end, grace);
    const fileCount = counts.get(start) ?? 0;
    const m = Number(start.slice(5, 7));
    const label =
      cadence === "monthly" ? `${MONTHS[m - 1]} ${start.slice(0, 4)}` : `Q${Math.floor((m - 1) / 3) + 1} ${start.slice(0, 4)}`;
    const state: ReportState =
      fileCount > 0 ? "uploaded" : end >= today ? "in_progress" : today > dueDate ? "past_due" : "due";
    out.push({ start, end, label, dueDate, state, fileCount });
    start = next;
  }
  return out.reverse();
}

/** Tile counts for a property's report line. */
export function reportCounts(periods: ReportPeriod[]): { red: number; orange: number; blue: number } {
  const red = periods.filter((p) => p.state === "past_due").length;
  const orange = periods.filter((p) => p.state === "due").length;
  return { red, orange, blue: red + orange };
}

/**
 * Tile counts for a property's lease line: red = past due, orange = ending
 * within 2 months, blue = every lease that needs something (those, plus any
 * running lease without a signed copy on file).
 */
export function leaseCounts(
  items: { state: LeaseState; hasFile: boolean }[],
): { red: number; orange: number; blue: number } {
  let red = 0;
  let orange = 0;
  let blue = 0;
  for (const it of items) {
    if (it.state === "complete") continue;
    if (it.state === "past_due") red += 1;
    if (it.state === "due_soon") orange += 1;
    if (it.state === "past_due" || it.state === "due_soon" || !it.hasFile) blue += 1;
  }
  return { red, orange, blue };
}

export { addDays as addDaysISO, diffDays as diffDaysISO };
