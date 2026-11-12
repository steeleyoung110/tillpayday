import { redirect } from "next/navigation";
import type { BoardProps, LeaseInfo, PlanInfo } from "@/components/OpsBoard";
import { buildInstallments, todayIn } from "@/lib/ops/board";
import { getBoardData } from "@/lib/ops/data";
import { getPortfolioData } from "@/lib/property/data";
import { getPaperwork } from "@/lib/property/paperwork";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Everything the board needs, for the signed-in user (redirects if signed out). */
export async function loadBoard(): Promise<BoardProps> {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [board, portfolio] = await Promise.all([getBoardData(), getPortfolioData()]);
  const today = todayIn();
  const paperwork = await getPaperwork(portfolio, today);

  const unitProperty = new Map(portfolio.units.map((u) => [u.id, u.property_id]));
  const installments = buildInstallments({
    schedules: board.schedules,
    leases: portfolio.leases,
    unitProperty,
    payments: portfolio.rentPayments,
    today,
  });

  const tenantName = new Map(portfolio.tenants.map((t) => [t.id, t.full_name]));
  const leases: Record<string, LeaseInfo> = Object.fromEntries(
    portfolio.leases.map((l) => [
      l.id,
      {
        tenant: l.tenant_id ? (tenantName.get(l.tenant_id) ?? null) : null,
        rent: Number(l.rent_amount),
        endDate: l.end_date,
        status: l.status,
      },
    ]),
  );
  const plans: Record<string, PlanInfo> = Object.fromEntries(
    board.schedules.map((s) => [
      s.id,
      { amount: Number(s.amount), frequency: s.frequency, startDate: s.start_date, endDate: s.end_date },
    ]),
  );
  const properties = portfolio.properties.filter((p) => !p.is_archived).map((p) => ({ id: p.id, name: p.name }));
  const people = [...new Set(board.tasks.map((t) => t.assignee?.trim()).filter((x): x is string => !!x))].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    userId: user.id,
    today,
    sections: board.sections,
    lines: board.lines,
    tasks: board.tasks,
    installments,
    leases,
    plans,
    properties,
    people,
    paperwork,
  };
}
