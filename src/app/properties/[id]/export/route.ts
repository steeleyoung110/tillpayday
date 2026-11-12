/**
 * GET /properties/:id/export — the property's rent ledger as an .xlsx file
 * (Setup / Payments / Ledger / Summary). Signed-in owner only: RLS scopes
 * every read to the requesting user, so another account gets a 404.
 */
import { todayIn } from "@/lib/ops/board";
import type { RentScheduleRow } from "@/lib/ops/rows";
import { getPortfolioData } from "@/lib/property/data";
import { buildLedgerWorkbook } from "@/lib/property/ledgerWorkbook";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return new Response("Not set up yet.", { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in to download this ledger.", { status: 401 });

  const { id } = await params;
  const data = await getPortfolioData();
  const property = data.properties.find((p) => p.id === id);
  if (!property) return new Response("Property not found.", { status: 404 });

  const units = data.units.filter((u) => u.property_id === id);
  const unitIds = new Set(units.map((u) => u.id));
  const leases = data.leases.filter((l) => unitIds.has(l.unit_id));
  const { data: schedules } = await supabase.from("rent_schedules").select("*").eq("property_id", id);

  const todayISO = todayIn();
  const buf = await buildLedgerWorkbook({
    property,
    units,
    leases,
    tenants: data.tenants,
    payments: data.rentPayments.filter((r) => r.property_id === id),
    schedules: (schedules as RentScheduleRow[]) ?? [],
    todayISO,
  });

  const fileName = `${property.name.replace(/[^A-Za-z0-9 ._-]/g, "").trim() || "Property"} rent ledger ${todayISO}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
