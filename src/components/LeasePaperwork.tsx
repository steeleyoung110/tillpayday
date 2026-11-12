"use client";

/**
 * Lease status cards (with signed copies and renewal) and the rental-report
 * tracker for short-term units. Shared by the Board dialogs and the property
 * page.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { renewLease, setReportSchedule, type ActionResult } from "@/app/leaseActions";
import { showToast } from "@/components/InstantAction";
import { PaperworkFiles } from "@/components/PaperworkFiles";
import { LEASE_STATE_LABELS, type LeaseState, type ReportState } from "@/lib/property/compliance";
import type { LeaseVM, ReportsVM } from "@/lib/property/paperwork";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmt = (iso: string, year = true) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-500 focus:outline-none";

async function call(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, ok: string): Promise<boolean> {
  try {
    const res = await action(fd);
    showToast(res.ok ? ok : (res.error ?? "That didn't save. Try again."));
    return res.ok;
  } catch {
    showToast("That didn't save. Check your connection and try again.");
    return false;
  }
}

const CHIP: Record<LeaseState, string> = {
  in_progress: "bg-teal-500/15 text-teal-300",
  due_soon: "bg-amber-500/15 text-amber-300",
  past_due: "bg-rose-500/15 text-rose-300",
  complete: "bg-emerald-500/15 text-emerald-300",
};

export function leaseStateText(l: Pick<LeaseVM, "state" | "end" | "daysLeft">): string {
  if (l.state === "complete") return l.end ? `Ended ${fmt(l.end)}` : "Closed out";
  if (!l.end) return "Month-to-month, no end date";
  const d = l.daysLeft ?? 0;
  if (l.state === "past_due") return `Ended ${fmt(l.end)} · ${-d} day${d === -1 ? "" : "s"} ago, not renewed`;
  if (l.state === "due_soon") return d === 0 ? `Ends today` : `Ends ${fmt(l.end)} · in ${d} day${d === 1 ? "" : "s"}`;
  return `Ends ${fmt(l.end)}`;
}

export function LeaseStateChip({ state }: { state: LeaseState }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[state]}`}>{LEASE_STATE_LABELS[state]}</span>;
}

function RenewForm({ lease, onDone }: { lease: LeaseVM; onDone: () => void }) {
  const [mtm, setMtm] = useState(false);
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        if (await call(renewLease, fd, "Lease renewed. Rent keeps counting toward the balance.")) {
          onDone();
          router.refresh();
        }
      }}
      className="grid gap-3 rounded-xl bg-slate-950/60 p-3"
    >
      <input type="hidden" name="id" value={lease.id} />
      <input type="hidden" name="property_id" value={lease.propertyId} />
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-xs text-slate-400">
          New end date
          <input type="date" min="2000-01-01" max="2100-12-31" name="end_date" required={!mtm} disabled={mtm} className={inputCls} />
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          Monthly rent
          <input name="rent_amount" inputMode="decimal" defaultValue={String(lease.rent)} className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" name="month_to_month" checked={mtm} onChange={(e) => setMtm(e.target.checked)} className="h-4 w-4" />
        Month-to-month (no end date)
      </label>
      <p className="text-xs text-slate-500">
        Same rent: the lease just runs longer. New rent: this lease closes out and a new one starts the next day, and any
        payment plan moves with it.
      </p>
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
          Renew lease
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** One lease: status, dates, signed copies, renewal. */
export function LeaseCard({ lease, userId, compact }: { lease: LeaseVM; userId: string; compact?: boolean }) {
  const [renewing, setRenewing] = useState(false);
  const needsRenewal = lease.state === "past_due" || lease.state === "due_soon";
  return (
    <div className={`grid gap-3 rounded-xl border p-4 ${lease.current ? "border-slate-700 bg-slate-950/50" : "border-slate-800 bg-slate-950/20"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">
            {`${lease.tenant ?? "Tenant"}${compact ? "" : ` · ${lease.unitLabel}`} · ${usd.format(lease.rent)}/mo`}
          </p>
          <p className="text-xs text-slate-400">{`${fmt(lease.start)} to ${lease.end ? fmt(lease.end) : "open"} · ${leaseStateText(lease)}`}</p>
        </div>
        <LeaseStateChip state={lease.state} />
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Signed copy</p>
        <PaperworkFiles
          userId={userId}
          propertyId={lease.propertyId}
          kind="lease"
          leaseId={lease.id}
          files={lease.files}
          uploadLabel={lease.files.length ? "Upload another page" : "Upload the signed lease"}
          emptyText={lease.current ? "No signed copy on file yet." : undefined}
        />
      </div>
      {lease.current &&
        (renewing ? (
          <RenewForm lease={lease} onDone={() => setRenewing(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setRenewing(true)}
            className={`w-fit rounded-lg px-3 py-1.5 text-sm font-semibold ${
              needsRenewal ? "bg-amber-500 text-slate-950 hover:bg-amber-400" : "border border-slate-700 text-slate-300 hover:text-white"
            }`}
          >
            {needsRenewal ? "Enter the renewal" : "Renew early"}
          </button>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rental reports
// ---------------------------------------------------------------------------

const REPORT_CHIP: Record<ReportState, [string, string]> = {
  uploaded: ["Uploaded", "bg-emerald-500/15 text-emerald-300"],
  in_progress: ["In progress", "bg-slate-700/60 text-slate-300"],
  due: ["Due now", "bg-amber-500/15 text-amber-300"],
  past_due: ["Past due", "bg-rose-500/15 text-rose-300"],
};

export function ReportPeriods({
  propertyId,
  userId,
  reports,
  limit,
}: {
  propertyId: string;
  userId: string;
  reports: ReportsVM;
  limit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const periods = showAll || !limit ? reports.periods : reports.periods.slice(0, limit);
  return (
    <div className="grid gap-2">
      {periods.map((p) => {
        const [label, cls] = REPORT_CHIP[p.state];
        const note =
          p.state === "uploaded"
            ? `${p.fileCount} file${p.fileCount === 1 ? "" : "s"}`
            : p.state === "in_progress"
              ? `Upload after ${fmt(p.end, false)}`
              : p.state === "due"
                ? `Upload by ${fmt(p.dueDate, false)}`
                : `Was due ${fmt(p.dueDate, false)}`;
        return (
          <div key={p.start} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-white">{`${p.label} · ${fmt(p.start, false)} to ${fmt(p.end, false)}`}</p>
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{note}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
              </span>
            </div>
            <PaperworkFiles
              userId={userId}
              propertyId={propertyId}
              kind="rental_report"
              periodStart={p.start}
              files={p.files}
              uploadLabel={p.files.length ? "Add another file" : `Upload ${p.label} report`}
            />
          </div>
        );
      })}
      {limit && reports.periods.length > limit && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="w-fit text-sm text-teal-300 hover:underline">
          {showAll ? "Show fewer" : `Show all ${reports.periods.length} periods`}
        </button>
      )}
    </div>
  );
}

export function ReportSettingsForm({ propertyId, reports }: { propertyId: string; reports: ReportsVM | null }) {
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        if (await call(setReportSchedule, fd, "Report schedule saved.")) router.refresh();
      }}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <label className="grid gap-1 text-xs text-slate-400">
        Upload completed rentals
        <select name="report_cadence" defaultValue={reports?.cadence ?? ""} className={inputCls}>
          <option value="">Not tracked</option>
          <option value="monthly">Every month</option>
          <option value="quarterly">Every quarter</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs text-slate-400">
        Starting with
        <input type="date" min="2000-01-01" max="2100-12-31" name="report_start" defaultValue={reports?.start ?? ""} className={inputCls} />
      </label>
      <label className="grid gap-1 text-xs text-slate-400">
        Days to upload after period ends
        <input
          type="number"
          name="report_due_days"
          min={0}
          max={120}
          placeholder="15 monthly, 30 quarterly"
          defaultValue={reports?.dueDays ?? ""}
          className={inputCls}
        />
      </label>
      <button type="submit" className="self-end rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
        Save schedule
      </button>
    </form>
  );
}
