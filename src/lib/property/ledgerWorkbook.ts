/**
 * Builds a property's rent ledger as an Excel workbook, laid out like the
 * hand-kept rent tracker: Setup / Payments / Ledger / Summary. Server only.
 *
 * The Ledger sheet keeps live formulas (running balance, totals) with their
 * computed values filled in, so it opens correct anywhere and still
 * recalculates if someone edits a cell.
 */
import ExcelJS from "exceljs";
import type { RentScheduleRow } from "@/lib/ops/rows";
import { FREQUENCY_LABELS } from "@/lib/ops/rows";
import { propertyLedger } from "./ledger";
import type { LeaseRow, PropertyRow, RentPaymentRow, TenantRow, UnitRow } from "./rows";
import { balanceLabel, leaseBalance } from "./tenancy";

const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F56C3" } };

function header(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.eachCell((c) => {
    c.fill = HEADER_FILL;
  });
}

function toDate(iso: string | null | undefined): Date | null {
  return iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : null;
}

export async function buildLedgerWorkbook(input: {
  property: PropertyRow;
  units: UnitRow[];
  leases: LeaseRow[];
  tenants: TenantRow[];
  payments: RentPaymentRow[];
  schedules: RentScheduleRow[];
  todayISO: string;
}): Promise<ArrayBuffer> {
  const { property, units, leases, tenants, payments, schedules, todayISO } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Property Log";
  wb.created = new Date();
  const tenantName = new Map(tenants.map((t) => [t.id, t.full_name]));
  const unitLabel = new Map(units.map((u) => [u.id, u.label]));

  // --- Setup -----------------------------------------------------------------
  const setup = wb.addWorksheet("Setup");
  setup.columns = [{ width: 22 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 10 }];
  setup.addRow(["Property", property.name]).font = { bold: true, size: 14 };
  setup.addRow(["Address", property.address || ""]);
  setup.addRow(["Downloaded", toDate(todayISO)]).getCell(2).numFmt = "mmm d, yyyy";
  setup.addRow([]);
  setup.addRow(["Leases"]).font = { bold: true };
  setup.addRow(["Unit", "Tenant", "Rent", "Due day", "Start", "End", "Deposit", "Status"]);
  header(setup, setup.rowCount);
  for (const l of [...leases].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    const r = setup.addRow([
      unitLabel.get(l.unit_id) ?? "Unit",
      l.tenant_id ? (tenantName.get(l.tenant_id) ?? "") : "",
      Number(l.rent_amount),
      l.due_day,
      toDate(l.start_date),
      toDate(l.end_date),
      Number(l.deposit_amount),
      l.status,
    ]);
    r.getCell(3).numFmt = MONEY;
    r.getCell(5).numFmt = "mmm d, yyyy";
    r.getCell(6).numFmt = "mmm d, yyyy";
    r.getCell(7).numFmt = MONEY;
  }
  if (schedules.length) {
    setup.addRow([]);
    setup.addRow(["Payment plans"]).font = { bold: true };
    setup.addRow(["Amount", "How often", "Starts", "Ends", "Note"]);
    header(setup, setup.rowCount);
    for (const s of schedules) {
      const r = setup.addRow([Number(s.amount), FREQUENCY_LABELS[s.frequency], toDate(s.start_date), toDate(s.end_date), s.note ?? ""]);
      r.getCell(1).numFmt = MONEY;
      r.getCell(3).numFmt = "mmm d, yyyy";
      r.getCell(4).numFmt = "mmm d, yyyy";
    }
  }

  // --- Payments --------------------------------------------------------------
  const pay = wb.addWorksheet("Payments");
  pay.columns = [
    { header: "Date received", key: "paid", width: 15 },
    { header: "Amount", key: "amount", width: 13 },
    { header: "Status", key: "status", width: 11 },
    { header: "Expected on", key: "expected", width: 14 },
    { header: "Covers month", key: "period", width: 13 },
    { header: "For plan payment due", key: "installment", width: 20 },
    { header: "How", key: "method", width: 16 },
    { header: "Note", key: "note", width: 40 },
  ];
  header(pay, 1);
  const sortedPays = [...payments].sort((a, b) =>
    (a.paid_date ?? a.expected_date ?? "").localeCompare(b.paid_date ?? b.expected_date ?? ""),
  );
  for (const p of sortedPays) {
    const r = pay.addRow({
      paid: toDate(p.paid_date),
      amount: Number(p.amount),
      status: p.status === "pending" ? "promised" : "received",
      expected: toDate(p.expected_date),
      period: p.period_month ? p.period_month.slice(0, 7) : "",
      installment: toDate(p.installment_date ?? null),
      method: p.method ?? "",
      note: p.note ?? "",
    });
    r.getCell("paid").numFmt = "mmm d, yyyy";
    r.getCell("amount").numFmt = MONEY;
    r.getCell("expected").numFmt = "mmm d, yyyy";
    r.getCell("installment").numFmt = "mmm d, yyyy";
    if (p.status === "pending") r.font = { color: { argb: "FF7C3AED" } };
  }
  pay.views = [{ state: "frozen", ySplit: 1 }];

  // --- Ledger ----------------------------------------------------------------
  const ledgerRows = propertyLedger(leases, payments, todayISO);
  const led = wb.addWorksheet("Ledger");
  led.columns = [
    { header: "Month", key: "month", width: 12 },
    { header: "Rent charged", key: "charged", width: 15 },
    { header: "Received", key: "received", width: 15 },
    { header: "Promised (not counted)", key: "pending", width: 22 },
    { header: "Running balance", key: "balance", width: 17 },
  ];
  header(led, 1);
  ledgerRows.forEach((m, i) => {
    const row = i + 2;
    const r = led.addRow({
      month: m.month,
      charged: m.charged,
      received: m.received,
      pending: m.pending,
      balance: { formula: row === 2 ? `B${row}-C${row}` : `E${row - 1}+B${row}-C${row}`, result: m.balance },
    });
    ["charged", "received", "pending", "balance"].forEach((k) => (r.getCell(k).numFmt = MONEY));
  });
  if (ledgerRows.length) {
    const end = ledgerRows.length + 1;
    const sum = (col: string, key: "charged" | "received" | "pending") => ({
      formula: `SUM(${col}2:${col}${end})`,
      result: Math.round(ledgerRows.reduce((s, m) => s + m[key], 0) * 100) / 100,
    });
    const t = led.addRow({
      month: "Total",
      charged: sum("B", "charged"),
      received: sum("C", "received"),
      pending: sum("D", "pending"),
      balance: { formula: `B${end + 1}-C${end + 1}`, result: ledgerRows[ledgerRows.length - 1].balance },
    });
    t.font = { bold: true };
    ["charged", "received", "pending", "balance"].forEach((k) => (t.getCell(k).numFmt = MONEY));
  }
  led.views = [{ state: "frozen", ySplit: 1 }];

  // --- Summary ---------------------------------------------------------------
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 26 }, { width: 18 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 13 }, { width: 22 }];
  sum.addRow([`${property.name} — rent summary`]).font = { bold: true, size: 14 };
  sum.addRow([`As of ${todayISO}. Promised money counts toward nothing until it arrives.`]).font = { italic: true, color: { argb: "FF64748B" } };
  sum.addRow([]);
  sum.addRow(["Lease", "Tenant", "Rent", "Months billed", "Charged", "Received", "Owed", "Standing"]);
  header(sum, sum.rowCount);
  for (const l of [...leases].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    const b = leaseBalance(
      l,
      payments.filter((p) => p.lease_id === l.id),
      todayISO,
    );
    const r = sum.addRow([
      `${l.start_date} to ${l.end_date ?? "open"}`,
      l.tenant_id ? (tenantName.get(l.tenant_id) ?? "") : "",
      Number(l.rent_amount),
      b.monthsDue,
      b.expected,
      b.collected,
      b.owed,
      balanceLabel(b),
    ]);
    [3, 5, 6, 7].forEach((c) => (r.getCell(c).numFmt = MONEY));
  }
  const unlinked = payments.filter((p) => !p.lease_id && p.status !== "pending").reduce((s, p) => s + Number(p.amount), 0);
  const promised = payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);
  const last = ledgerRows[ledgerRows.length - 1];
  sum.addRow([]);
  const totals: [string, number][] = [
    ["Balance owed (all leases)", last ? last.balance : 0],
    ["Promised, not yet received", promised],
  ];
  if (unlinked > 0) totals.push(["Received but not tied to a lease", unlinked]);
  for (const [label, value] of totals) {
    const r = sum.addRow([label, value]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).numFmt = MONEY;
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
