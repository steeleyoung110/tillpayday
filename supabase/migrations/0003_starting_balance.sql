-- v1.1 projection engine: the simulation starts today, mid-cycle, from a
-- user-provided starting savings balance stored on the savings bucket.
alter table public.buckets
  add column if not exists starting_balance numeric(12, 2) not null default 0
  check (starting_balance >= 0);
