/**
 * RLS attack suite for the two-way testing loop: `suggestions` (what testers
 * send me) and `announcements` (what I send everyone).
 *
 * These two tables break the app's usual owner-only shape, so they get their
 * own suite. Suggestions are write-your-own / read-your-own but update-and-
 * delete-admin-only; announcements are read-by-all but write-admin-only. Both
 * asymmetries are load-bearing:
 *
 *   - A tester must not be able to write a `reply` on their own row, or the
 *     app would show them an answer from "me" that I never wrote.
 *   - A tester must not be able to insert an announcement, or anyone could
 *     broadcast a banner to every user of the app.
 *
 * Runs live against the real project with the anon key, as two seeded test
 * users. Neither is an admin — that is the whole point.
 *
 * NOTE: suggestion probe rows cannot be cleaned up by the test users, because
 * delete is admin-only (which this suite proves). They are labelled so they're
 * obvious in the admin inbox.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    const txt = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) env[m[1]] = m[2];
    }
  } catch {
    // no .env.local — fall back to process.env only
  }
  return env;
}

const env = loadEnvLocal();
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const configured = Boolean(URL_ && ANON);

const USER_A = "rls-test-a@tillpayday.local";
const USER_B = "rls-test-b@tillpayday.local";
const PASSWORD = "RLS-probe-9f2e7c41!"; // throwaway test-only credentials

const TIMEOUT = 30_000;
const PROBE = "RLS PROBE — safe to delete";

describe.runIf(configured)("feedback loop — suggestions", () => {
  let a: SupabaseClient;
  let b: SupabaseClient;
  let anon: SupabaseClient;
  let aUserId: string;
  let aRowId: string;
  let bRowId: string;

  const mkClient = () =>
    createClient(URL_!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  beforeAll(async () => {
    a = mkClient();
    b = mkClient();
    anon = mkClient();

    const [ra, rb] = await Promise.all([
      a.auth.signInWithPassword({ email: USER_A, password: PASSWORD }),
      b.auth.signInWithPassword({ email: USER_B, password: PASSWORD }),
    ]);
    if (ra.error || rb.error) {
      throw new Error(
        `Could not sign in RLS test users (${ra.error?.message ?? rb.error?.message}).`,
      );
    }
    aUserId = ra.data.user!.id;

    const ia = await a
      .from("suggestions")
      .insert({ message: `${PROBE} (A)`, kind: "bug", route: "/budget", app_version: "test" })
      .select("id")
      .single();
    if (ia.error) throw new Error(`A could not file a suggestion: ${ia.error.message}`);
    aRowId = (ia.data as { id: string }).id;

    const ib = await b
      .from("suggestions")
      .insert({ message: `${PROBE} (B)` })
      .select("id")
      .single();
    if (ib.error) throw new Error(`B could not file a suggestion: ${ib.error.message}`);
    bRowId = (ib.data as { id: string }).id;
  }, TIMEOUT);

  afterAll(async () => {
    await Promise.all([a.auth.signOut(), b.auth.signOut()]);
  }, TIMEOUT);

  it("a signed-in user can file one and read it back", { timeout: TIMEOUT }, async () => {
    const { data, error } = await a.from("suggestions").select("id,message,route");
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toContain(aRowId);
  });

  it("another user cannot read it", { timeout: TIMEOUT }, async () => {
    const { data, error } = await b.from("suggestions").select("id");
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).not.toContain(aRowId);
  });

  it("the route/version context does not leak either", { timeout: TIMEOUT }, async () => {
    const { data } = await b.from("suggestions").select("route,app_version").eq("id", aRowId);
    expect(data ?? []).toHaveLength(0);
  });

  it("another user cannot update it", { timeout: TIMEOUT }, async () => {
    const { data } = await b
      .from("suggestions")
      .update({ message: "hijacked" })
      .eq("id", aRowId)
      .select();
    expect(data ?? []).toHaveLength(0);

    const { data: still } = await a
      .from("suggestions")
      .select("message")
      .eq("id", aRowId)
      .single();
    expect((still as { message: string }).message).toBe(`${PROBE} (A)`);
  });

  it("a user cannot forge a suggestion under someone else's id", { timeout: TIMEOUT }, async () => {
    const { error } = await b
      .from("suggestions")
      .insert({ message: `${PROBE} forged`, user_id: aUserId });
    expect(error).not.toBeNull();
  });

  // The reply channel. If this ever passes, the app can show a tester an
  // answer "from me" that I never wrote.
  it("a user cannot write a reply on their OWN suggestion", { timeout: TIMEOUT }, async () => {
    const { data } = await b
      .from("suggestions")
      .update({ reply: "Sure, shipping that tomorrow!", replied_at: new Date().toISOString() })
      .eq("id", bRowId)
      .select();
    expect(data ?? []).toHaveLength(0);

    const { data: still } = await b
      .from("suggestions")
      .select("reply,replied_at")
      .eq("id", bRowId)
      .single();
    expect((still as { reply: string | null }).reply).toBeNull();
    expect((still as { replied_at: string | null }).replied_at).toBeNull();
  });

  it("a user cannot mark their own suggestion done", { timeout: TIMEOUT }, async () => {
    await b.from("suggestions").update({ status: "done" }).eq("id", bRowId);
    const { data } = await b.from("suggestions").select("status").eq("id", bRowId).single();
    expect((data as { status: string }).status).toBe("new");
  });

  it("a user cannot delete their own suggestion", { timeout: TIMEOUT }, async () => {
    await b.from("suggestions").delete().eq("id", bRowId);
    const { data } = await b.from("suggestions").select("id").eq("id", bRowId);
    expect(data).toHaveLength(1);
  });

  it("a user cannot delete someone else's suggestion", { timeout: TIMEOUT }, async () => {
    await b.from("suggestions").delete().eq("id", aRowId);
    const { data } = await a.from("suggestions").select("id").eq("id", aRowId);
    expect(data).toHaveLength(1);
  });

  it("signed-out clients cannot read the inbox", { timeout: TIMEOUT }, async () => {
    const { data } = await anon.from("suggestions").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("signed-out clients cannot file one", { timeout: TIMEOUT }, async () => {
    const { error } = await anon.from("suggestions").insert({ message: `${PROBE} anon` });
    expect(error).not.toBeNull();
  });

  it("a non-admin is not in the admins table and cannot add themselves", { timeout: TIMEOUT }, async () => {
    const { data: seen } = await b.from("admins").select("user_id");
    expect(seen ?? []).toHaveLength(0);

    const { error } = await b.from("admins").insert({ user_id: aUserId });
    expect(error).not.toBeNull();
  });
});

describe.runIf(configured)("broadcast — announcements", () => {
  let a: SupabaseClient;
  let anon: SupabaseClient;

  const mkClient = () =>
    createClient(URL_!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  beforeAll(async () => {
    a = mkClient();
    anon = mkClient();
    const ra = await a.auth.signInWithPassword({ email: USER_A, password: PASSWORD });
    if (ra.error) throw new Error(`Could not sign in: ${ra.error.message}`);
  }, TIMEOUT);

  afterAll(async () => {
    await a.auth.signOut();
  }, TIMEOUT);

  // The loudest attack in the app: one insert here is a banner on every
  // user's screen.
  it("a non-admin cannot broadcast an announcement", { timeout: TIMEOUT }, async () => {
    const { data, error } = await a
      .from("announcements")
      .insert({ message: `${PROBE} — fake broadcast` })
      .select();
    // Refused by the database itself, not just filtered out afterwards.
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
    expect(data ?? []).toHaveLength(0);
  });

  it("a non-admin cannot rewrite an existing announcement", { timeout: TIMEOUT }, async () => {
    const { data: live } = await a.from("announcements").select("id,message").limit(1);
    if (!live || live.length === 0) return; // nothing live to attack
    const target = live[0] as { id: string; message: string };

    const { data: changed } = await a
      .from("announcements")
      .update({ message: "hijacked broadcast" })
      .eq("id", target.id)
      .select();
    expect(changed ?? []).toHaveLength(0);

    const { data: still } = await a
      .from("announcements")
      .select("message")
      .eq("id", target.id)
      .single();
    expect((still as { message: string }).message).toBe(target.message);
  });

  it("a non-admin cannot delete an announcement", { timeout: TIMEOUT }, async () => {
    const { data: live } = await a.from("announcements").select("id").limit(1);
    if (!live || live.length === 0) return;
    const id = (live[0] as { id: string }).id;
    await a.from("announcements").delete().eq("id", id);
    const { data: still } = await a.from("announcements").select("id").eq("id", id);
    expect(still).toHaveLength(1);
  });

  it("a non-admin only ever sees active announcements", { timeout: TIMEOUT }, async () => {
    const { data, error } = await a.from("announcements").select("active");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect((row as { active: boolean }).active).toBe(true);
    }
  });

  it("a dismissal belongs to the person who made it", { timeout: TIMEOUT }, async () => {
    const { data: live } = await a.from("announcements").select("id").limit(1);
    if (!live || live.length === 0) return;
    const id = (live[0] as { id: string }).id;

    const b2 = mkClient();
    const rb = await b2.auth.signInWithPassword({ email: USER_B, password: PASSWORD });
    expect(rb.error).toBeNull();

    await a.from("announcement_dismissals").insert({ announcement_id: id });
    const { data: seenByB } = await b2
      .from("announcement_dismissals")
      .select("announcement_id")
      .eq("announcement_id", id);
    expect(seenByB ?? []).toHaveLength(0);

    await a.from("announcement_dismissals").delete().eq("announcement_id", id);
    await b2.auth.signOut();
  });
});

describe.runIf(!configured)("feedback RLS (skipped)", () => {
  it("skipped — NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not configured", () => {
    expect(true).toBe(true);
  });
});
