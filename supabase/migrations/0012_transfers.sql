-- Move money between buckets, deliberately (YNAB-style). A transfer shifts
-- balance from one envelope to another on a date; null bucket = savings/leftover.
-- Balances are derived by replay, so deleting a transfer un-moves the money.

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_bucket_id uuid references public.buckets (id) on delete cascade,
  to_bucket_id uuid references public.buckets (id) on delete cascade,
  amount numeric not null check (amount > 0),
  transfer_date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  check (from_bucket_id is distinct from to_bucket_id)
);

alter table public.transfers enable row level security;

create policy "transfers_select" on public.transfers
  for select using ((select auth.uid()) = user_id);
create policy "transfers_insert" on public.transfers
  for insert with check ((select auth.uid()) = user_id);
create policy "transfers_update" on public.transfers
  for update using ((select auth.uid()) = user_id);
create policy "transfers_delete" on public.transfers
  for delete using ((select auth.uid()) = user_id);

create index transfers_user_idx on public.transfers (user_id);
create index transfers_from_idx on public.transfers (from_bucket_id);
create index transfers_to_idx on public.transfers (to_bucket_id);
