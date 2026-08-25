import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LegalFooter } from "@/components/LegalFooter";
import { InstantAction } from "@/components/InstantAction";
import {
  deleteAnnouncement,
  deleteSuggestion,
  postAnnouncement,
  replyToSuggestion,
  setSuggestionStatus,
  submitSuggestion,
  toggleAnnouncement,
} from "@/app/actions";
import { relativeDay } from "@/lib/relativeDate";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface SuggestionRow {
  id: string;
  user_id: string;
  email: string | null;
  message: string;
  status: string;
  kind: string;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
}

interface AnnouncementRow {
  id: string;
  message: string;
  active: boolean;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = {
  bug: "🐞 Something's broken",
  idea: "💡 Idea",
  question: "❓ Question",
};

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400";

/**
 * Updates: the two-way channel between the people testing this and the person
 * building it. Announcements land here (and on the dashboard); suggestions go
 * out from here and come back with an answer attached.
 *
 * Deliberately one page for both directions — a tester shouldn't have to
 * learn where "news" lives versus where "tell them something" lives.
 */
export default async function UpdatesPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: adminRow } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(adminRow);

  // RLS does the filtering: everyone sees active announcements and their own
  // suggestions; an admin sees everything.
  const [{ data: annRaw }, { data: sugRaw }] = await Promise.all([
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    supabase.from("suggestions").select("*").order("created_at", { ascending: false }),
  ]);
  const announcements = (annRaw ?? []) as AnnouncementRow[];
  const suggestions = (sugRaw ?? []) as SuggestionRow[];
  const mine = suggestions.filter((s) => s.user_id === user.id);
  const openCount = suggestions.filter((s) => s.status === "new").length;

  return (
    <AppShell active="updates">
      <div className="mx-auto max-w-3xl space-y-6 px-6 pt-6">
        <div>
          <h1 className="text-2xl font-black text-white">Updates &amp; feedback 📣</h1>
          <p className="mt-1 text-sm text-slate-400">
            What&apos;s changed in the app, and a direct line to the person
            building it. Till Payday is still being shaped — if something is
            broken or missing, saying so here is the fastest way to fix it.
          </p>
        </div>

        {/* ---------------------------------------------------------------
            What's new — the broadcast direction
        --------------------------------------------------------------- */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold text-white">What&apos;s new</h2>
          {announcements.filter((a) => a.active).length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">
              Nothing announced yet. When something changes — a fix, a new
              feature, a heads-up — it shows up here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {announcements
                .filter((a) => a.active)
                .map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3"
                  >
                    <p className="text-sm text-violet-100">{a.message}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {relativeDay(a.created_at.slice(0, 10), todayISO)}
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------
            Tell me something — the inbound direction
        --------------------------------------------------------------- */}
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <h2 className="font-semibold text-emerald-200">Tell me something</h2>
          <p className="mt-1 text-xs text-slate-400">
            A bug, an idea, a &ldquo;why doesn&apos;t it…&rdquo;. Be blunt —
            vague praise doesn&apos;t improve anything.
          </p>
          <form action={submitSuggestion} className="mt-3 space-y-2">
            <label className="block text-xs text-slate-400">
              What kind of thing is this?
              <select name="kind" defaultValue="bug" className={`${inputCls} mt-1`}>
                <option value="bug">🐞 Something&apos;s broken</option>
                <option value="idea">💡 An idea</option>
                <option value="question">❓ A question</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Tell me about it
              <textarea
                name="message"
                required
                rows={3}
                maxLength={2000}
                placeholder="Google sign-in isn't working for me — it just bounces back to the login page."
                className={`${inputCls} mt-1`}
              />
            </label>
            <button className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400">
              Send it
            </button>
          </form>
        </section>

        {/* ---------------------------------------------------------------
            Your own threads, with replies
        --------------------------------------------------------------- */}
        {mine.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold text-white">What you&apos;ve sent</h2>
            <ul className="mt-3 space-y-3">
              {mine.map((s) => (
                <li key={s.id} className="rounded-xl bg-slate-800/60 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-400">
                      {KIND_LABEL[s.kind] ?? s.kind}
                    </span>
                    <span className="text-xs text-slate-400">
                      {relativeDay(s.created_at.slice(0, 10), todayISO)}
                      {s.status === "done" && (
                        <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">
                          done ✓
                        </span>
                      )}
                      {s.status === "seen" && !s.reply && (
                        <span className="ml-2 rounded bg-slate-600/40 px-1.5 py-0.5 text-slate-300">
                          seen
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-200">{s.message}</p>
                  {s.reply && (
                    <div className="mt-2 rounded-lg border-l-2 border-emerald-400 bg-slate-900/60 px-3 py-2">
                      <p className="text-xs font-semibold text-emerald-300">Reply</p>
                      <p className="mt-0.5 text-sm text-slate-200">{s.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------------------------------------------------------------
            Admin: broadcast + inbox. Only Steele sees any of this.
        --------------------------------------------------------------- */}
        {isAdmin && (
          <>
            <section className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-5">
              <h2 className="font-semibold text-violet-200">
                Broadcast to everyone 🛠️
              </h2>
              <p className="mt-1 text-xs text-violet-100/70">
                Goes out to every account: here, and as a dismissible banner on
                their dashboard.
              </p>
              <form action={postAnnouncement} className="mt-3 space-y-2">
                <textarea
                  name="message"
                  required
                  rows={2}
                  maxLength={500}
                  placeholder="Fixed Google sign-in — try again and let me know if it still misbehaves."
                  className={inputCls}
                />
                <button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-violet-400">
                  Post it
                </button>
              </form>

              {announcements.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {announcements.map((a) => (
                    <li
                      key={a.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/60 px-3 py-2 text-sm ${
                        a.active ? "" : "opacity-50"
                      }`}
                    >
                      <span className="text-slate-200">{a.message}</span>
                      <span className="flex items-center gap-3">
                        <InstantAction
                          action={toggleAnnouncement}
                          values={{ id: a.id, active: String(!a.active) }}
                          message={a.active ? "Announcement hidden." : "Announcement live again."}
                          className="text-xs text-slate-400 transition hover:text-violet-300"
                        >
                          {a.active ? "hide" : "show"}
                        </InstantAction>
                        <InstantAction
                          action={deleteAnnouncement}
                          values={{ id: a.id }}
                          message="Announcement deleted."
                          className="text-xs text-slate-400 transition hover:text-red-400"
                        >
                          delete
                        </InstantAction>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-white">Inbox</h2>
                <p className="text-sm text-slate-400">
                  {`${openCount} unanswered of ${suggestions.length}`}
                </p>
              </div>
              {suggestions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">
                  Nothing in yet. Once testers start using it, this fills up.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {suggestions.map((s) => (
                    <li
                      key={s.id}
                      className={`rounded-xl bg-slate-800/60 px-4 py-3 ${
                        s.status === "done" ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-xs text-slate-400">
                          {`${KIND_LABEL[s.kind] ?? s.kind} · ${s.email ?? "unknown"}`}
                        </span>
                        <span className="text-xs text-slate-400">
                          {relativeDay(s.created_at.slice(0, 10), todayISO)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-100">{s.message}</p>

                      {s.reply ? (
                        <p className="mt-2 rounded-lg border-l-2 border-emerald-400 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                          {`You replied: ${s.reply}`}
                        </p>
                      ) : (
                        <form action={replyToSuggestion} className="mt-2 flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={s.id} />
                          <input
                            name="reply"
                            required
                            placeholder="Reply — they'll see this in their Updates tab"
                            className={`${inputCls} min-w-52 flex-1`}
                          />
                          <button className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400">
                            Send reply
                          </button>
                        </form>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {(["new", "seen", "done"] as const)
                          .filter((st) => st !== s.status)
                          .map((st) => (
                            <InstantAction
                              key={st}
                              action={setSuggestionStatus}
                              values={{ id: s.id, status: st }}
                              message={`Marked ${st}.`}
                              className="text-xs text-slate-400 transition hover:text-emerald-300"
                            >
                              {`mark ${st}`}
                            </InstantAction>
                          ))}
                        <InstantAction
                          action={deleteSuggestion}
                          values={{ id: s.id }}
                          message="Suggestion deleted."
                          className="text-xs text-slate-400 transition hover:text-red-400"
                        >
                          delete
                        </InstantAction>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      <LegalFooter />
    </AppShell>
  );
}
