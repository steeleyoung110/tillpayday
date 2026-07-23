-- Phase 9A: the Net Worth module — its own tables, separate from budgeting.
-- assets / liabilities are the user's living list (archive, don't delete);
-- net_worth_snapshots is the automatic history: at most one row per user per
-- day, upserted whenever any value changes.

create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  category      text not null check (category in
    ('cash', 'savings', 'investment', 'retirement', 'property', 'vehicle', 'other')),
  current_value numeric(14, 2) not null default 0 check (current_value >= 0),
  notes         text,
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.liabilities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null,
  category        text not null check (category in
    ('credit_card', 'auto_loan', 'student_loan', 'mortgage', 'personal_loan', 'other')),
  current_balance numeric(14, 2) not null default 0 check (current_balance >= 0),
  interest_rate   numeric(6, 3),
  notes           text,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.net_worth_snapshots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  snapshot_date     date not null,
  total_assets      numeric(14, 2) not null,
  total_liabilities numeric(14, 2) not null,
  net_worth         numeric(14, 2) not null,
  created_at        timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

-- keep updated_at honest on edits
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists assets_touch on public.assets;
create trigger assets_touch before update on public.assets
  for each row execute function public.touch_updated_at();
drop trigger if exists liabilities_touch on public.liabilities;
create trigger liabilities_touch before update on public.liabilities
  for each row execute function public.touch_updated_at();

-- owner-only RLS, same pattern as everything else
alter table public.assets enable row level security;
alter table public.liabilities enable row level security;
alter table public.net_worth_snapshots enable row level security;

create policy "own assets - select" on public.assets for select using (auth.uid() = user_id);
create policy "own assets - insert" on public.assets for insert with check (auth.uid() = user_id);
create policy "own assets - update" on public.assets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own assets - delete" on public.assets for delete using (auth.uid() = user_id);

create policy "own liabilities - select" on public.liabilities for select using (auth.uid() = user_id);
create policy "own liabilities - insert" on public.liabilities for insert with check (auth.uid() = user_id);
create policy "own liabilities - update" on public.liabilities for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own liabilities - delete" on public.liabilities for delete using (auth.uid() = user_id);

create policy "own snapshots - select" on public.net_worth_snapshots for select using (auth.uid() = user_id);
create policy "own snapshots - insert" on public.net_worth_snapshots for insert with check (auth.uid() = user_id);
create policy "own snapshots - update" on public.net_worth_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own snapshots - delete" on public.net_worth_snapshots for delete using (auth.uid() = user_id);

create index if not exists assets_user_idx on public.assets (user_id);
create index if not exists liabilities_user_idx on public.liabilities (user_id);
create index if not exists snapshots_user_idx on public.net_worth_snapshots (user_id, snapshot_date);

-- 9D bridge: the savings bucket may opt in to appear as a read-only asset.
alter table public.buckets
  add column if not exists include_in_net_worth boolean not null default false;

-- Carry existing v1.0 net-worth items into the module (old table stays put).
insert into public.assets (user_id, name, category, current_value, created_at)
select user_id, name,
  case category
    when 'cash' then 'cash' when 'savings' then 'savings'
    when 'investment' then 'investment' when 'property' then 'property'
    when 'vehicle' then 'vehicle' else 'other' end,
  amount, created_at
from public.net_worth_items where kind = 'asset';

insert into public.liabilities (user_id, name, category, current_balance, interest_rate, created_at)
select user_id, name,
  case category
    when 'credit_card' then 'credit_card' when 'auto_loan' then 'auto_loan'
    when 'student_loan' then 'student_loan' when 'mortgage' then 'mortgage'
    else 'other' end,
  amount, nullif(apy, 0), created_at
from public.net_worth_items where kind = 'liability';
