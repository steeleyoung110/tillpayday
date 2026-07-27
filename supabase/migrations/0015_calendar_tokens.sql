-- Calendar feed (ICS): a per-user unguessable token authorizes an
-- unauthenticated calendar app to read ONLY what a calendar needs — bill
-- names/amounts/dates and payday schedule — via a security-definer function.

create table public.calendar_tokens (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.calendar_tokens enable row level security;

create policy "calendar_tokens_select" on public.calendar_tokens
  for select using ((select auth.uid()) = user_id);
create policy "calendar_tokens_insert" on public.calendar_tokens
  for insert with check ((select auth.uid()) = user_id);
create policy "calendar_tokens_update" on public.calendar_tokens
  for update using ((select auth.uid()) = user_id);
create policy "calendar_tokens_delete" on public.calendar_tokens
  for delete using ((select auth.uid()) = user_id);

-- The feed reader: token in, calendar-relevant fields out. SECURITY DEFINER
-- bypasses RLS deliberately and ONLY exposes these fields; an invalid token
-- returns empty arrays. search_path pinned per the advisor rules.
create or replace function public.calendar_feed(feed_token uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'income', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'name', i.name, 'amount', i.amount, 'frequency', i.frequency,
         'kind', i.kind, 'anchor_date', i.anchor_date))
       from public.income_sources i
       join public.calendar_tokens t on t.user_id = i.user_id
       where t.token = feed_token),
      '[]'::jsonb),
    'expenses', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'name', e.name, 'amount', e.amount, 'due_date', e.due_date,
         'cadence', e.cadence))
       from public.expenses e
       join public.calendar_tokens t on t.user_id = e.user_id
       where t.token = feed_token and not e.is_paused),
      '[]'::jsonb)
  );
$$;

revoke all on function public.calendar_feed(uuid) from public;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
