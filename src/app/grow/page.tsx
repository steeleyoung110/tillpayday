import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { GrowTab, type LoanPrefill } from "@/components/GrowTab";
import { LegalFooter } from "@/components/LegalFooter";
import { NavTabs } from "@/components/NavTabs";
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
    <main className="min-h-screen bg-slate-950 pb-16">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-white">
              Till <span className="text-emerald-400">Payday</span>
            </h1>
            <NavTabs active="grow" />
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>{user.email}</span>
            <form action={signOut}>
              <button className="rounded-lg border border-slate-700 px-3 py-1.5 transition hover:border-slate-500">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

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
    </main>
  );
}
