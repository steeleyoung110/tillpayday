/**
 * Sample budget for the public /demo page: "Sam", a fabricated coworker with
 * a realistic paycheck-to-paycheck picture. Dates are generated relative to
 * today so the engine always has a live cycle to chew on. Nothing here
 * touches the database.
 */
import { addDays, parseISO, toISO } from "@/lib/engine";
import type { DashboardData } from "@/lib/rows";

const ts = "2026-01-01T00:00:00Z";

export function buildDemoData(todayISO: string): DashboardData {
  const d = (offset: number) => toISO(addDays(parseISO(todayISO), offset));

  return {
    income: [
      {
        id: "demo-job",
        name: "Warehouse job",
        amount: 1400,
        frequency: "biweekly",
        kind: "paycheck",
        anchor_date: d(-7), // last payday a week ago — mid-cycle right now
        created_at: ts,
      },
    ],
    buckets: [
      {
        id: "demo-rent", name: "Rent", allocation_type: "fixed", allocation_value: 600,
        is_savings: false, is_flexible: false, rolls_over: false, is_paused: false,
        include_in_net_worth: false, sort_order: 0, apy: 0, starting_balance: 0, goal_amount: 0, created_at: ts,
      },
      {
        id: "demo-food", name: "Food", allocation_type: "percent", allocation_value: 15,
        is_savings: false, is_flexible: false, rolls_over: false, is_paused: false,
        include_in_net_worth: false, sort_order: 1, apy: 0, starting_balance: 0, goal_amount: 0, created_at: ts,
      },
      {
        id: "demo-fun", name: "Fun money", allocation_type: "percent", allocation_value: 10,
        is_savings: false, is_flexible: true, rolls_over: false, is_paused: false,
        include_in_net_worth: false, sort_order: 2, apy: 0, starting_balance: 0, goal_amount: 0, created_at: ts,
      },
      {
        id: "demo-concert", name: "Concert fund", allocation_type: "fixed", allocation_value: 50,
        is_savings: false, is_flexible: false, rolls_over: true, is_paused: false,
        include_in_net_worth: false, sort_order: 3, apy: 0, starting_balance: 0, goal_amount: 0, created_at: ts,
      },
      {
        id: "demo-save", name: "Savings", allocation_type: "fixed", allocation_value: 0,
        is_savings: true, is_flexible: false, rolls_over: false, is_paused: false,
        include_in_net_worth: false, sort_order: 4, apy: 3, starting_balance: 900, goal_amount: 5000, created_at: ts,
      },
    ],
    expenses: [
      // Recurring bills are anchored in the past so the engine has months of
      // history to compute runway and past-cycle recaps from (occurrences
      // never predate the first due_date).
      { id: "demo-e1", name: "Rent", amount: 600, bucket_id: "demo-rent", due_date: d(-65), cadence: "monthly", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      { id: "demo-e2", name: "Spotify", amount: 11.99, bucket_id: "demo-fun", due_date: d(-63), cadence: "monthly", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      { id: "demo-e6", name: "Car insurance", amount: 210, bucket_id: "demo-rent", due_date: d(-82), cadence: "quarterly", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      // Past one-time spends give the history texture...
      { id: "demo-e8", name: "Groceries", amount: 91.3, bucket_id: "demo-food", due_date: d(-25), cadence: "one_time", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      { id: "demo-e9", name: "Groceries", amount: 74.2, bucket_id: "demo-food", due_date: d(-18), cadence: "one_time", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      { id: "demo-e10", name: "Takeout", amount: 28, bucket_id: "demo-food", due_date: d(-16), cadence: "one_time", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      { id: "demo-e11", name: "Bar night", amount: 39, bucket_id: "demo-fun", due_date: d(-30), cadence: "one_time", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      // ...and this cycle has its own spending, mid-flight.
      { id: "demo-e3", name: "Groceries", amount: 86.4, bucket_id: "demo-food", due_date: d(-4), cadence: "one_time", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      { id: "demo-e4", name: "McDonald's", amount: 12.5, bucket_id: "demo-food", due_date: d(-1), cadence: "one_time", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      { id: "demo-e5", name: "Bar night", amount: 47, bucket_id: "demo-fun", due_date: d(-2), cadence: "one_time", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
      { id: "demo-e7", name: "Concert tickets", amount: 150, bucket_id: "demo-concert", due_date: d(20), cadence: "one_time", is_paused: false, renewal_date: null, created_by: null, split_ways: 1, autopay: null, funded_by_income_id: null, created_at: ts },
    ],
    whatIf: [
      /**
       * One purchase mid-cooling-off, because the 48-hour pause is the most
       * distinctive thing this app does and a demo that doesn't show it
       * undersells the whole idea. Started 20 hours ago, so a visitor sees a
       * live countdown rather than a finished timer.
       */
      {
        id: "demo-w1",
        name: "Noise-cancelling headphones",
        amount: 249,
        target_date: toISO(addDays(parseISO(todayISO), 6)),
        bucket_id: "demo-fun",
        status: "considering",
        decided_at: null,
        cooling_off_started_at: new Date(
          Date.parse(`${todayISO}T00:00:00Z`) - 20 * 3600_000,
        ).toISOString(),
        created_at: ts,
      },
    ],
    netWorth: [],
    celebrated: [],
    incomeEntries: [],
    goals: [
      {
        id: "demo-g1", name: "Emergency cushion", target_amount: 5000,
        target_date: toISO(addDays(parseISO(todayISO), 540)),
        notes: null, achieved_at: null, is_archived: false, created_at: ts,
      },
    ],
    transfers: [],
  };
}
