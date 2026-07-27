-- Household sharing, read-only v1: an owner grants a viewer (by email)
-- SELECT access to their budget. Viewers can look, never touch — no insert,
-- update, or delete policies are extended, only SELECT.

create table public.shared_access (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_email text not null default '',
  viewer_email text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, viewer_email),
  check (viewer_email <> owner_email)
);

alter table public.shared_access enable row level security;

-- Owners manage their grants; viewers can see grants aimed at them (that's
-- how the UI discovers which budgets are shared with you).
create policy "shared_access_select" on public.shared_access
  for select using (
    (select auth.uid()) = owner_id
    or lower(viewer_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
create policy "shared_access_insert" on public.shared_access
  for insert with check ((select auth.uid()) = owner_id);
create policy "shared_access_delete" on public.shared_access
  for delete using ((select auth.uid()) = owner_id);

create index shared_access_owner_idx on public.shared_access (owner_id);
create index shared_access_viewer_idx on public.shared_access (lower(viewer_email));

-- Additive SELECT-only policies on every table the dashboard reads: a viewer
-- with a grant may read the owner's rows. Write policies are untouched.
do $$
declare
  t text;
begin
  foreach t in array array[
    'income_sources', 'buckets', 'expenses', 'whatif_items',
    'income_entries', 'goals', 'transfers', 'assets', 'liabilities',
    'net_worth_snapshots', 'celebrated_paydays'
  ] loop
    execute format($f$
      create policy "%s_shared_select" on public.%I
        for select using (
          exists (
            select 1 from public.shared_access sa
            where sa.owner_id = %I.user_id
              and lower(sa.viewer_email) =
                lower(coalesce((select auth.jwt() ->> 'email'), ''))
          )
        )
    $f$, t, t, t);
  end loop;
end $$;
