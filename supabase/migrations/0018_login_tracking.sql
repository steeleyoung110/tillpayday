-- Login tracking: Supabase's auth audit log table is empty on this project,
-- so we count logins ourselves. Every sign-in creates an auth.sessions row;
-- a trigger mirrors that into public.login_events. Counting starts at this
-- migration — there is no historical backfill (the data doesn't exist).

create table public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

-- RLS on, deliberately no policies: nothing reads this via the API — only
-- the admin_stats() security-definer function.
alter table public.login_events enable row level security;

create index login_events_created_idx on public.login_events (created_at);

create or replace function public.log_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.login_events (user_id) values (new.user_id);
  return new;
end;
$$;

create trigger on_auth_session_created
  after insert on auth.sessions
  for each row execute function public.log_login();

-- admin_stats v2: logins from login_events, plus live signed-in sessions.
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
    'sessions_active', (select count(*) from auth.sessions
                        where coalesce(refreshed_at, created_at) > now() - interval '1 hour'),
    'logins_total', (select count(*) from public.login_events),
    'logins_7d', (select count(*) from public.login_events where created_at > now() - interval '7 days'),
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
