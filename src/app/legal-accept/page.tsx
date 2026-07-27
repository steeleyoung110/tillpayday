import Link from "next/link";
import { redirect } from "next/navigation";
import { acknowledgeLegal } from "@/app/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * One-time acknowledgment for OAuth signups (email signups tick the same box
 * on the sign-up form). The auth callback routes here when the metadata
 * stamp is missing; accepting stamps it and opens the app.
 */
export default async function LegalAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const meta = user.user_metadata as Record<string, unknown>;
  if (typeof meta.legal_accepted_at === "string") redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-white">One thing before we start</h1>
        <p className="mt-3 text-sm text-slate-300">
          Till Payday is an <strong>educational tool</strong>. It shows you the
          math on numbers you enter — honestly, even when the picture is ugly.
          It is not financial advice, it never touches your real accounts, and
          no outcome here is a promise about your actual money.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          {"The full picture lives at "}
          <Link href="/legal" className="text-emerald-300 underline-offset-2 hover:underline">
            About &amp; Legal
          </Link>
          .
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        )}
        <form action={acknowledgeLegal} className="mt-5 space-y-4">
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" name="legal_ack" className="mt-0.5 accent-emerald-500" />
            <span>
              I understand Till Payday is an educational tool that shows math
              on numbers I enter — not financial advice.
            </span>
          </label>
          <button className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400">
            Got it — take me in
          </button>
        </form>
      </div>
    </main>
  );
}
