import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GrowTab, type LoanPrefill } from "@/components/GrowTab";
import { LegalFooter } from "@/components/LegalFooter";
import { getNetWorthData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * The Grow tab (phase 10): educational compounding calculators. Works fully
 * standalone with defaults; if the user has liabilities in Net Worth, they
 * appear as one-tap prefills (10D) — offered, never required.
 */
export default async function GrowPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const nw = await getNetWorthData();
  const prefills: LoanPrefill[] = nw.liabilities
    .filter((l) => !l.is_archived && Number(l.current_balance) > 0)
    .map((l) => ({
      id: l.id,
      name: l.name,
      balance: Number(l.current_balance),
      rate: l.interest_rate !== null ? Number(l.interest_rate) : null,
    }));

  return (
    <AppShell active="grow">
      <div className="mx-auto max-w-6xl space-y-4 px-6 pt-6">
        <div>
          <h2 className="text-lg font-semibold text-white">
            See what compounding does
          </h2>
          <p className="text-sm text-slate-400">
            Interest works for you or against you — drag the numbers and watch
            which.
          </p>
        </div>
        <GrowTab prefills={prefills} />
      </div>
      <LegalFooter disclaimer />
    </AppShell>
  );
}
