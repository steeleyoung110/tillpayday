/**
 * Per-user daily caps for the Claude-powered routes. Soft limits (a burst of
 * simultaneous requests can slightly overshoot), which is fine — this guards
 * the API bill against abuse, not against nation-states. Counting rows is
 * insert-only under RLS, so clients can't reset their own tally.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const DAILY_CAPS = {
  "parse-statement": 20,
  recap: 10,
} as const;

export type CappedRoute = keyof typeof DAILY_CAPS;

/**
 * Returns true (and records the call) when the user is under today's cap;
 * false when they've hit it. UTC days — simple and predictable.
 */
export async function underDailyCap(
  supabase: SupabaseClient,
  route: CappedRoute,
): Promise<boolean> {
  const startOfDay = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { count } = await supabase
    .from("api_usage")
    .select("id", { count: "exact", head: true })
    .eq("route", route)
    .gte("created_at", startOfDay);
  if ((count ?? 0) >= DAILY_CAPS[route]) return false;
  await supabase.from("api_usage").insert({ route });
  return true;
}
