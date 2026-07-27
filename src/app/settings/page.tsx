import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  addShare,
  deleteCalendarToken,
  removeShare,
  rotateCalendarToken,
  signOut,
  undoRestore,
} from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { CsvImport } from "@/components/CsvImport";
import { EnablePush } from "@/components/EnablePush";
import { InstantAction } from "@/components/InstantAction";
import { LegalFooter } from "@/components/LegalFooter";
import { getDashboardData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

interface ShareRow {
  id: string;
  owner_id: string;
  owner_email: string;
  viewer_email: string;
}

/** Settings & About: your account, the app, and the legal pages. */
export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getDashboardData();
  const funBucket = data.buckets.find((b) => b.is_flexible && !b.is_savings);
  // Sharing: grants I've made, and budgets shared with me.
  const { data: shareRows } = await supabase
    .from("shared_access")
    .select("id, owner_id, owner_email, viewer_email")
    .order("created_at");
  const allShares = (shareRows ?? []) as ShareRow[];
  const myGrants = allShares.filter((s) => s.owner_id === user.id);
  const sharedWithMe = allShares.filter(
    (s) => s.owner_id !== user.id,
  );
  // Calendar feed token + absolute feed URL for calendar apps.
  const { data: calRow } = await supabase
    .from("calendar_tokens")
    .select("token")
    .maybeSingle();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const feedUrl = calRow ? `${origin}/api/calendar?token=${calRow.token}` : null;

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
          <h3 className="font-semibold text-white">Household sharing</h3>
          <p className="mt-2 text-sm text-slate-400">
            Share a <strong>read-only</strong> view of your budget with a
            partner or accountability buddy. They see your numbers exactly as
            you do — and can&apos;t change a thing. They need their own Till
            Payday account under the email you enter.
          </p>
          <form action={addShare} className="mt-3 flex flex-wrap items-end gap-2">
            <input
              name="viewer_email"
              type="email"
              required
              placeholder="their@email.com"
              className="min-w-52 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400"
            />
            <button className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
              Share my budget
            </button>
          </form>
          {myGrants.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {myGrants.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-slate-300">
                  <span>{`${s.viewer_email} can view your budget`}</span>
                  <InstantAction
                    action={removeShare}
                    undoAction={undoRestore}
                    values={{ id: s.id }}
                    message={`Stopped sharing with ${s.viewer_email}.`}
                    className="text-xs text-slate-500 transition hover:text-red-400"
                  >
                    stop sharing
                  </InstantAction>
                </li>
              ))}
            </ul>
          )}
          {sharedWithMe.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Shared with you
              </p>
              <ul className="space-y-1 text-sm">
                {sharedWithMe.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/?view=${s.owner_id}`}
                      className="text-violet-300 transition hover:text-violet-200"
                    >
                      {`👀 View ${s.owner_email}'s budget →`}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Your data</h3>
          <p className="mt-2 text-sm text-slate-400">
            Import spending from a bank or card CSV export — no bank
            connection, just a file — or download everything you&apos;ve
            entered. Your numbers are yours.
          </p>
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Import spending from a CSV
            </p>
            <CsvImport
              buckets={data.buckets.map((b) => ({ id: b.id, name: b.name }))}
              defaultBucketId={funBucket?.id ?? ""}
            />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Export as CSV
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ["expenses", "Bills & spends"],
                ["buckets", "Buckets"],
                ["income_sources", "Income"],
                ["income_entries", "Logged income"],
                ["transfers", "Transfers"],
                ["goals", "Goals"],
                ["assets", "Assets"],
                ["liabilities", "Debts"],
              ].map(([table, label]) => (
                <a
                  key={table}
                  href={`/api/export?table=${table}`}
                  className="rounded-full border border-slate-600 px-3 py-1 text-slate-300 transition hover:border-emerald-400 hover:text-white"
                >
                  {`${label} ↓`}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Notifications</h3>
          <p className="mt-2 text-sm text-slate-400">
            The daily nudges — a bill landing that its bucket can&apos;t
            cover, payday tomorrow — on your lock screen instead of waiting
            for you to open the app.
          </p>
          <div className="mt-3">
            <EnablePush
              vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Calendar feed</h3>
          <p className="mt-2 text-sm text-slate-400">
            Subscribe your Google or Apple calendar to your paydays and bill
            due dates — money shows up where you actually look every morning.
            The link is private; anyone holding it can see bill names and
            amounts, so treat it like a password.
          </p>
          {feedUrl ? (
            <div className="mt-3 space-y-2">
              <p className="break-all rounded-lg bg-slate-800/60 px-3 py-2 font-mono text-xs text-emerald-300">
                {feedUrl}
              </p>
              <p className="text-xs text-slate-500">
                Google Calendar: Settings → Add calendar → From URL. Apple:
                File → New Calendar Subscription.
              </p>
              <div className="flex gap-3">
                <form action={rotateCalendarToken}>
                  <button className="text-xs text-amber-300 transition hover:text-amber-200">
                    regenerate link (kills the old one)
                  </button>
                </form>
                <form action={deleteCalendarToken}>
                  <button className="text-xs text-slate-500 transition hover:text-red-400">
                    turn off
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <form action={rotateCalendarToken} className="mt-3">
              <button className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                Create my calendar link
              </button>
            </form>
          )}
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
