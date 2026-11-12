import { redirect } from "next/navigation";
import type { BoardProps, LeaseInfo, PlanInfo } from "@/components/OpsBoard";
import { addDays, buildInstallments, dayOf, paymentsAsOf, todayIn } from "@/lib/ops/board";
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
  // Week-over-week: compare with the same day last week, once the board is that old.
  const weekAgo = addDays(today, -7);
  const boardStart = board.sections.map((s) => dayOf(s.created_at)).filter(Boolean).sort()[0] ?? null;
  const trendDay = boardStart && boardStart <= weekAgo ? weekAgo : null;
  const paperwork = await getPaperwork(portfolio, today, trendDay);

  const unitProperty = new Map(portfolio.units.map((u) => [u.id, u.property_id]));
  const installments = buildInstallments({
    schedules: board.schedules,
    leases: portfolio.leases,
    unitProperty,
    payments: portfolio.rentPayments,
    today,
  });

  const trendInstallments = trendDay
    ? buildInstallments({
        schedules: board.schedules,
        leases: portfolio.leases,
        unitProperty,
        payments: paymentsAsOf(portfolio.rentPayments, trendDay),
        today: trendDay,
      })
    : [];

  // Bills a repeating expense already counts (checking those off logs nothing new).
  const autoBills: Record<string, string[]> = {};
  for (const e of portfolio.expenses) {
    if (e.cadence === "one_time" || e.expense_date > today) continue;
    const list = (autoBills[e.property_id] ??= []);
    if (!list.includes(e.category)) list.push(e.category);
  }

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
    trend: trendDay ? { day: trendDay, installments: trendInstallments } : null,
    autoBills,
  };
}
