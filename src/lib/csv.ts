/**
 * CSV helpers for the import flow. Pure and unit-tested; the CsvImport
 * component is just UI around these.
 */

/** Minimal CSV parser: quoted fields, embedded commas/quotes/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** "07/15/2026", "2026-07-15", "7/15/26" → "2026-07-15" (null if unparseable). */
export function csvDateToISO(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

/** Index of the first header containing any candidate substring, else -1. */
export function guessColumn(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c));
    if (i !== -1) return i;
  }
  return -1;
}

export interface SpendRow {
  name: string;
  amount: number;
  due_date: string;
}

/**
 * Turn parsed CSV body rows into importable spends. `negIsSpend` matches how
 * banks export (spending negative); either way, only spending survives —
 * deposits and refunds are skipped, never imported as negative bills.
 */
export function extractSpends(
  body: string[][],
  cols: { date: number; name: number; amount: number },
  negIsSpend: boolean,
): SpendRow[] {
  return body
    .map((r) => {
      const amountRaw = Number(String(r[cols.amount] ?? "").replace(/[$,\s]/g, ""));
      const date = csvDateToISO(String(r[cols.date] ?? ""));
      const name = String(r[cols.name] ?? "").trim();
      const spend = negIsSpend ? -amountRaw : amountRaw;
      if (!date || !name || !Number.isFinite(spend) || !(spend > 0)) return null;
      return { name, amount: Math.round(spend * 100) / 100, due_date: date };
    })
    .filter((r): r is SpendRow => r !== null);
}
