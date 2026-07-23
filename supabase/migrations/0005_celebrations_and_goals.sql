-- Payday celebrations: shown exactly once per payday. A row here means that
-- payday's celebration has been seen and must not be shown again.
create table if not exists public.celebrated_paydays (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payday     date not null,
  created_at timestamptz not null default now(),
  unique (user_id, payday)
);

alter table public.celebrated_paydays enable row level security;

create policy "own celebrations - select" on public.celebrated_paydays
  for select using (auth.uid() = user_id);
create policy "own celebrations - insert" on public.celebrated_paydays
  for insert with check (auth.uid() = user_id);
create policy "own celebrations - update" on public.celebrated_paydays
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own celebrations - delete" on public.celebrated_paydays
  for delete using (auth.uid() = user_id);

create index if not exists celebrated_paydays_user_idx on public.celebrated_paydays (user_id);

-- Savings goal: a target amount on the savings bucket; the celebration screen
-- shows progress toward it.
alter table public.buckets
  add column if not exists goal_amount numeric(14, 2) not null default 0
  check (goal_amount >= 0);
