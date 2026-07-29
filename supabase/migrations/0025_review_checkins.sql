-- Weekly review ritual: one row per completed weekly check-in. The streak is
-- computed from consecutive week_start values.

create table public.review_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.review_checkins enable row level security;

create policy "review_checkins_select" on public.review_checkins
  for select using ((select auth.uid()) = user_id);
create policy "review_checkins_insert" on public.review_checkins
  for insert with check ((select auth.uid()) = user_id);
create policy "review_checkins_delete" on public.review_checkins
  for delete using ((select auth.uid()) = user_id);

create index review_checkins_user_idx on public.review_checkins (user_id, week_start desc);
