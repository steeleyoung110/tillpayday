import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { deleteSuggestion, setSuggestionStatus } from "@/app/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface AdminStats {
  members: number;
  confirmed: number;
  new_7d: number;
  active_7d: number;
  active_30d: number;
  sessions_active: number;
  logins_total: number;
  logins_7d: number;
  signups_by_day: { day: string; count: number }[];
  recent_members: { email: string; created_at: string; last_sign_in_at: string | null }[];
  tables: Record<string, number>;
}

interface SuggestionRow {
  id: string;
  email: string | null;
  message: string;
  status: "new" | "seen" | "done";
  created_at: string;
}

const TABLE_LABELS: [string, string][] = [
  ["income_sources", "Income sources"],
  ["buckets", "Buckets"],
  ["expenses", "Expenses / spends"],
  ["transfers", "Money moves"],
  ["income_entries", "Logged income"],
  ["goals", "Goals"],
  ["whatif_items", "What-ifs"],
  ["assets", "Assets"],
  ["liabilities", "Debts"],
  ["push_subscriptions", "Push devices"],
  ["calendar_tokens", "Calendar feeds"],
  ["shared_access", "Household shares"],
  ["suggestions", "Suggestions"],
];

/**
 * The behind-the-scenes dashboard: members, logins, activity, what's in the
 * database, and the suggestion inbox. Admins only — everyone else is bounced
 * to the Dashboard without learning this page exists.
 */
export default async function AdminPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminRow } = await supabase
    .from("admins")
    .select("user_id")
    .maybeSingle();
  if (!adminRow) redirect("/");

  const [{ data: statsRaw }, { data: suggestionsRaw }] = await Promise.all([
    supabase.rpc("admin_stats"),
    supabase
      .from("suggestions")
      .select("id, email, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const stats = statsRaw as AdminStats | null;
  if (!stats) redirect("/");
  const suggestions = (suggestionsRaw ?? []) as SuggestionRow[];

  const openSuggestions = suggestions.filter((s) => s.status !== "done");
  const doneSuggestions = suggestions.filter((s) => s.status === "done");
  const maxDay = Math.max(1, ...stats.signups_by_day.map((d) => d.count));

  const tile = (label: string, value: string | number, tone = "text-white") => (
    <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );

  return (
    <AppShell active="settings">
      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-white">Admin — behind the scenes</h2>
            <p className="text-sm text-slate-400">
              The whole app at a glance. Only admins can see this page.
            </p>
          </div>
          <AutoRefresh seconds={30} />
        </div>

        {/* People */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {tile("Members", stats.members)}
          {tile("New this week", stats.new_7d, stats.new_7d > 0 ? "text-emerald-300" : "text-white")}
          {tile("Active (7 days)", stats.active_7d)}
          {tile("Active (30 days)", stats.active_30d)}
          {tile("In the app now", stats.sessions_active, stats.sessions_active > 0 ? "text-emerald-300" : "text-white")}
          {tile("Logins", stats.logins_total)}
          {tile("Logins (7 days)", stats.logins_7d)}
        </div>
        <p className="-mt-3 text-xs text-slate-600">
          &ldquo;In the app now&rdquo; = sessions refreshed within the last
          hour. Login counting started Jul 27, 2026 — earlier logins
          weren&apos;t recorded anywhere, so they aren&apos;t counted.
        </p>

        {/* Signups chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Signups — last 30 days</h3>
          {stats.signups_by_day.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No signups in the last 30 days.</p>
          ) : (
            <div className="mt-3 flex h-24 items-end gap-1">
              {stats.signups_by_day.map((d) => (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.count} signup${d.count === 1 ? "" : "s"}`}
                  className="flex-1 rounded-t bg-emerald-500/70"
                  style={{ height: `${Math.max(8, (d.count / maxDay) * 100)}%` }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Suggestion inbox */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="font-semibold text-white">
              {`Suggestion inbox${openSuggestions.length > 0 ? ` (${openSuggestions.length} open)` : ""}`}
            </h3>
            <ul className="mt-3 space-y-2">
              {openSuggestions.map((s) => (
                <li key={s.id} className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
                  <p className="text-slate-200">{s.message}</p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500">
                      {`${s.email ?? "unknown"} · ${s.created_at.slice(0, 10)}`}
                      {s.status === "new" && (
                        <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">new</span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      {s.status === "new" && (
                        <form action={setSuggestionStatus}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="status" value="seen" />
                          <button className="text-slate-500 transition hover:text-sky-300">mark seen</button>
                        </form>
                      )}
                      <form action={setSuggestionStatus}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="status" value="done" />
                        <button className="text-slate-500 transition hover:text-emerald-300">done ✓</button>
                      </form>
                      <form action={deleteSuggestion}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-slate-500 transition hover:text-red-400">delete</button>
                      </form>
                    </span>
                  </div>
                </li>
              ))}
              {openSuggestions.length === 0 && (
                <li className="text-sm text-slate-500">
                  Inbox zero — suggestions land here when members file them
                  from Settings.
                </li>
              )}
            </ul>
            {doneSuggestions.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-400">
                  {`Done (${doneSuggestions.length})`}
                </summary>
                <ul className="mt-2 space-y-1">
                  {doneSuggestions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-slate-500">
                      <span className="truncate">{`✓ ${s.message}`}</span>
                      <form action={deleteSuggestion}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="ml-2 text-slate-600 transition hover:text-red-400">×</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* What's in the database */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="font-semibold text-white">What&apos;s in the database</h3>
            <ul className="mt-3 space-y-1">
              {TABLE_LABELS.map(([key, label]) => (
                <li
                  key={key}
                  className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-1.5 text-sm"
                >
                  <span className="text-slate-300">{label}</span>
                  <span className="font-semibold text-slate-200">
                    {stats.tables[key] ?? 0}
                    {key === "expenses" && (stats.tables.expenses_7d ?? 0) > 0 && (
                      <span className="ml-2 text-xs font-normal text-emerald-300">
                        {`+${stats.tables.expenses_7d} this week`}
                      </span>
                    )}
                    {key === "suggestions" && (stats.tables.suggestions_new ?? 0) > 0 && (
                      <span className="ml-2 text-xs font-normal text-emerald-300">
                        {`${stats.tables.suggestions_new} new`}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recent members */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Recent members</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-semibold">Email</th>
                  <th className="pb-2 pr-4 font-semibold">Joined</th>
                  <th className="pb-2 font-semibold">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_members.map((m) => (
                  <tr key={m.email} className="border-t border-slate-800">
                    <td className="py-2 pr-4 text-slate-200">{m.email}</td>
                    <td className="py-2 pr-4 text-slate-400">{m.created_at.slice(0, 10)}</td>
                    <td className="py-2 text-slate-400">
                      {m.last_sign_in_at ? m.last_sign_in_at.slice(0, 10) : "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
