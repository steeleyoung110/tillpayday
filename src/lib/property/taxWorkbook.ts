/**
 * The tax-time pack as an Excel workbook: Summary (one row per property by
 * rental-schedule line), one sheet per property, and every transaction in a
 * flat list to tick off against QuickBooks. Server only.
 */
import ExcelJS from "exceljs";
import type { PropertyFileRow, PortfolioData } from "./rows";
import { DEDUCTION_LINES, lineKey, taxYear, type PropertyTax, type TaxTxn } from "./taxPack";

const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';
const HEAD: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17675D" } };
const NOTE = { italic: true, color: { argb: "FF64748B" } };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function header(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.eachCell((c) => {
    c.fill = HEAD;
    c.alignment = { wrapText: true, vertical: "middle" };
  });
}
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
const sheetName = (s: string, used: Set<string>) => {
  const base = s.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Property";
  let name = base;
  for (let i = 2; used.has(name); i += 1) name = `${base.slice(0, 25)} ${i}`;
  used.add(name);
  return name;
};

export async function buildTaxWorkbook(
  data: PortfolioData,
  year: number,
  today: string,
  reportFiles: Pick<PropertyFileRow, "property_id" | "kind" | "period_start" | "file_name">[],
): Promise<ArrayBuffer> {
  const { properties, txns } = taxYear(data, year, today);
  const active = properties.filter(
    (p) => p.income || p.deductions || p.capital || p.closing || p.mortgagePaid || !data.properties.find((x) => x.id === p.propertyId)?.is_archived,
  );
  const wb = new ExcelJS.Workbook();
  wb.creator = "Property Log";
  wb.created = new Date();

  // --- Summary ---------------------------------------------------------------
  const sum = wb.addWorksheet(`Summary ${year}`);
  const cols = [
    "Property",
    "Rental share",
    "Rents received (long-term)",
    "Short-term payouts",
    "Total income",
    ...DEDUCTION_LINES.map(lineKey),
    "Total deductions",
    "Net before depreciation",
    "Capital improvements (cost basis)",
    "Closing costs (cost basis)",
    "Mortgage paid (all)",
    "Mortgage with no split logged",
  ];
  sum.addRow([`Rental property tax pack — ${year}`]).font = { bold: true, size: 14 };
  sum.addRow([`Prepared ${today} from Property Log. Cash basis: income on the day it arrived, expenses on the day paid. Not tax advice — for your preparer to review alongside QuickBooks.`]).font = NOTE;
  sum.addRow([]);
  header(sum.addRow(cols));
  const firstDataRow = sum.rowCount + 1;
  for (const p of active) {
    const r = sum.addRow([
      p.name,
      p.sharePct / 100,
      p.rents,
      p.strPayouts,
      p.income,
      ...DEDUCTION_LINES.map((l) => p.byLine[lineKey(l)] ?? 0),
      p.deductions,
      p.net,
      p.capital,
      p.closing,
      p.mortgagePaid,
      p.mortgageUnsplit,
    ]);
    r.getCell(2).numFmt = "0%";
    for (let c = 3; c <= cols.length; c += 1) r.getCell(c).numFmt = MONEY;
  }
  const lastDataRow = sum.rowCount;
  if (active.length) {
    const t = sum.addRow(["Total", ""]);
    for (let c = 3; c <= cols.length; c += 1) {
      const col = sum.getColumn(c).letter;
      const total = Math.round(
        active.reduce((s, p) => s + Number(sum.getRow(firstDataRow + active.indexOf(p)).getCell(c).value ?? 0), 0) * 100,
      ) / 100;
      t.getCell(c).value = { formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`, result: total };
      t.getCell(c).numFmt = MONEY;
    }
    t.font = { bold: true };
  }
  sum.columns.forEach((c, i) => (c.width = i === 0 ? 24 : 15));
  sum.getRow(4).height = 48;
  sum.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  sum.addRow([]);
  const notes = [
    "Rental share: a house-hack property's costs and interest count at the rented share; income counts whole.",
    "Mortgage interest is from logged payment splits only. File the amount on each lender's Form 1098.",
    "Capital improvements and closing costs are listed apart: they usually go into the property's cost basis and are depreciated, not deducted in the year.",
    "Short-term payouts are what landed after platform fees; each property sheet shows gross and fees where the booking import had them.",
  ];
  for (const n of notes) sum.addRow([n]).font = NOTE;

  // --- One sheet per property -----------------------------------------------
  const used = new Set<string>([`Summary ${year}`, "All transactions"]);
  for (const p of active) {
    const ws = wb.addWorksheet(sheetName(p.name, used));
    ws.columns = [{ width: 14 }, { width: 34 }, { width: 26 }, { width: 14 }, { width: 11 }, { width: 14 }, { width: 46 }];
    ws.addRow([`${p.name} — ${year}`]).font = { bold: true, size: 14 };
    ws.addRow([`Rental share ${p.sharePct}%`]).font = NOTE;
    ws.addRow([]);

    ws.addRow(["Income by month"]).font = { bold: true };
    header(ws.addRow(["Month", "Income received"]));
    p.incomeByMonth.forEach((v, i) => {
      const r = ws.addRow([MONTHS[i], v]);
      r.getCell(2).numFmt = MONEY;
    });
    const it = ws.addRow(["Total", p.income]);
    it.font = { bold: true };
    it.getCell(2).numFmt = MONEY;
    if (p.strFees || p.strGross) {
      const r = ws.addRow([`Short-term gross ${p.strGross.toFixed(2)}, platform fees ${p.strFees.toFixed(2)} (where the booking import had them)`]);
      r.font = NOTE;
    }
    ws.addRow([]);

    ws.addRow(["Deductions by line"]).font = { bold: true };
    header(ws.addRow(["Line", "Amount counted"]));
    for (const l of DEDUCTION_LINES) {
      const v = p.byLine[lineKey(l)] ?? 0;
      if (!v) continue;
      const r = ws.addRow([lineKey(l), v]);
      r.getCell(2).numFmt = MONEY;
    }
    const dt = ws.addRow(["Total deductions", p.deductions]);
    dt.font = { bold: true };
    dt.getCell(2).numFmt = MONEY;
    const nt = ws.addRow(["Net before depreciation", p.net]);
    nt.font = { bold: true };
    nt.getCell(2).numFmt = MONEY;
    if (p.capital) ws.addRow(["Capital improvements (cost basis)", p.capital]).getCell(2).numFmt = MONEY;
    if (p.closing) ws.addRow(["Closing costs (cost basis)", p.closing]).getCell(2).numFmt = MONEY;
    if (p.mortgageUnsplit) {
      ws.addRow([`${p.mortgageUnsplit.toFixed(2)} of mortgage payments have no principal/interest split logged — use the lender's 1098 for interest.`]).font = NOTE;
    }
    ws.addRow([]);

    const reports = reportFiles.filter((f) => f.property_id === p.propertyId && f.kind === "rental_report" && (f.period_start ?? "").startsWith(`${year}-`));
    if (reports.length) {
      ws.addRow(["Rental reports on file"]).font = { bold: true };
      for (const f of reports) ws.addRow([f.period_start ?? "", f.file_name]);
      ws.addRow([]);
    }

    ws.addRow(["Every transaction"]).font = { bold: true };
    header(ws.addRow(["Date", "Line", "Paid to / from", "Amount", "Share", "Counted", "Memo"]));
    for (const t of txns.filter((x) => x.propertyId === p.propertyId)) addTxnRow(ws, t);
  }

  // --- All transactions ------------------------------------------------------
  const all = wb.addWorksheet("All transactions");
  all.columns = [
    { header: "Date", width: 12 },
    { header: "Property", width: 22 },
    { header: "Type", width: 17 },
    { header: "Line", width: 34 },
    { header: "Paid to / from", width: 26 },
    { header: "Amount", width: 13 },
    { header: "Share", width: 9 },
    { header: "Counted", width: 13 },
    { header: "Memo", width: 46 },
  ];
  header(all.getRow(1));
  for (const t of txns) {
    const sign = t.bucket === "income" ? 1 : -1;
    const r = all.addRow([d(t.date), t.property, t.kind, t.line, t.who, sign * t.amount, t.sharePct / 100, sign * t.counted, t.memo]);
    r.getCell(1).numFmt = "yyyy-mm-dd";
    r.getCell(6).numFmt = MONEY;
    r.getCell(7).numFmt = "0%";
    r.getCell(8).numFmt = MONEY;
  }
  all.views = [{ state: "frozen", ySplit: 1 }];
  all.autoFilter = { from: "A1", to: "I1" };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function addTxnRow(ws: ExcelJS.Worksheet, t: TaxTxn) {
  const sign = t.bucket === "income" ? 1 : -1;
  const row = ws.addRow([d(t.date), t.line, t.who, sign * t.amount, t.sharePct / 100, sign * t.counted, t.memo]);
  row.getCell(1).numFmt = "yyyy-mm-dd";
  row.getCell(4).numFmt = MONEY;
  row.getCell(5).numFmt = "0%";
  row.getCell(6).numFmt = MONEY;
}

export type { PropertyTax };
