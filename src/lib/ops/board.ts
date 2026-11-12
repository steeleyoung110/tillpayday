/**
 * Ops board math — pure and tested. Works on calendar days as YYYY-MM-DD.
 *
 * Tiles follow one rule everywhere:
 *   red    = past due and not finished
 *   orange = due today through the next `soonDays` days
 *   blue   = everything still open
 * A tile with nothing in it shows a thumbs-up instead of 0.
 */
import type { LeaseRow, RentPaymentRow } from "@/lib/property/rows";
import type { OpsLineRow, OpsRepeat, OpsTaskRow, RentFrequency, RentScheduleRow } from "./rows";

export const SOON_DAYS = 7;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** A YYYY-MM-DD date in a believable range (typing in a date field can yield year 0525). */
export const isISODate = (s: unknown): s is string =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number(s.slice(0, 4)) >= 2000 &&
  Number(s.slice(0, 4)) <= 2100;

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

/** Same day-of-month k months later, clamped to the month's last day. */
export function addMonths(iso: string, k: number, anchorDay?: number): string {
  const d = parse(iso);
  const day = anchorDay ?? d.getUTCDate();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return isoOf(first);
}

/** b − a in whole days. */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** Today's date in a time zone (the board runs on New Hampshire time). */
export function todayIn(timeZone = "America/New_York", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Calendar day a timestamp falls on in a time zone ("" if unparseable). */
export function dayOf(ts: string | null, timeZone = "America/New_York"): string {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : todayIn(timeZone, d);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type Bucket = "red" | "orange" | "open" | "done";

export function taskBucket(
  t: Pick<OpsTaskRow, "done_at" | "due_date">,
  today: string,
  soonDays = SOON_DAYS,
): Bucket {
  if (t.done_at) return "done";
  if (!t.due_date) return "open";
  const n = diffDays(today, t.due_date);
  if (n < 0) return "red";
  if (n <= soonDays) return "orange";
  return "open";
}

export interface TileCounts {
  /** null = this line doesn't track due dates (tile shows NA). */
  red: number | null;
  orange: number | null;
  blue: number;
}

export function lineCounts(
  line: Pick<OpsLineRow, "id" | "dated">,
  tasks: Pick<OpsTaskRow, "line_id" | "done_at" | "due_date">[],
  today: string,
  soonDays = SOON_DAYS,
): TileCounts {
  const open = tasks.filter((t) => t.line_id === line.id && !t.done_at);
  if (!line.dated) return { red: null, orange: null, blue: open.length };
  let red = 0;
  let orange = 0;
  for (const t of open) {
    const b = taskBucket(t, today, soonDays);
    if (b === "red") red += 1;
    else if (b === "orange") orange += 1;
  }
  return { red, orange, blue: open.length };
}

/**
 * Next due date for a repeating task finished today: step from its last due
 * date until the result is after today, so a weekly task finished three weeks
 * late lands next week, not three weeks in the past.
 */
export function nextDue(due: string, repeat: OpsRepeat, today: string): string {
  const day = Number(due.slice(8, 10));
  let n = due;
  let k = 0;
  for (let guard = 0; guard < 2000; guard += 1) {
    if (repeat === "daily") n = addDays(n, 1);
    else if (repeat === "weekly") n = addDays(n, 7);
    else {
      k += 1;
      n = addMonths(due, k, day);
    }
    if (n > today) return n;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Rent installments
// ---------------------------------------------------------------------------

export type InstallmentStatus = "paid" | "partial" | "promised" | "due";

export interface Installment {
  /** Stable key: schedule id (or "lease:<id>") + date. */
  key: string;
  /** Payment plan this belongs to; null = the lease's own monthly due day. */
  scheduleId: string | null;
  leaseId: string;
  propertyId: string;
  date: string;
  amount: number;
  received: number;
  pending: number;
  /** Pending payments answering this installment (to mark received). */
  promised: { id: string; amount: number; expectedDate: string | null }[];
  status: InstallmentStatus;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Due dates for a schedule between `from` and `to`, inclusive. */
export function scheduleDates(
  frequency: RentFrequency,
  start: string,
  end: string | null,
  from: string,
  to: string,
): string[] {
  const out: string[] = [];
  const last = end && end < to ? end : to;
  const startDay = Number(start.slice(8, 10));
  let d = start;
  for (let i = 0; i < 5000 && d <= last; i += 1) {
    if (d >= from) out.push(d);
    d =
      frequency === "weekly"
        ? addDays(start, 7 * (i + 1))
        : frequency === "biweekly"
          ? addDays(start, 14 * (i + 1))
          : addMonths(start, i + 1, startDay);
  }
  return out;
}

/** Days after an installment that an unlinked payment can still answer it. */
const MATCH_AFTER: Record<RentFrequency, number> = { weekly: 6, biweekly: 13, monthly: 27 };
const MATCH_BEFORE = 3;

type Pay = Pick<
  RentPaymentRow,
  "id" | "amount" | "status" | "paid_date" | "expected_date" | "lease_id" | "property_id" | "period_month"
> &
  Partial<Pick<RentPaymentRow, "schedule_id" | "installment_date">>;

const payDay = (p: Pay) => (p.status === "pending" ? p.expected_date : p.paid_date) ?? "";

function applyPayment(inst: Installment, p: Pay) {
  const amt = Number(p.amount);
  if (p.status === "pending") {
    inst.pending = round2(inst.pending + amt);
    inst.promised.push({ id: p.id, amount: amt, expectedDate: p.expected_date ?? null });
  } else {
    inst.received = round2(inst.received + amt);
  }
}

function settle(inst: Installment) {
  const left = inst.amount - inst.received;
  if (left <= 0.005) inst.status = "paid";
  else if (inst.received + inst.pending >= inst.amount - 0.005) inst.status = "promised";
  else if (inst.received > 0) inst.status = "partial";
  else inst.status = "due";
}

export interface InstallmentInput {
  schedules: Pick<RentScheduleRow, "id" | "lease_id" | "property_id" | "amount" | "frequency" | "start_date" | "end_date">[];
  leases: Pick<LeaseRow, "id" | "unit_id" | "rent_amount" | "due_day" | "start_date" | "end_date" | "status">[];
  /** unit id → property id, to place monthly-lease installments. */
  unitProperty: Map<string, string>;
  payments: Pay[];
  today: string;
  /** How far ahead to list upcoming installments. */
  horizonDays?: number;
  /** How far back to look for unpaid monthly-lease installments. */
  monthlyLookbackDays?: number;
  /** How far back to look for unpaid payment-plan installments. */
  scheduleLookbackDays?: number;
}

/**
 * Every rent installment from today − lookback through today + horizon, with
 * what has been received or promised against it.
 *
 * A lease with an active payment plan is tracked by the plan; any other active
 * lease covering today is tracked on its monthly due day. Payments logged from
 * the board answer their installment exactly; payments logged elsewhere (the
 * property ledger) are matched by date — within a few days of a plan's due
 * date, or by the month they cover for monthly rent — so the board and the
 * ledger never disagree.
 */
export function buildInstallments(input: InstallmentInput): Installment[] {
  const {
    schedules,
    leases,
    unitProperty,
    payments,
    today,
    horizonDays = SOON_DAYS,
    monthlyLookbackDays = 62,
    scheduleLookbackDays = 120,
  } = input;
  const to = addDays(today, horizonDays);
  const out: Installment[] = [];
  const used = new Set<string>();

  // Payments already tied to an installment by the board.
  const linked = new Map<string, Pay[]>();
  for (const p of payments) {
    if (!p.installment_date) continue;
    const k = `${p.schedule_id ?? `lease:${p.lease_id}`}|${p.installment_date}`;
    linked.set(k, [...(linked.get(k) ?? []), p]);
  }

  // --- Payment plans ---------------------------------------------------------
  const planned = new Set<string>();
  for (const s of schedules) {
    if (s.end_date && s.end_date < addDays(today, -scheduleLookbackDays)) continue;
    planned.add(s.lease_id);
    const lease = leases.find((l) => l.id === s.lease_id);
    const propertyId = s.property_id;
    const dates = scheduleDates(s.frequency, s.start_date, s.end_date, addDays(today, -scheduleLookbackDays), to);
    const insts: Installment[] = dates.map((date) => ({
      key: `${s.id}|${date}`,
      scheduleId: s.id,
      leaseId: s.lease_id,
      propertyId,
      date,
      amount: Number(s.amount),
      received: 0,
      pending: 0,
      promised: [],
      status: "due",
    }));
    for (const inst of insts) {
      for (const p of linked.get(inst.key) ?? []) {
        applyPayment(inst, p);
        used.add(p.id);
      }
    }
    // Unlinked payments for this lease (or this property, when it has no
    // lease recorded on the payment), matched to the earliest open installment
    // whose window holds the payment date.
    const candidates = payments
      .filter(
        (p) =>
          !p.installment_date &&
          !used.has(p.id) &&
          (p.lease_id === s.lease_id || (!p.lease_id && p.property_id === propertyId && !!lease)) &&
          payDay(p) >= addDays(s.start_date, -MATCH_BEFORE),
      )
      .sort((a, b) => payDay(a).localeCompare(payDay(b)));
    for (const p of candidates) {
      const day = payDay(p);
      const target = insts.find(
        (i) =>
          i.received + i.pending < i.amount - 0.005 &&
          day >= addDays(i.date, -MATCH_BEFORE) &&
          day <= addDays(i.date, MATCH_AFTER[s.frequency]),
      );
      if (target) {
        applyPayment(target, p);
        used.add(p.id);
      }
    }
    insts.forEach(settle);
    out.push(...insts);
  }

  // --- Monthly leases without a plan -----------------------------------------
  for (const l of leases) {
    if (planned.has(l.id) || l.status !== "active") continue;
    if (l.start_date > today || (l.end_date && l.end_date < today)) continue;
    const propertyId = unitProperty.get(l.unit_id);
    if (!propertyId || Number(l.rent_amount) <= 0) continue;
    const from = addDays(today, -monthlyLookbackDays);
    const day = Math.min(Math.max(l.due_day, 1), 28);
    // First due date on or after the lease start.
    let d = `${l.start_date.slice(0, 8)}${pad(day)}`;
    if (d < l.start_date) d = addMonths(d, 1, day);
    const insts: Installment[] = [];
    for (let i = 0; i < 600 && d <= to; i += 1) {
      if (d >= from && (!l.end_date || d <= l.end_date)) {
        insts.push({
          key: `lease:${l.id}|${d}`,
          scheduleId: null,
          leaseId: l.id,
          propertyId,
          date: d,
          amount: Number(l.rent_amount),
          received: 0,
          pending: 0,
          promised: [],
          status: "due",
        });
      }
      d = addMonths(d, 1, day);
    }
    const leasesHere = leases.filter((x) => unitProperty.get(x.unit_id) === propertyId && x.status === "active");
    for (const inst of insts) {
      for (const p of linked.get(inst.key) ?? []) {
        applyPayment(inst, p);
        used.add(p.id);
      }
      const month = inst.date.slice(0, 7);
      for (const p of payments) {
        if (used.has(p.id) || p.installment_date) continue;
        const mine = p.lease_id === l.id || (!p.lease_id && p.property_id === propertyId && leasesHere.length === 1);
        if (!mine) continue;
        const covers = (p.period_month ?? payDay(p)).slice(0, 7);
        if (covers === month) {
          applyPayment(inst, p);
          used.add(p.id);
        }
      }
      settle(inst);
    }
    out.push(...insts);
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

export function installmentBucket(i: Installment, today: string, soonDays = SOON_DAYS): Bucket {
  if (i.status === "paid") return "done";
  const n = diffDays(today, i.date);
  if (n < 0) return "red";
  if (n <= soonDays) return "orange";
  return "open";
}

export function rentCounts(insts: Installment[], today: string, soonDays = SOON_DAYS): TileCounts {
  let red = 0;
  let orange = 0;
  let blue = 0;
  for (const i of insts) {
    const b = installmentBucket(i, today, soonDays);
    if (b === "done") continue;
    blue += 1;
    if (b === "red") red += 1;
    else if (b === "orange") orange += 1;
  }
  return { red, orange, blue };
}

// ---------------------------------------------------------------------------
// Looking back: the board as it stood on an earlier day
// ---------------------------------------------------------------------------

/**
 * Tasks as they stood at the end of `day`: only ones that existed by then,
 * and anything finished later counts as still open on that day.
 */
export function tasksAsOf<T extends Pick<OpsTaskRow, "created_at" | "done_at">>(
  tasks: T[],
  day: string,
  timeZone = "America/New_York",
): T[] {
  return tasks
    .filter((t) => {
      const made = dayOf(t.created_at, timeZone);
      return !made || made <= day;
    })
    .map((t) => {
      const done = dayOf(t.done_at, timeZone);
      return done && done > day ? { ...t, done_at: null } : t;
    });
}

/** Rent payments as they stood at the end of `day`. */
export function paymentsAsOf<P extends Pick<RentPaymentRow, "status" | "paid_date" | "created_at">>(
  payments: P[],
  day: string,
  timeZone = "America/New_York",
): P[] {
  return payments.filter((p) =>
    p.status === "pending"
      ? (dayOf(p.created_at, timeZone) || "0000-00-00") <= day
      : !!p.paid_date && p.paid_date <= day,
  );
}

// ---------------------------------------------------------------------------
// Snapshot strip
// ---------------------------------------------------------------------------

export interface Snapshot {
  openTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  doneLast7: number;
  /** Rent still not received for installments already past due. */
  rentOverdue: number;
  /** Rent expected from today through the next `soonDays` days. */
  rentDueSoon: number;
}

export function snapshot(
  tasks: OpsTaskRow[],
  lines: Pick<OpsLineRow, "id" | "dated">[],
  insts: Installment[],
  today: string,
  soonDays = SOON_DAYS,
  timeZone = "America/New_York",
): Snapshot {
  const dated = new Map(lines.map((l) => [l.id, l.dated]));
  const weekAgo = addDays(today, -7);
  const s: Snapshot = { openTasks: 0, overdueTasks: 0, dueSoonTasks: 0, doneLast7: 0, rentOverdue: 0, rentDueSoon: 0 };
  for (const t of tasks) {
    if (!dated.has(t.line_id)) continue;
    if (t.done_at) {
      const d = dayOf(t.done_at, timeZone);
      if (d && d > weekAgo) s.doneLast7 += 1;
      continue;
    }
    s.openTasks += 1;
    if (!dated.get(t.line_id)) continue;
    const b = taskBucket(t, today, soonDays);
    if (b === "red") s.overdueTasks += 1;
    else if (b === "orange") s.dueSoonTasks += 1;
  }
  for (const i of insts) {
    const b = installmentBucket(i, today, soonDays);
    const left = Math.max(0, i.amount - i.received);
    if (b === "red") s.rentOverdue = round2(s.rentOverdue + left);
    else if (b === "orange") s.rentDueSoon = round2(s.rentDueSoon + left);
  }
  return s;
}
