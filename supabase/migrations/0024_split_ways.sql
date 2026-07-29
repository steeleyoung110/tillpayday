-- Roommate mode: a bill can be split N ways. The projections, safe-to-spend,
-- and every engine number use YOUR share (amount / split_ways); the UI shows
-- both the full price and your part.

alter table public.expenses
  add column split_ways integer not null default 1
  check (split_ways between 1 and 12);
