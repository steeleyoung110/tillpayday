-- Admin portal: who is an admin, a suggestions inbox anyone can write to,
-- and a stats function that reads the behind-the-scenes numbers (auth.users,
-- login audit log, per-table row counts) for admins only.

-- Admins: membership managed via SQL only (no insert/update/delete policies).
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- A signed-in user may check THEIR OWN membership (powers the UI gate).
create policy "admins_select_self" on public.admins
  for select using ((select auth.uid()) = user_id);

-- Helper: is the caller an admin? SECURITY DEFINER so RLS policies on other
-- tables can use it without recursion. search_path pinned.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Suggestions: any signed-in user can file one and see their own; admins see,
-- update (status), and delete all of them.
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text,
  message text not null check (char_length(message) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at timestamptz not null default now()
);

alter table public.suggestions enable row level security;

create policy "suggestions_insert_own" on public.suggestions
  for insert with check ((select auth.uid()) = user_id);
create policy "suggestions_select" on public.suggestions
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "suggestions_update_admin" on public.suggestions
  for update using ((select public.is_admin()));
create policy "suggestions_delete_admin" on public.suggestions
  for delete using ((select public.is_admin()));

create index suggestions_user_idx on public.suggestions (user_id);
create index suggestions_status_idx on public.suggestions (status);

-- The dashboard numbers. SECURITY DEFINER (reads auth.users and the auth
-- audit log); returns null for non-admins — no error, no information.
create or replace function public.admin_stats()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'members', (select count(*) from auth.users),
    'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'logins_total', (select count(*) from auth.audit_log_entries where payload->>'action' = 'login'),
    'logins_7d', (select count(*) from auth.audit_log_entries
                  where payload->>'action' = 'login' and created_at > now() - interval '7 days'),
    'signups_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as day, count(*) as c
        from auth.users
        where created_at > now() - interval '30 days'
        group by 1
      ) t
    ),
    'recent_members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'email', email,
        'created_at', created_at,
        'last_sign_in_at', last_sign_in_at) order by created_at desc), '[]'::jsonb)
      from (
        select email, created_at, last_sign_in_at
        from auth.users
        order by created_at desc
        limit 20
      ) u
    ),
    'tables', jsonb_build_object(
      'income_sources', (select count(*) from public.income_sources),
      'buckets', (select count(*) from public.buckets),
      'expenses', (select count(*) from public.expenses),
      'expenses_7d', (select count(*) from public.expenses where created_at > now() - interval '7 days'),
      'transfers', (select count(*) from public.transfers),
      'income_entries', (select count(*) from public.income_entries),
      'goals', (select count(*) from public.goals),
      'whatif_items', (select count(*) from public.whatif_items),
      'assets', (select count(*) from public.assets),
      'liabilities', (select count(*) from public.liabilities),
      'push_subscriptions', (select count(*) from public.push_subscriptions),
      'calendar_tokens', (select count(*) from public.calendar_tokens),
      'shared_access', (select count(*) from public.shared_access),
      'suggestions', (select count(*) from public.suggestions),
      'suggestions_new', (select count(*) from public.suggestions where status = 'new')
    )
  ) end;
$$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

-- Seed the owner as the first admin.
insert into public.admins (user_id)
select id from auth.users where email = 'steele.young110@gmail.com'
on conflict do nothing;
