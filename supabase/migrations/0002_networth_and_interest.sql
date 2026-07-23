-- Net worth & interest.
-- 1) `net_worth_items`: the user's assets and liabilities, entered once and kept
--    current, so the app can show what they're worth and seed the projection's
--    starting savings from their liquid assets.
-- 2) `buckets.apy`: the annual percentage yield of the real account behind a
--    bucket (e.g. a 3% high-yield savings account), compounded by the engine.

create table if not exists public.net_worth_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('asset', 'liability')),
  category   text not null check (category in (
    -- assets
    'cash', 'savings', 'investment', 'property', 'vehicle', 'other_asset',
    -- liabilities
    'credit_card', 'student_loan', 'auto_loan', 'mortgage', 'other_debt'
  )),
  amount     numeric(14, 2) not null check (amount >= 0),
  -- Annual rate (%). For assets: growth/yield. For liabilities: interest charged.
  apy        numeric(6, 3) not null default 0 check (apy >= 0),
  created_at timestamptz not null default now()
);

alter table public.net_worth_items enable row level security;

create policy "own networth - select" on public.net_worth_items
  for select using (auth.uid() = user_id);
create policy "own networth - insert" on public.net_worth_items
  for insert with check (auth.uid() = user_id);
create policy "own networth - update" on public.net_worth_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own networth - delete" on public.net_worth_items
  for delete using (auth.uid() = user_id);

create index if not exists net_worth_items_user_idx on public.net_worth_items (user_id);

-- APY of the account backing each bucket (0 = no interest).
alter table public.buckets
  add column if not exists apy numeric(6, 3) not null default 0 check (apy >= 0);
