/**
 * Server-side view models for each property's paperwork and stays: lease
 * status with signed copies, rental-report periods with their uploads, and
 * upcoming short-term stays. Everything returned is plain data, safe to hand
 * to client components.
 */
import { createClient } from "@/lib/supabase/server";
import {
  currentLease,
  leaseStatus,
  reportPeriods,
  type LeaseState,
  type ReportCadence,
  type ReportPeriod,
} from "./compliance";
import type { PortfolioData, PropertyFileRow } from "./rows";

export interface FileVM {
  id: string;
  name: string;
  url: string;
  sizeKB: number | null;
  createdAt: string;
}

export interface LeaseVM {
  id: string;
  propertyId: string;
  unitLabel: string;
  tenant: string | null;
  rent: number;
  start: string;
  end: string | null;
  state: LeaseState;
  daysLeft: number | null;
  /** The unit's governing lease (false = an older, closed-out one). */
  current: boolean;
  files: FileVM[];
}

export interface ReportsVM {
  cadence: ReportCadence;
  start: string;
  dueDays: number | null;
  periods: (ReportPeriod & { files: FileVM[] })[];
}

export interface StayVM {
  id: string;
  checkIn: string;
  checkOut: string;
  payout: number;
  platform: string;
  guest: string | null;
}

export interface StaysVM {
  upcoming: StayVM[];
  /** Payout of stays checking in this calendar month (canceled excluded). */
  monthPayout: number;
}

export interface Paperwork {
  leases: Record<string, LeaseVM[]>;
  reports: Record<string, ReportsVM | null>;
  stays: Record<string, StaysVM>;
  /** Properties with at least one short-term unit. */
  shortTerm: string[];
}

export async function getPaperwork(data: PortfolioData, today: string): Promise<Paperwork> {
  const supabase = await createClient();
  const { data: fileRows } = await supabase.from("property_files").select("*").order("created_at", { ascending: false });
  const files = (fileRows as PropertyFileRow[]) ?? [];
  const signed = new Map<string, string>();
  if (files.length) {
    const { data: urls } = await supabase.storage
      .from("property-docs")
      .createSignedUrls(
        files.map((f) => f.storage_path),
        3600,
      );
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  const toVM = (f: PropertyFileRow): FileVM => ({
    id: f.id,
    name: f.file_name,
    url: signed.get(f.storage_path) ?? "#",
    sizeKB: f.size_bytes != null ? Math.max(1, Math.round(Number(f.size_bytes) / 1024)) : null,
    createdAt: f.created_at,
  });

  const tenantName = new Map(data.tenants.map((t) => [t.id, t.full_name]));
  const out: Paperwork = { leases: {}, reports: {}, stays: {}, shortTerm: [] };

  for (const p of data.properties) {
    if (p.is_archived) continue;
    const units = data.units.filter((u) => u.property_id === p.id);
    const unitIds = new Set(units.map((u) => u.id));
    const leases = data.leases.filter((l) => unitIds.has(l.unit_id));
    const leaseVMs: LeaseVM[] = [];
    for (const u of units) {
      if (u.rental_type === "short_term") continue;
      const cur = currentLease(leases, u.id, today);
      const unitLeases = leases
        .filter((l) => l.unit_id === u.id)
        .sort((a, b) => b.start_date.localeCompare(a.start_date));
      for (const l of unitLeases) {
        const isCurrent = cur?.id === l.id;
        // Show the governing lease plus the closed-out history (not stray
        // future or orphaned rows).
        if (!isCurrent && l.status !== "ended") continue;
        const st = leaseStatus(l, today);
        leaseVMs.push({
          id: l.id,
          propertyId: p.id,
          unitLabel: u.label,
          tenant: l.tenant_id ? (tenantName.get(l.tenant_id) ?? null) : null,
          rent: Number(l.rent_amount),
          start: l.start_date,
          end: l.end_date,
          state: isCurrent ? st.state : "complete",
          daysLeft: st.daysLeft,
          current: isCurrent,
          files: files.filter((f) => f.kind === "lease" && f.lease_id === l.id).map(toVM),
        });
      }
    }
    out.leases[p.id] = leaseVMs;

    const isShort = units.some((u) => u.rental_type === "short_term");
    if (isShort) out.shortTerm.push(p.id);
    if (p.report_cadence && p.report_start) {
      const reportFiles = files.filter((f) => f.kind === "rental_report" && f.property_id === p.id);
      const periods = reportPeriods(
        p.report_cadence,
        p.report_start,
        p.report_due_days ?? null,
        reportFiles.map((f) => f.period_start ?? ""),
        today,
      );
      out.reports[p.id] = {
        cadence: p.report_cadence,
        start: p.report_start,
        dueDays: p.report_due_days ?? null,
        periods: periods.map((per) => ({
          ...per,
          files: reportFiles.filter((f) => f.period_start === per.start).map(toVM),
        })),
      };
    } else {
      out.reports[p.id] = null;
    }

    if (isShort) {
      const month = today.slice(0, 7);
      const stays = data.bookings.filter((b) => b.property_id === p.id && b.status !== "canceled");
      out.stays[p.id] = {
        upcoming: stays
          .filter((b) => b.check_out >= today)
          .sort((a, b) => a.check_in.localeCompare(b.check_in))
          .map((b) => ({
            id: b.id,
            checkIn: b.check_in,
            checkOut: b.check_out,
            payout: Number(b.payout),
            platform: b.platform,
            guest: b.guest_name,
          })),
        monthPayout:
          Math.round(stays.filter((b) => b.check_in.slice(0, 7) === month).reduce((s, b) => s + Number(b.payout), 0) * 100) / 100,
      };
    }
  }
  return out;
}
