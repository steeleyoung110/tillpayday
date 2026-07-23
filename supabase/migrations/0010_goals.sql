-- Goals: things worth saving toward — "$10k in savings by end of 2027",
-- a 20% down payment, a car next year. Measured against the projection's
-- savings line and shown on the dashboard with an honest outlook.
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  target_amount numeric(14, 2) not null check (target_amount > 0),
  target_date   date not null,
  notes         text,
  achieved_at   timestamptz,
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.goals enable row level security;

create policy "own goals - select" on public.goals for select using (auth.uid() = user_id);
create policy "own goals - insert" on public.goals for insert with check (auth.uid() = user_id);
create policy "own goals - update" on public.goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own goals - delete" on public.goals for delete using (auth.uid() = user_id);

create index if not exists goals_user_idx on public.goals (user_id);
