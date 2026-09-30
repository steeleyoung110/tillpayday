import { describe, expect, it } from "vitest";
import {
  extractBookings,
  guessBookingColumns,
  mapIsUsable,
  nightsBetween,
  parseCsv,
} from "./bookingCsv";

// ---------------------------------------------------------------------------
// Airbnb-style export
// ---------------------------------------------------------------------------
const AIRBNB_CSV = [
  "Confirmation code,Status,Guest name,Start date,End date,# of nights,Earnings",
  'HMABC123,Confirmed,Sam Field,09/12/2026,09/15/2026,3,"$412.50"',
  'HMDEF456,Past guest,Lee Okafor,08/01/2026,08/06/2026,5,"$1,020.00"',
  "HMGHI789,Canceled by guest,Kai Osei,10/02/2026,10/05/2026,3,$0.00",
  'HMJKL012,Confirmed,Refund row,09/20/2026,09/22/2026,2,"-$50.00"',
].join("\n");

describe("guessBookingColumns — Airbnb headers", () => {
  const rows = parseCsv(AIRBNB_CSV);
  const map = guessBookingColumns(rows[0]);

  it("finds every column", () => {
    expect(map.externalId).toBe(0);
    expect(map.status).toBe(1);
    expect(map.guest).toBe(2);
    expect(map.checkIn).toBe(3);
    expect(map.checkOut).toBe(4);
    expect(map.nights).toBe(5);
    expect(map.payout).toBe(6);
    expect(mapIsUsable(map)).toBe(true);
  });

  it("imports stays, skips canceled and negative rows, and says so", () => {
    const { bookings, skippedCanceled, skippedUnreadable } = extractBookings(
      rows.slice(1),
      map,
    );
    expect(bookings).toHaveLength(2);
    expect(skippedCanceled).toBe(1);
    expect(skippedUnreadable).toBe(1); // the refund row
    expect(bookings[0]).toMatchObject({
      check_in: "2026-09-12",
      check_out: "2026-09-15",
      payout: 412.5,
      guest_name: "Sam Field",
      external_id: "HMABC123",
    });
    expect(bookings[1].payout).toBe(1020);
  });
});

// ---------------------------------------------------------------------------
// VRBO-style export (no nights column, ISO-ish dates)
// ---------------------------------------------------------------------------
const VRBO_CSV = [
  "Reservation ID,Check-in,Check-out,Guest,Payout",
  "R100,2026-07-03,2026-07-07,Ana Cole,880.00",
  "R101,2026-07-10,2026-07-10,Bad Row,100.00",
].join("\n");

describe("guessBookingColumns — VRBO headers", () => {
  const rows = parseCsv(VRBO_CSV);
  const map = guessBookingColumns(rows[0]);

  it("maps and imports, rejecting zero-night rows", () => {
    expect(mapIsUsable(map)).toBe(true);
    const { bookings, skippedUnreadable } = extractBookings(rows.slice(1), map);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].external_id).toBe("R100");
    expect(skippedUnreadable).toBe(1); // check-out not after check-in
  });
});

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------
describe("extractBookings — fallbacks", () => {
  it("derives check-out from nights when there is no end-date column", () => {
    const rows = parseCsv(
      ["Start date,Nights,Payout", "09/28/2026,4,600"].join("\n"),
    );
    const map = guessBookingColumns(rows[0]);
    const { bookings } = extractBookings(rows.slice(1), map);
    expect(bookings[0].check_out).toBe("2026-10-02");
  });

  it("builds a stable dedupe key when there is no confirmation code", () => {
    const rows = parseCsv(
      ["Check-in,Check-out,Payout", "2026-09-01,2026-09-04,450"].join("\n"),
    );
    const map = guessBookingColumns(rows[0]);
    const { bookings } = extractBookings(rows.slice(1), map);
    expect(bookings[0].external_id).toBe("gen:2026-09-01:2026-09-04:450.00");
    // Re-parsing the same file yields the same key — the DB unique index
    // makes the second import a no-op.
    const again = extractBookings(rows.slice(1), map);
    expect(again.bookings[0].external_id).toBe(bookings[0].external_id);
  });

  it("refuses an unusable mapping", () => {
    const rows = parseCsv(["Foo,Bar", "1,2"].join("\n"));
    expect(mapIsUsable(guessBookingColumns(rows[0]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Channel-manager "Bookings report" (the real-world format Steele uses):
// Blocked rows, per-row Booking Site, $ payouts.
// ---------------------------------------------------------------------------
const REPORT_CSV = [
  "Guest Name,Status,Booking ID,Check-in,Check-out,Nights,Nights Stayed,Total Payout,Adults,Children,Infants,Pets,Listing,Guest Email,Guest Phone,Date Booked,Booking Site",
  'Brittany M,Booked,N75610037,12/11/2026,12/13/2026,2,2,$218.26,2,0,0,No,"1762 Post Rd Unit 118, Wells, ME, 04090, USA",,+1 555,09/08/2026,Airbnb',
  'Thia K,Canceled,S76266306,12/03/2026,12/06/2026,3,0,$0.00,1,0,0,No,"1762 Post Rd Unit 118, Wells, ME, 04090, USA",,+1 555,08/12/2026,Airbnb',
  ',Blocked,,10/01/2026,10/03/2026,2,0,$0.00,0,0,0,No,"1762 Post Rd Unit 118, Wells, ME, 04090, USA",,,09/01/2026,',
  'Ana R,Checked out,R2200,05/03/2024,05/06/2024,3,3,"$612.40",2,1,0,No,"1762 Post Rd Unit 118, Wells, ME, 04090, USA",,+1 555,03/10/2024,VRBO',
].join("\n");

describe("channel-manager bookings report", () => {
  const rows = parseCsv(REPORT_CSV);
  const map = guessBookingColumns(rows[0]);

  it("maps every column including the per-row platform", () => {
    expect(map.guest).toBe(0);
    expect(map.status).toBe(1);
    expect(map.externalId).toBe(2);
    expect(map.checkIn).toBe(3);
    expect(map.checkOut).toBe(4);
    expect(map.payout).toBe(7);
    expect(map.platform).toBe(16);
    expect(mapIsUsable(map)).toBe(true);
  });

  it("imports real stays, skips canceled AND blocked, carries the platform", () => {
    const { bookings, skippedCanceled } = extractBookings(rows.slice(1), map);
    expect(bookings).toHaveLength(2);
    expect(skippedCanceled).toBe(2); // one canceled + one calendar block
    expect(bookings[0]).toMatchObject({
      external_id: "N75610037",
      payout: 218.26,
      platform: "airbnb",
    });
    expect(bookings[1]).toMatchObject({
      check_in: "2024-05-03",
      payout: 612.4,
      platform: "vrbo",
    });
  });
});

describe("nightsBetween", () => {
  it("counts nights, not days", () => {
    expect(nightsBetween("2026-09-12", "2026-09-15")).toBe(3);
    expect(nightsBetween("2026-12-28", "2027-01-03")).toBe(6);
  });
});
