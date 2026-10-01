/**
 * Row-level-security integration test — proves one user can never read,
 * modify, or forge another user's rows, on every property table in the app.
 *
 * Runs against the real Supabase project using the public anon key (the same
 * credentials the browser gets), signed in as two pre-seeded, pre-confirmed
 * test users. If .env.local is missing the suite skips instead of failing, so
 * unit tests still run anywhere.
 *
 * Test users are seeded once (see repo docs): they exist only for this suite
 * and own no real data.
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
    // no .env.local — suite will skip
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
 * One minimal valid row per table, built in dependency order so foreign keys
 * can reference the rows created before them. `mutate` is a valid column
 * change used to prove cross-user updates bounce; `original` is the value the
 * mutated column must still hold afterwards.
 */
const FIXTURES: {
  table: string;
  row: (ids: Map<string, string>) => Record<string, unknown>;
  mutate: Record<string, unknown>;
  original: unknown;
}[] = [
  {
    table: "properties",
    row: () => ({ name: "RLS probe", address: "nowhere" }),
    mutate: { name: "hijacked" },
    original: "RLS probe",
  },
  {
    table: "units",
    row: (ids) => ({ property_id: ids.get("properties"), label: "RLS probe" }),
    mutate: { label: "hijacked" },
    original: "RLS probe",
  },
  {
    table: "tenants",
    row: () => ({ full_name: "RLS probe" }),
    mutate: { full_name: "hijacked" },
    original: "RLS probe",
  },
  {
    table: "leases",
    row: (ids) => ({
      unit_id: ids.get("units"),
      tenant_id: ids.get("tenants"),
      rent_amount: 1,
      start_date: "2020-01-01",
    }),
    mutate: { start_date: "2021-02-02" },
    original: "2020-01-01",
  },
  {
    table: "rent_payments",
    row: (ids) => ({
      property_id: ids.get("properties"),
      lease_id: ids.get("leases"),
      amount: 1,
      paid_date: "2020-01-01",
    }),
    mutate: { paid_date: "2021-02-02" },
    original: "2020-01-01",
  },
  {
    table: "property_expenses",
    row: (ids) => ({
      property_id: ids.get("properties"),
      amount: 1,
      expense_date: "2020-01-01",
      category: "other",
    }),
    mutate: { expense_date: "2021-02-02" },
    original: "2020-01-01",
  },
  {
    table: "mortgages",
    row: (ids) => ({ property_id: ids.get("properties"), lender: "RLS probe" }),
    mutate: { lender: "hijacked" },
    original: "RLS probe",
  },
  {
    table: "mortgage_payments",
    row: (ids) => ({
      mortgage_id: ids.get("mortgages"),
      property_id: ids.get("properties"),
      amount: 1,
      paid_date: "2020-01-01",
    }),
    mutate: { paid_date: "2021-02-02" },
    original: "2020-01-01",
  },
  {
    table: "bookings",
    row: (ids) => ({
      property_id: ids.get("properties"),
      check_in: "2020-01-01",
      check_out: "2020-01-03",
      payout: 1,
    }),
    mutate: { check_in: "2021-01-01" },
    original: "2020-01-01",
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

    // User A creates one probe row per table, in dependency order.
    for (const f of FIXTURES) {
      const { data, error } = await a
        .from(f.table)
        .insert(f.row(createdIds))
        .select("id")
        .single();
      if (error) throw new Error(`insert into ${f.table} failed: ${error.message}`);
      createdIds.set(f.table, (data as { id: string }).id);
    }
  }, TIMEOUT);

  afterAll(async () => {
    // Deleting the property cascades everything else; the rest are no-ops.
    for (const f of [...FIXTURES].reverse()) {
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
        expect((still as Record<string, unknown>)[field]).toBe(f.original);
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
          .insert({ ...f.row(createdIds), user_id: aUserId });
        expect(error).not.toBeNull(); // violates the with-check policy
      });

      it("signed-out (anon) clients see nothing", { timeout: TIMEOUT }, async () => {
        const { data } = await anon.from(f.table).select("id");
        expect(data ?? []).toHaveLength(0);
      });
    });
  }
});
