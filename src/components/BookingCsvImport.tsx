"use client";

/**
 * CSV import for short-term stays, bound to one property. Reads the file in
 * the browser, auto-detects columns (Airbnb/VRBO exports map themselves),
 * lets the user correct the mapping, shows exactly what will and won't be
 * imported, then hands clean rows to the importBookings server action.
 * Re-importing the same file is a no-op — duplicates are reported, not added.
 */
import { useState, useTransition } from "react";
import { importBookings, type ImportBookingsResult } from "@/app/propertyActions";
import { showToast } from "@/components/InstantAction";
import {
  extractBookings,
  guessBookingColumns,
  mapIsUsable,
  parseCsv,
  type BookingColumnMap,
} from "@/lib/property/bookingCsv";
import { PLATFORM_LABELS, type BookingPlatform } from "@/lib/property/rows";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";

const MAPPABLE: { key: keyof BookingColumnMap; label: string; required?: boolean }[] = [
  { key: "checkIn", label: "Check-in", required: true },
  { key: "checkOut", label: "Check-out" },
  { key: "nights", label: "Nights" },
  { key: "payout", label: "Payout $", required: true },
  { key: "guest", label: "Guest" },
  { key: "externalId", label: "Confirmation code" },
];

export function BookingCsvImport({
  propertyId,
  units,
}: {
  propertyId: string;
  /** Short-term units of this property; one gets the stays attached. */
  units: { id: string; label: string }[];
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [body, setBody] = useState<string[][]>([]);
  const [map, setMap] = useState<BookingColumnMap | null>(null);
  const [platform, setPlatform] = useState<BookingPlatform>("airbnb");
  const [unitId, setUnitId] = useState<string>(units[0]?.id ?? "");
  const [result, setResult] = useState<ImportBookingsResult | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setResult(null);
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      setFileName(file.name);
      setHeaders([]);
      setBody([]);
      setMap(null);
      return;
    }
    setFileName(file.name);
    setHeaders(rows[0]);
    setBody(rows.slice(1));
    setMap(guessBookingColumns(rows[0]));
    const name = file.name.toLowerCase();
    if (name.includes("airbnb")) setPlatform("airbnb");
    else if (name.includes("vrbo") || name.includes("homeaway")) setPlatform("vrbo");
  }

  const usable = map ? mapIsUsable(map) : false;
  const extracted = map && usable ? extractBookings(body, map) : null;

  function doImport() {
    if (!extracted || extracted.bookings.length === 0) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("property_id", propertyId);
      if (unitId) fd.append("unit_id", unitId);
      fd.append("platform", platform);
      fd.append("payload", JSON.stringify(extracted.bookings));
      const res = await importBookings(fd);
      setResult(res);
      if (!res.error) {
        showToast(
          res.imported > 0
            ? `${res.imported} ${res.imported === 1 ? "stay" : "stays"} imported.`
            : "Nothing new — every stay in that file was already here.",
        );
      }
    });
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-700 p-4">
      <p className="text-sm font-semibold text-white">Import stays from a CSV</p>
      <p className="mt-1 text-xs text-slate-400">
        Export your reservations from Airbnb, VRBO, or a spreadsheet, and attach
        them here. Re-importing the same file never double-counts.
      </p>

      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Choose a CSV file of stays"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="mt-3 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-600"
      />

      {fileName && headers.length === 0 && (
        <p className="mt-2 text-sm text-rose-400">
          That file doesn&apos;t look like a CSV with a header row and data.
        </p>
      )}

      {map && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MAPPABLE.map(({ key, label, required }) => (
              <label key={key} className="block text-xs text-slate-400">
                {`${label}${required ? " *" : ""}`}
                <select
                  className={`mt-0.5 ${inputCls}`}
                  value={map[key]}
                  onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}
                >
                  <option value={-1}>—</option>
                  {headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={i}>
                      {h || `column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="block text-xs text-slate-400">
              Platform
              <select
                className={`mt-0.5 ${inputCls}`}
                value={platform}
                onChange={(e) => setPlatform(e.target.value as BookingPlatform)}
              >
                {(Object.keys(PLATFORM_LABELS) as BookingPlatform[]).map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            {units.length > 1 && (
              <label className="block text-xs text-slate-400">
                Unit
                <select
                  className={`mt-0.5 ${inputCls}`}
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {!usable && (
            <p className="mt-2 text-sm text-amber-300">
              Map at least Check-in, Payout, and one of Check-out or Nights.
            </p>
          )}

          {extracted && (
            <div className="mt-3 text-sm text-slate-300">
              <p>
                {`${extracted.bookings.length} ${extracted.bookings.length === 1 ? "stay" : "stays"} ready to import`}
                {extracted.skippedCanceled > 0 &&
                  ` · ${extracted.skippedCanceled} canceled/blocked skipped`}
                {extracted.skippedUnreadable > 0 &&
                  ` · ${extracted.skippedUnreadable} unreadable/refund rows skipped`}
              </p>
              {extracted.bookings.slice(0, 3).map((b) => (
                <p key={b.external_id} className="mt-0.5 text-xs text-slate-500">
                  {`${b.check_in} → ${b.check_out} · $${b.payout.toFixed(2)}${b.guest_name ? ` · ${b.guest_name}` : ""}`}
                </p>
              ))}
              <button
                type="button"
                disabled={pending || extracted.bookings.length === 0}
                onClick={doImport}
                className="mt-3 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {pending ? "Importing…" : `Import ${extracted.bookings.length} stays`}
              </button>
            </div>
          )}
        </>
      )}

      {result && (
        <p className={`mt-3 text-sm ${result.error ? "text-rose-400" : "text-emerald-300"}`}>
          {result.error
            ? `Import failed: ${result.error}.`
            : `Done — ${result.imported} imported, ${result.duplicates} already here${result.rejected > 0 ? `, ${result.rejected} rejected` : ""}.`}
        </p>
      )}
    </div>
  );
}
