import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { LegalFooter } from "@/components/LegalFooter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Settings & About: your account, the app, and the legal pages. */
export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const meta = user.user_metadata as Record<string, unknown>;
  const displayName =
    (typeof meta.full_name === "string" && meta.full_name) || null;
  const acceptedAt =
    typeof meta.legal_accepted_at === "string" ? meta.legal_accepted_at : null;

  return (
    <AppShell active="settings">
      <div className="mx-auto max-w-2xl space-y-6 px-6 pt-6">
        <h2 className="text-lg font-semibold text-white">Settings &amp; About</h2>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Your account</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Email</dt>
              <dd className="text-slate-200">{user.email}</dd>
            </div>
            {displayName && (
              <div className="flex justify-between">
                <dt className="text-slate-400">Name</dt>
                <dd className="text-slate-200">{displayName}</dd>
              </div>
            )}
            {acceptedAt && (
              <div className="flex justify-between">
                <dt className="text-slate-400">Acknowledged the basics</dt>
                <dd className="text-slate-200">
                  {new Date(acceptedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </dd>
              </div>
            )}
          </dl>
          <form action={signOut} className="mt-5">
            <button className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-400">
              Sign out
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">About Till Payday</h3>
          <p className="mt-2 text-sm text-slate-400">
            An educational budgeting and money-simulation tool. You enter your
            own numbers; the app shows you the math. Nothing here is financial
            advice, and your money never touches this app.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link href="/legal" className="text-emerald-300 transition hover:text-emerald-200">
                About &amp; Legal →
              </Link>
            </li>
            <li>
              <Link href="/legal/terms" className="text-slate-400 transition hover:text-slate-200">
                {"Terms of Service (coming soon)"}
              </Link>
            </li>
            <li>
              <Link href="/legal/privacy" className="text-slate-400 transition hover:text-slate-200">
                {"Privacy Policy (coming soon)"}
              </Link>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Put it on your phone</h3>
          <p className="mt-2 text-sm text-slate-400">
            Till Payday installs like an app: on Android Chrome pick
            &ldquo;Add to Home Screen&rdquo; from the menu; on iPhone Safari use
            Share → &ldquo;Add to Home Screen.&rdquo; Full-screen, no browser
            bars.
          </p>
        </div>
      </div>
      <LegalFooter />
    </AppShell>
  );
}
