/**
 * GET /properties/tax/:year — the tax-time pack for every property, as an
 * .xlsx file. Signed-in owner only; RLS scopes every read to them.
 */
import { todayIn } from "@/lib/ops/board";
import { getPortfolioData } from "@/lib/property/data";
import type { PropertyFileRow } from "@/lib/property/rows";
import { buildTaxWorkbook } from "@/lib/property/taxWorkbook";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  if (!isSupabaseConfigured()) return new Response("Not set up yet.", { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in to download the tax pack.", { status: 401 });

  const { year: raw } = await params;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return new Response("Pick a year.", { status: 400 });

  const [data, files] = await Promise.all([
    getPortfolioData(),
    supabase.from("property_files").select("property_id, kind, period_start, file_name"),
  ]);
  const buf = await buildTaxWorkbook(data, year, todayIn(), (files.data as PropertyFileRow[]) ?? []);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Rental tax pack ${year}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
