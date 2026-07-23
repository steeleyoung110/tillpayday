-- Phase 8A: usability groundwork.
-- 1) Pause: buckets stop refilling / expenses stop deducting while paused.
-- 2) Irregular income: a frequency for "it varies" earners, plus a log of
--    income as it actually arrives (income_entries).
-- 3) Windfalls: an income entry can be flagged as a windfall and carry an
--    allocation breakdown (how much goes to which buckets / savings).

alter table public.buckets
  add column if not exists is_paused boolean not null default false;
alter table public.expenses
  add column if not exists is_paused boolean not null default false;

-- Widen the frequency check to allow 'irregular'.
alter table public.income_sources
  drop constraint if exists income_sources_frequency_check;
alter table public.income_sources
  add constraint income_sources_frequency_check
  check (frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular'));

create table if not exists public.income_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount        numeric(12, 2) not null check (amount >= 0),
  received_date date not null,
  note          text,
  is_windfall   boolean not null default false,
  -- Windfall split: [{"bucket_id": "<uuid>"|null, "amount": 123.45}, ...]
  -- null bucket_id = savings. Anything unallocated also lands in savings.
  windfall_allocation jsonb,
  created_at    timestamptz not null default now()
);

alter table public.income_entries enable row level security;

create policy "own income entries - select" on public.income_entries
  for select using (auth.uid() = user_id);
create policy "own income entries - insert" on public.income_entries
  for insert with check (auth.uid() = user_id);
create policy "own income entries - update" on public.income_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own income entries - delete" on public.income_entries
  for delete using (auth.uid() = user_id);

create index if not exists income_entries_user_idx
  on public.income_entries (user_id, received_date);
