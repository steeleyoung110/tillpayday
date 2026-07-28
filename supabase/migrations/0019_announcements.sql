-- Admin announcements: a broadcast banner every member sees until they
-- dismiss it. Admins write/manage; users read active ones + dismiss.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 1 and 500),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create policy "announcements_select" on public.announcements
  for select using (active or (select public.is_admin()));
create policy "announcements_insert_admin" on public.announcements
  for insert with check ((select public.is_admin()));
create policy "announcements_update_admin" on public.announcements
  for update using ((select public.is_admin()));
create policy "announcements_delete_admin" on public.announcements
  for delete using ((select public.is_admin()));

create table public.announcement_dismissals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table public.announcement_dismissals enable row level security;

create policy "dismissals_select_own" on public.announcement_dismissals
  for select using ((select auth.uid()) = user_id);
create policy "dismissals_insert_own" on public.announcement_dismissals
  for insert with check ((select auth.uid()) = user_id);
