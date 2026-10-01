-- Upgrade batch: recurring expenses, house-hack rental share, document storage.

-- An expense can repeat on a schedule (the mortgage trick, for bills):
-- "COA dues $439/month since August" is one row, counted every month.
alter table public.property_expenses
  add column if not exists cadence text not null default 'one_time'
  check (cadence in ('one_time', 'monthly', 'quarterly', 'yearly'));

-- House-hack: the share of a property that is actually a rental (Rochester is
-- a duplex with the owner in one half). Costs count at this share in the
-- cash-flow math; equity and debt stay at 100% — you owe all of the loan.
alter table public.properties
  add column if not exists rental_share numeric(5, 2) not null default 100
  check (rental_share > 0 and rental_share <= 100);

-- Private document storage: ALTAs, leases, statements, filed per property.
-- Object paths are <user_id>/<property_id>/<filename>; policies key off the
-- first folder so each user only ever touches their own files.
insert into storage.buckets (id, name, public)
values ('property-docs', 'property-docs', false)
on conflict (id) do nothing;

create policy "own docs - read" on storage.objects
  for select using (bucket_id = 'property-docs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "own docs - insert" on storage.objects
  for insert with check (bucket_id = 'property-docs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "own docs - delete" on storage.objects
  for delete using (bucket_id = 'property-docs' and auth.uid()::text = (storage.foldername(name))[1]);
