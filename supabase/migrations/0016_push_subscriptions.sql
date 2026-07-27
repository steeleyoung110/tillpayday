-- Web-push subscriptions: one row per browser/device that opted into
-- notifications. Owner-only RLS, same pattern as everything else.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select" on public.push_subscriptions
  for select using ((select auth.uid()) = user_id);
create policy "push_subscriptions_insert" on public.push_subscriptions
  for insert with check ((select auth.uid()) = user_id);
create policy "push_subscriptions_update" on public.push_subscriptions
  for update using ((select auth.uid()) = user_id);
create policy "push_subscriptions_delete" on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
