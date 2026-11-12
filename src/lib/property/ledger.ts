/**
 * Month-by-month rent ledger for one property: what the leases charged, what
 * actually arrived, what is promised, and the running balance. Pure and
 * tested — it feeds the Excel download, so the spreadsheet and the app's
 * balance are worked out the same way (rent counts once its due day arrives;
 * promised money counts toward nothing).
 */
import type { LeaseRow, RentPaymentRow } from "./rows";

export interface LedgerMonth {
  /** YYYY-MM */
  month: string;
  charged: number;
  received: number;
  pending: number;
  /** Cumulative charged − cumulative received through this month. */
  balance: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

function nextMonth(ym: string): string {
  let y = Number(ym.slice(0, 4));
  let m = Number(ym.slice(5, 7)) + 1;
  if (m === 13) {
    m = 1;
    y += 1;
  }
  return `${y}-${pad(m)}`;
}

/** Rent each lease has asked for, keyed by month, through today. */
export function chargesByMonth(
  leases: Pick<LeaseRow, "rent_amount" | "due_day" | "start_date" | "end_date" | "status">[],
  todayISO: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of leases) {
    const rent = Number(l.rent_amount);
    if (!(rent > 0)) continue;
    const endBound = l.end_date ?? (l.status === "ended" ? l.start_date : todayISO);
    const last = endBound < todayISO ? endBound : todayISO;
    let ym = l.start_date.slice(0, 7);
    for (let i = 0; i < 1200 && `${ym}-01` <= last; i += 1) {
      const due = `${ym}-${pad(Math.min(l.due_day, 28))}`;
      if (due <= todayISO) out.set(ym, round2((out.get(ym) ?? 0) + rent));
      ym = nextMonth(ym);
    }
  }
  return out;
}

export function propertyLedger(
  leases: Pick<LeaseRow, "rent_amount" | "due_day" | "start_date" | "end_date" | "status">[],
  payments: Pick<RentPaymentRow, "amount" | "status" | "paid_date" | "expected_date">[],
  todayISO: string,
): LedgerMonth[] {
  const charged = chargesByMonth(leases, todayISO);
  const received = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const p of payments) {
    const isPending = p.status === "pending";
    const day = isPending ? p.expected_date : p.paid_date;
    if (!day) continue;
    const ym = day.slice(0, 7);
    const m = isPending ? pending : received;
    m.set(ym, round2((m.get(ym) ?? 0) + Number(p.amount)));
  }
  const months = [...charged.keys(), ...received.keys(), ...pending.keys()].sort();
  if (months.length === 0) return [];
  const first = months[0];
  const lastMonth = [months[months.length - 1], todayISO.slice(0, 7)].sort()[1];

  const out: LedgerMonth[] = [];
  let balance = 0;
  for (let ym = first, i = 0; ym <= lastMonth && i < 1200; ym = nextMonth(ym), i += 1) {
    const c = charged.get(ym) ?? 0;
    const r = received.get(ym) ?? 0;
    balance = round2(balance + c - r);
    out.push({ month: ym, charged: c, received: r, pending: pending.get(ym) ?? 0, balance });
  }
  return out;
}
