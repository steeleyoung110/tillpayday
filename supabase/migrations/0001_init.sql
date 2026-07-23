-- Paycheck Pilot — initial schema
-- Every table is owned by a user (auth.users) and protected by Row-Level Security (RLS),
-- so each account can only ever see and change its own data.

-- ---------------------------------------------------------------------------
-- INCOME SOURCES
-- A paycheck or side-income stream. `anchor_date` is one real pay date we use
-- to project all future pay dates from, based on `frequency`.
-- ---------------------------------------------------------------------------
create table if not exists public.income_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  amount      numeric(12, 2) not null check (amount >= 0),
  frequency   text not null check (frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  kind        text not null default 'paycheck' check (kind in ('paycheck', 'side')),
  anchor_date date not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- BUCKETS
-- Named envelopes that each paycheck is divided into. Allocation is either a
-- fixed dollar amount or a percent of the paycheck. Exactly one bucket per user
-- may be flagged `is_savings`; it soaks up any unallocated leftover.
-- ---------------------------------------------------------------------------
create table if not exists public.buckets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null,
  allocation_type  text not null check (allocation_type in ('fixed', 'percent')),
  allocation_value numeric(12, 2) not null default 0 check (allocation_value >= 0),
  is_savings       boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

-- Enforce "at most one savings bucket per user".
create unique index if not exists buckets_one_savings_per_user
  on public.buckets (user_id)
  where is_savings;

-- ---------------------------------------------------------------------------
-- EXPENSES
-- A planned expense that draws down a bucket on its due date and then repeats
-- on the given cadence. `bucket_id` is nullable: an unassigned expense draws
-- from the savings bucket.
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  amount     numeric(12, 2) not null check (amount >= 0),
  bucket_id  uuid references public.buckets (id) on delete set null,
  due_date   date not null,
  cadence    text not null check (cadence in ('one_time', 'monthly', 'quarterly', 'yearly')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- WHAT-IF ITEMS
-- A purchase the user is considering. While `considering`, the app shows its
-- impact on the projection. It can later be marked `bought` or `skipped`;
-- skipped items sum into the "money you saved by saying no" total.
-- ---------------------------------------------------------------------------
create table if not exists public.whatif_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  amount      numeric(12, 2) not null check (amount >= 0),
  target_date date not null,
  bucket_id   uuid references public.buckets (id) on delete set null,
  status      text not null default 'considering' check (status in ('considering', 'bought', 'skipped')),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY
-- Turn RLS on for every table, then add policies so a request may only touch
-- rows whose user_id matches the currently authenticated user (auth.uid()).
-- ---------------------------------------------------------------------------
alter table public.income_sources enable row level security;
alter table public.buckets        enable row level security;
alter table public.expenses       enable row level security;
alter table public.whatif_items   enable row level security;

-- income_sources
create policy "own income - select" on public.income_sources
  for select using (auth.uid() = user_id);
create policy "own income - insert" on public.income_sources
  for insert with check (auth.uid() = user_id);
create policy "own income - update" on public.income_sources
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own income - delete" on public.income_sources
  for delete using (auth.uid() = user_id);

-- buckets
create policy "own buckets - select" on public.buckets
  for select using (auth.uid() = user_id);
create policy "own buckets - insert" on public.buckets
  for insert with check (auth.uid() = user_id);
create policy "own buckets - update" on public.buckets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own buckets - delete" on public.buckets
  for delete using (auth.uid() = user_id);

-- expenses
create policy "own expenses - select" on public.expenses
  for select using (auth.uid() = user_id);
create policy "own expenses - insert" on public.expenses
  for insert with check (auth.uid() = user_id);
create policy "own expenses - update" on public.expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own expenses - delete" on public.expenses
  for delete using (auth.uid() = user_id);

-- whatif_items
create policy "own whatif - select" on public.whatif_items
  for select using (auth.uid() = user_id);
create policy "own whatif - insert" on public.whatif_items
  for insert with check (auth.uid() = user_id);
create policy "own whatif - update" on public.whatif_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own whatif - delete" on public.whatif_items
  for delete using (auth.uid() = user_id);

-- Helpful indexes for per-user lookups.
create index if not exists income_sources_user_idx on public.income_sources (user_id);
create index if not exists buckets_user_idx        on public.buckets (user_id);
create index if not exists expenses_user_idx       on public.expenses (user_id);
create index if not exists whatif_items_user_idx   on public.whatif_items (user_id);
