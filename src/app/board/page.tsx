import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OpsBoard, type LeaseInfo, type PlanInfo } from "@/components/OpsBoard";
import { buildInstallments, todayIn } from "@/lib/ops/board";
import { getBoardData } from "@/lib/ops/data";
import { getPortfolioData } from "@/lib/property/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Ops board: every business and property as a column of red / orange / blue
 * tiles, the way a Copart yard board marks out what's overdue, due soon and
 * open. Property columns also carry their rent installments, answered from
 * the board with "Has it been received?".
 */
export default async function BoardPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [board, portfolio] = await Promise.all([getBoardData(), getPortfolioData()]);
  const today = todayIn();

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
  const properties = portfolio.properties
    .filter((p) => !p.is_archived)
    .map((p) => ({ id: p.id, name: p.name }));
  const people = [
    ...new Set(board.tasks.map((t) => t.assignee?.trim()).filter((x): x is string => !!x)),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <AppShell active="board">
      <OpsBoard
        today={today}
        sections={board.sections}
        lines={board.lines}
        tasks={board.tasks}
        installments={installments}
        leases={leases}
        plans={plans}
        properties={properties}
        people={people}
      />
    </AppShell>
  );
}
