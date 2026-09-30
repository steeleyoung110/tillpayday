/**
 * CSV → bookings mapping. Pure and unit-tested; the import UI is a thin shell
 * around these. Auto-detects the common platform exports (Airbnb, VRBO) by
 * header names and falls back to a manual column mapping.
 *
 * Honesty rules: canceled rows and negative rows (refunds, adjustments,
 * resolution payouts) are never imported as stays — they're counted and
 * reported back so the user knows what was left out.
 */
import { csvDateToISO, guessColumn, parseCsv } from "@/lib/csv";

export { parseCsv };

/** Column indexes into a CSV row; -1 = not present. */
export interface BookingColumnMap {
  checkIn: number;
  /** Either checkOut or nights must be present. */
  checkOut: number;
  nights: number;
  payout: number;
  guest: number;
  externalId: number;
  gross: number;
  cleaningFee: number;
  platformFee: number;
  status: number;
  /** Per-row platform column ("Booking Site"), when the export has one. */
  platform: number;
}

export function guessBookingColumns(headers: string[]): BookingColumnMap {
  return {
    // Airbnb: "Start date" / VRBO: "Check-in" / generic: "arrival"
    checkIn: guessColumn(headers, ["check-in", "check in", "checkin", "start date", "arrival"]),
    checkOut: guessColumn(headers, ["check-out", "check out", "checkout", "end date", "departure"]),
    nights: guessColumn(headers, ["nights"]),
    // Prefer the money that actually lands over gross-ish columns.
    payout: guessColumn(headers, ["payout", "earnings", "amount paid", "net amount", "amount"]),
    guest: guessColumn(headers, ["guest", "traveler", "booked by"]),
    externalId: guessColumn(headers, [
      "confirmation code", "confirmation", "reservation id", "reservation code",
      "booking id", "booking reference", "reservation",
    ]),
    gross: guessColumn(headers, ["gross"]),
    cleaningFee: guessColumn(headers, ["cleaning"]),
    platformFee: guessColumn(headers, ["service fee", "host fee", "platform fee", "commission"]),
    status: guessColumn(headers, ["status", "type"]),
    platform: guessColumn(headers, ["booking site", "platform", "channel", "listing site"]),
  };
}

/** "Airbnb"/"VRBO"/"Booking.com"/"Website" → our platform enum. */
export function normalizePlatform(raw: string): "airbnb" | "vrbo" | "booking" | "direct" | "other" | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("vrbo") || s.includes("homeaway")) return "vrbo";
  if (s.includes("booking")) return "booking";
  if (s.includes("website") || s.includes("direct")) return "direct";
  return "other";
}

/** A booking ready to insert (snake_case matches the table). */
export interface ParsedBooking {
  check_in: string;
  check_out: string;
  payout: number;
  guest_name: string | null;
  external_id: string;
  gross_amount: number | null;
  cleaning_fee: number | null;
  platform_fee: number | null;
  /** From the row's own platform column, when present. */
  platform: "airbnb" | "vrbo" | "booking" | "direct" | "other" | null;
}

export interface ExtractResult {
  bookings: ParsedBooking[];
  /** Rows left out because they were canceled or calendar blocks. */
  skippedCanceled: number;
  /** Rows left out because dates/amounts couldn't be read (incl. negatives). */
  skippedUnreadable: number;
}

function money(raw: string | undefined): number | null {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nights between two ISO dates (check_out - check_in). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function extractBookings(
  body: string[][],
  map: BookingColumnMap,
): ExtractResult {
  const bookings: ParsedBooking[] = [];
  let skippedCanceled = 0;
  let skippedUnreadable = 0;

  for (const row of body) {
    const status = map.status >= 0 ? String(row[map.status] ?? "").toLowerCase() : "";
    // Canceled stays never happened; "Blocked" rows are calendar blocks
    // (owner stays, maintenance), not income or occupancy.
    if (status.includes("cancel") || status.includes("block")) {
      skippedCanceled += 1;
      continue;
    }

    const checkIn = csvDateToISO(String(row[map.checkIn] ?? ""));
    let checkOut =
      map.checkOut >= 0 ? csvDateToISO(String(row[map.checkOut] ?? "")) : null;
    if (!checkOut && checkIn && map.nights >= 0) {
      const nights = Number(String(row[map.nights] ?? "").trim());
      if (Number.isFinite(nights) && nights > 0 && nights < 400) {
        checkOut = addDaysISO(checkIn, Math.round(nights));
      }
    }
    const payout = money(row[map.payout]);

    // Refunds and adjustments come through as negative rows on some exports;
    // they are not stays, so they are reported, not silently imported.
    if (!checkIn || !checkOut || checkOut <= checkIn || payout == null || payout < 0) {
      skippedUnreadable += 1;
      continue;
    }

    const externalRaw =
      map.externalId >= 0 ? String(row[map.externalId] ?? "").trim() : "";
    bookings.push({
      check_in: checkIn,
      check_out: checkOut,
      payout,
      guest_name:
        map.guest >= 0 ? String(row[map.guest] ?? "").trim() || null : null,
      // Without a confirmation code, dates+payout stand in as the dedupe key
      // so re-importing the same file stays a no-op.
      external_id: externalRaw || `gen:${checkIn}:${checkOut}:${payout.toFixed(2)}`,
      gross_amount: map.gross >= 0 ? money(row[map.gross]) : null,
      cleaning_fee: map.cleaningFee >= 0 ? money(row[map.cleaningFee]) : null,
      platform_fee: map.platformFee >= 0 ? money(row[map.platformFee]) : null,
      platform:
        map.platform >= 0 ? normalizePlatform(String(row[map.platform] ?? "")) : null,
    });
  }

  return { bookings, skippedCanceled, skippedUnreadable };
}

/** The required columns are mapped and distinct enough to trust. */
export function mapIsUsable(map: BookingColumnMap): boolean {
  return (
    map.checkIn >= 0 &&
    map.payout >= 0 &&
    (map.checkOut >= 0 || map.nights >= 0) &&
    map.checkIn !== map.payout
  );
}
