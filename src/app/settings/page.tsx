import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  addShare,
  deleteCalendarToken,
  removeShare,
  rotateCalendarToken,
  toggleShareEdit,
  saveNudgePrefs,
  setHourlyWage,
  setRoundup,
  signOut,
  submitSuggestion,
  undoRestore,
  wipeMyData,
} from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { CsvImport } from "@/components/CsvImport";
import { StatementImport } from "@/components/StatementImport";
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
  can_edit: boolean;
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
    .select("id, owner_id, owner_email, viewer_email, can_edit")
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

  // Admin gate (RLS: you can only ever see your own membership row) and the
  // user's own past suggestions.
  const [{ data: adminRow }, { data: mySuggestionsRaw }] = await Promise.all([
    supabase.from("admins").select("user_id").maybeSingle(),
    supabase
      .from("suggestions")
      .select("id, message, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const isAdmin = Boolean(adminRow);
  const mySuggestions = (mySuggestionsRaw ?? []) as {
    id: string;
    message: string;
    status: string;
    created_at: string;
  }[];

  const meta = user.user_metadata as Record<string, unknown>;
  const displayName =
    (typeof meta.full_name === "string" && meta.full_name) || null;
  const acceptedAt =
    typeof meta.legal_accepted_at === "string" ? meta.legal_accepted_at : null;

  return (
    <AppShell
      active="settings"
      quickAdd={{
        buckets: data.buckets.map((b) => ({ id: b.id, name: b.name })),
        todayISO: new Date().toISOString().slice(0, 10),
        fallbackBucketId: funBucket?.id ?? "",
      }}
    >
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
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

        <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-5">
          <h3 className="font-semibold text-red-300">Danger zone</h3>
          <p className="mt-2 text-sm text-slate-400">
            Erase every budget number on this account — income, buckets,
            bills, goals, history, net worth, devices, calendar feed. Your
            login stays; the data does not come back. Type{" "}
            <span className="font-mono font-semibold text-red-300">DELETE</span>{" "}
            to confirm.
          </p>
          <form action={wipeMyData} className="mt-3 flex items-center gap-2">
            <input
              name="confirm"
              placeholder="Type DELETE"
              autoComplete="off"
              className="w-36 rounded-lg border border-red-500/40 bg-slate-800 px-3 py-1.5 text-sm text-white outline-none focus:border-red-400"
            />
            <button className="rounded-lg border border-red-500/50 px-3 py-1.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10">
              Erase my data
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
            Share your budget with a partner or accountability buddy. Sharing
            starts <strong>read-only</strong>; flip &ldquo;can log
            spending&rdquo; to let them add spends to your budget too (each
            one marked as added by them). They need their own Till Payday
            account under the email you enter.
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
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-slate-300"
                >
                  <span>
                    {s.can_edit
                      ? `${s.viewer_email} can view + log spending`
                      : `${s.viewer_email} can view your budget`}
                  </span>
                  <span className="flex items-center gap-3">
                    <InstantAction
                      action={toggleShareEdit}
                      values={{ id: s.id, can_edit: String(!s.can_edit) }}
                      message={
                        s.can_edit
                          ? `${s.viewer_email} is back to read-only.`
                          : `${s.viewer_email} can now log spending into your budget.`
                      }
                      className={`text-xs transition ${
                        s.can_edit
                          ? "text-emerald-300 hover:text-amber-300"
                          : "text-slate-400 hover:text-emerald-300"
                      }`}
                    >
                      {s.can_edit ? "make read-only" : "allow logging spends"}
                    </InstantAction>
                    <InstantAction
                      action={removeShare}
                      undoAction={undoRestore}
                      values={{ id: s.id }}
                      message={`Stopped sharing with ${s.viewer_email}.`}
                      className="text-xs text-slate-400 transition hover:text-red-400"
                    >
                      stop sharing
                    </InstantAction>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {sharedWithMe.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
          {process.env.ANTHROPIC_API_KEY && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Statement Drop — PDF statements &amp; paycheck stubs
              </p>
              <StatementImport
                buckets={data.buckets.map((b) => ({
                  id: b.id,
                  name: b.name,
                  is_savings: b.is_savings,
                  is_flexible: b.is_flexible,
                  is_paused: b.is_paused,
                }))}
              />
              <p className="mt-2 text-xs text-slate-400">
                The PDF is read by Claude on the server (Anthropic API, 30-day
                retention) — merchant names and amounts come back, account
                numbers are never extracted. Charges get pre-sorted into your
                buckets by meaning; you review every row before importing.
              </p>
            </div>
          )}
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Import spending from a CSV
            </p>
            <CsvImport
              buckets={data.buckets.map((b) => ({ id: b.id, name: b.name }))}
              defaultBucketId={funBucket?.id ?? ""}
            />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Full backup
            </p>
            <a
              href="/api/backup"
              className="inline-block rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 transition hover:border-emerald-400 hover:text-white"
            >
              Download everything as JSON ↓
            </a>
            <p className="mt-1 text-xs text-slate-400">
              Every table, one file — the whole account in a format you can
              keep, read, or hand to another tool. No lock-in.
            </p>
          </div>
        </div>

        <Link
          href="/guide"
          className="block rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-emerald-400/50"
        >
          <h3 className="font-semibold text-white">What&apos;s in here 🗺️</h3>
          <p className="mt-1 text-sm text-slate-400">
            The whole app organized by the question you&apos;re actually
            asking. Worth two minutes — there&apos;s more in here than the
            dashboard shows.
          </p>
        </Link>

        {isAdmin && (
          <Link
            href="/admin"
            className="block rounded-2xl border border-violet-500/40 bg-violet-500/10 p-5 transition hover:border-violet-400"
          >
            <h3 className="font-semibold text-violet-200">Admin portal 🛠️</h3>
            <p className="mt-1 text-sm text-violet-100/70">
              Members, logins, activity, and the suggestion inbox — the whole
              app behind the scenes.
            </p>
          </Link>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">The work-hours lens ⏱️</h3>
          <p className="mt-2 text-sm text-slate-400">
            Tell the app what you earn per hour and your bills get a second
            price tag: hours of your life. $60 stops being &ldquo;just
            $60&rdquo; when it reads &ldquo;4 hours of work.&rdquo;
          </p>
          <form action={setHourlyWage} className="mt-3 flex items-center gap-2">
            <input
              name="hourly_wage"
              type="number"
              step="0.01"
              min="0"
              defaultValue={
                typeof meta.hourly_wage === "number" && meta.hourly_wage > 0
                  ? meta.hourly_wage
                  : undefined
              }
              placeholder="Hourly wage $"
              className="w-36 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-400"
            />
            <button className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
              Save
            </button>
          </form>
          {typeof meta.hourly_wage === "number" && meta.hourly_wage > 0 ? (
            <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              {`✓ Lens is ON at $${meta.hourly_wage}/hr — your Budget page now prices every bill in hours of work, and the Dashboard shows this cycle's spending in hours. Clear the field and save to turn it off.`}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">
              The lens is off. Stored on your account only.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Round-up rule 🪙</h3>
          <p className="mt-2 text-sm text-slate-400">
            Every spend you log rounds up, and the spare change quietly moves
            to savings. A $4.37 coffee banks $0.63 — small, automatic, real.
          </p>
          <form action={setRoundup} className="mt-3 flex items-center gap-2">
            {[
              [0, "Off"],
              [1, "Next $1"],
              [5, "Next $5"],
            ].map(([val, label]) => (
              <button
                key={val}
                name="roundup_to"
                value={val}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  (meta.roundup_to ?? 0) === val
                    ? "bg-emerald-500 font-semibold text-slate-950"
                    : "border border-slate-700 text-slate-300 hover:border-emerald-400"
                }`}
              >
                {label}
              </button>
            ))}
          </form>
          <p className="mt-2 text-xs text-slate-400">
            Each round-up shows as its own move in Budget → Move money, so
            nothing is hidden and every one is undoable.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Notification volume 🔔</h3>
          <p className="mt-2 text-sm text-slate-400">
            Choose which nudges may reach your lock screen and inbox. Unchecked
            ones still show in the app — negative savings always alerts, no
            opt-out for that one.
          </p>
          <form action={saveNudgePrefs} className="mt-3 space-y-1.5">
            {(
              [
                ["bill-underfunded", "A bill is about to land on an empty bucket"],
                ["payday-tomorrow", "Payday lands tomorrow"],
                ["danger-tomorrow", "Tomorrow is the tightest day before payday"],
                ["renewal-soon", "A contract renews soon — shop it around"],
                ["manual-due", "A manual-pay bill is due — it's on you"],
                ["autopay-check", "An autopay bill should have gone through"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  name={`pref_${key}`}
                  defaultChecked={
                    (meta.nudge_prefs as Record<string, boolean> | undefined)?.[key] !== false
                  }
                  className="accent-emerald-500"
                />
                {label}
              </label>
            ))}
            <button className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
              Save preferences
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Suggest something 💡</h3>
          <p className="mt-2 text-sm text-slate-400">
            Ideas, bugs, and app news all live in one place now — the Updates
            tab. Anything you send there comes back with a reply.
          </p>
          <Link
            href="/updates"
            className="mt-3 inline-block rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Open Updates &amp; feedback →
          </Link>
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
              <p className="text-xs text-slate-400">
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
                  <button className="text-xs text-slate-400 transition hover:text-red-400">
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
