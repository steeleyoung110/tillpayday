import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { LegalFooter } from "@/components/LegalFooter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Settings, property-log era: who you are, how to leave, where the law is. */
export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name =
    (user.user_metadata?.full_name as string | undefined) ?? null;

  return (
    <AppShell active="settings">
      <div className="mx-auto max-w-xl space-y-6 px-6 pt-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-white">Account</h2>
          <p className="mt-2 text-sm text-slate-300">
            {name ? `${name} · ` : ""}
            {user.email}
          </p>
          <form action={signOut} className="mt-4">
            <button
              type="submit"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-400"
            >
              Sign out
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-white">About & legal</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <Link href="/legal" className="text-emerald-300 transition hover:text-emerald-200">
              About this app
            </Link>
            <Link href="/legal/terms" className="text-slate-400 transition hover:text-slate-200">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="text-slate-400 transition hover:text-slate-200">
              Privacy Policy
            </Link>
          </div>
        </section>

        <LegalFooter />
      </div>
    </AppShell>
  );
}
