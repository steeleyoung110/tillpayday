/**
 * Row-level-security integration test — proves one user can never read,
 * modify, or forge another user's rows, on every table in the app.
 *
 * Runs against the real Supabase project using the public anon key (the same
 * credentials the browser gets), signed in as two pre-seeded, pre-confirmed
 * test users. If .env.local is missing the suite skips instead of failing, so
 * unit tests still run anywhere.
 *
 * Test users are seeded by supabase/migrations (see repo docs): they exist only
 * for this suite and own no real data.
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

/**
 * One minimal valid row per table; user_id is filled in by `default auth.uid()`.
 * `mutate` is a valid column change used to prove cross-user updates bounce.
 */
const FIXTURES: {
  table: string;
  row: Record<string, unknown>;
  mutate: Record<string, unknown>;
}[] = [
  {
    table: "income_sources",
    row: { name: "RLS probe", amount: 1, frequency: "monthly", kind: "paycheck", anchor_date: "2026-01-01" },
    mutate: { name: "hijacked" },
  },
  {
    table: "buckets",
    row: { name: "RLS probe", allocation_type: "fixed", allocation_value: 1 },
    mutate: { name: "hijacked" },
  },
  {
    table: "expenses",
    row: { name: "RLS probe", amount: 1, due_date: "2026-01-01", cadence: "one_time" },
    mutate: { name: "hijacked" },
  },
  {
    table: "whatif_items",
    row: { name: "RLS probe", amount: 1, target_date: "2026-01-01" },
    mutate: { name: "hijacked" },
  },
  {
    table: "net_worth_items",
    row: { name: "RLS probe", kind: "asset", category: "cash", amount: 1 },
    mutate: { name: "hijacked" },
  },
  {
    table: "celebrated_paydays",
    row: { payday: "2020-01-02" },
    mutate: { payday: "2021-12-31" },
  },
  {
    table: "income_entries",
    row: { amount: 1, received_date: "2020-01-03" },
    mutate: { received_date: "2021-06-06" },
  },
  {
    table: "assets",
    row: { name: "RLS probe", category: "cash", current_value: 1 },
    mutate: { name: "hijacked" },
  },
  {
    table: "liabilities",
    row: { name: "RLS probe", category: "credit_card", current_balance: 1 },
    mutate: { name: "hijacked" },
  },
  {
    table: "net_worth_snapshots",
    row: { snapshot_date: "2020-01-06", total_assets: 1, total_liabilities: 0, net_worth: 1 },
    mutate: { snapshot_date: "2020-01-07" },
  },
];

const TIMEOUT = 30_000;

describe.runIf(configured)("row-level security — cross-user isolation", () => {
  let a: SupabaseClient;
  let b: SupabaseClient;
  let anon: SupabaseClient;
  let aUserId: string;
  /** id of the row user A created in each table. */
  const createdIds = new Map<string, string>();

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
        `Could not sign in RLS test users (${ra.error?.message ?? rb.error?.message}). ` +
          "Seed them first — see supabase test-user setup.",
      );
    }
    aUserId = ra.data.user!.id;

    // User A creates one probe row per table.
    for (const f of FIXTURES) {
      const { data, error } = await a.from(f.table).insert(f.row).select("id").single();
      if (error) throw new Error(`insert into ${f.table} failed: ${error.message}`);
      createdIds.set(f.table, (data as { id: string }).id);
    }
  }, TIMEOUT);

  afterAll(async () => {
    for (const f of FIXTURES) {
      const id = createdIds.get(f.table);
      if (id) await a.from(f.table).delete().eq("id", id);
    }
    await Promise.all([a.auth.signOut(), b.auth.signOut()]);
  }, TIMEOUT);

  for (const f of FIXTURES) {
    describe(f.table, () => {
      it("owner can read their own row", { timeout: TIMEOUT }, async () => {
        const { data, error } = await a.from(f.table).select("id");
        expect(error).toBeNull();
        expect(data!.map((r) => r.id)).toContain(createdIds.get(f.table));
      });

      it("another user cannot see the row", { timeout: TIMEOUT }, async () => {
        const { data, error } = await b.from(f.table).select("id");
        expect(error).toBeNull();
        expect(data!.map((r) => r.id)).not.toContain(createdIds.get(f.table));
      });

      it("another user cannot update the row", { timeout: TIMEOUT }, async () => {
        const field = Object.keys(f.mutate)[0];
        const { data } = await b
          .from(f.table)
          .update(f.mutate)
          .eq("id", createdIds.get(f.table)!)
          .select();
        expect(data ?? []).toHaveLength(0); // RLS: zero rows matched

        const { data: still } = await a
          .from(f.table)
          .select(field)
          .eq("id", createdIds.get(f.table)!)
          .single();
        expect((still as Record<string, unknown>)[field]).toBe(f.row[field]);
      });

      it("another user cannot delete the row", { timeout: TIMEOUT }, async () => {
        await b.from(f.table).delete().eq("id", createdIds.get(f.table)!);
        const { data: still } = await a
          .from(f.table)
          .select("id")
          .eq("id", createdIds.get(f.table)!);
        expect(still).toHaveLength(1);
      });

      it("a user cannot forge a row under someone else's user_id", { timeout: TIMEOUT }, async () => {
        const { error } = await b
          .from(f.table)
          .insert({ ...f.row, user_id: aUserId });
        expect(error).not.toBeNull(); // violates the with-check policy
      });

      it("signed-out (anon) clients see nothing", { timeout: TIMEOUT }, async () => {
        const { data } = await anon.from(f.table).select("id");
        expect(data ?? []).toHaveLength(0);
      });
    });
  }

  describe("net_worth_snapshots — at most one per user per day", () => {
    const day = "2020-02-02";

    afterAll(async () => {
      await a.from("net_worth_snapshots").delete().eq("snapshot_date", day);
    }, TIMEOUT);

    it("a second write on the same day updates in place", { timeout: TIMEOUT }, async () => {
      await a.from("net_worth_snapshots").upsert(
        { snapshot_date: day, total_assets: 100, total_liabilities: 40, net_worth: 60 },
        { onConflict: "user_id,snapshot_date" },
      );
      await a.from("net_worth_snapshots").upsert(
        { snapshot_date: day, total_assets: 250, total_liabilities: 50, net_worth: 200 },
        { onConflict: "user_id,snapshot_date" },
      );
      const { data } = await a
        .from("net_worth_snapshots")
        .select("net_worth")
        .eq("snapshot_date", day);
      expect(data).toHaveLength(1); // one row per day, updated in place
      expect(Number(data![0].net_worth)).toBe(200);
    });
  });
});

describe.runIf(!configured)("row-level security (skipped)", () => {
  it("skipped — NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not configured", () => {
    expect(configured).toBe(false);
  });
});
