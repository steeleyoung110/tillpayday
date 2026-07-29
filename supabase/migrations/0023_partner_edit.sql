-- Partner mode v1: an owner may upgrade a viewer grant to can_edit, which
-- lets that partner LOG SPENDING into the owner's budget (insert expenses,
-- delete only rows they created themselves — that's the undo path). Reads
-- were already granted by 0014; every other table stays owner-write-only.

alter table public.shared_access
  add column can_edit boolean not null default false;

-- Attribution: who actually added this expense (defaults to the author).
alter table public.expenses
  add column created_by uuid default auth.uid();

-- Owners can flip can_edit on their own grants.
create policy "shared_access_update" on public.shared_access
  for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- A can_edit partner may insert expenses into the owner's budget…
create policy "expenses_partner_insert" on public.expenses
  for insert with check (
    exists (
      select 1 from public.shared_access sa
      where sa.owner_id = expenses.user_id
        and sa.can_edit
        and lower(sa.viewer_email) =
          lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  );

-- …and remove only the rows they themselves created (their undo).
create policy "expenses_partner_delete" on public.expenses
  for delete using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.shared_access sa
      where sa.owner_id = expenses.user_id
        and sa.can_edit
        and lower(sa.viewer_email) =
          lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  );
