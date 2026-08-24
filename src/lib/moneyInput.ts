/**
 * Money-field formatting, as you type. Two rules that sound simple and are
 * not: never fight the cursor, and never silently change what someone meant.
 *
 * So a half-typed "1234." keeps its trailing dot, cents stop at two places
 * rather than rounding away the third keystroke, and the value the form
 * actually submits is always a plain number — the commas are decoration.
 */

/**
 * Format raw keystrokes into a display string with thousands separators.
 * Accepts anything; keeps digits, at most one decimal point, at most two
 * decimal places. Returns "" for empty input so placeholders still show.
 */
export function formatMoneyInput(raw: string): string {
  if (raw === "") return "";

  // Keep digits and dots only; a leading "." becomes "0.".
  let cleaned = raw.replace(/[^\d.]/g, "");
  if (cleaned.startsWith(".")) cleaned = `0${cleaned}`;

  // Collapse extra dots: the first one wins, the rest are dropped.
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, "");
  }

  const [intPart, decPart] = cleaned.split(".");
  // Strip leading zeros ("007" → "7") but keep a lone "0".
  const intDigits = intPart.replace(/^0+(?=\d)/, "");
  const grouped = intDigits === "" ? "" : Number(intDigits).toLocaleString("en-US");

  if (firstDot === -1) return grouped;
  // Mid-typing: keep the dot even with nothing after it yet.
  return `${grouped === "" ? "0" : grouped}.${(decPart ?? "").slice(0, 2)}`;
}

/**
 * The number a formatted field should submit. Empty / meaningless input
 * returns "" so `required` still fires instead of posting a silent 0.
 */
export function parseMoneyInput(display: string): string {
  const cleaned = display.replace(/,/g, "");
  if (cleaned === "" || cleaned === ".") return "";
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : "";
}

/** Format a stored number for a field's initial display value. */
export function toMoneyDisplay(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return formatMoneyInput(String(n));
}
