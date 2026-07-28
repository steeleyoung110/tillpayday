-- Per-user daily caps on the expensive Claude-powered routes. One row per
-- call; the cap is a count of today's rows. Insert-only by design: users
-- can SELECT and INSERT their own rows but never UPDATE or DELETE, so a
-- clever client can raise its own count but never lower it.

create table public.api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  route text not null check (route in ('parse-statement', 'recap')),
  created_at timestamptz not null default now()
);

alter table public.api_usage enable row level security;

create policy "api_usage_select_own" on public.api_usage
  for select using ((select auth.uid()) = user_id);
create policy "api_usage_insert_own" on public.api_usage
  for insert with check ((select auth.uid()) = user_id);
-- No update, no delete. Counts only go up.

create index api_usage_user_route_time_idx
  on public.api_usage (user_id, route, created_at);
