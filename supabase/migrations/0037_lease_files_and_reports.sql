-- Lease paperwork and short-term rental reports.
--
-- property_files indexes uploads that live in the private `property-docs`
-- bucket (under <user>/<property>/leases/… or …/reports/…): a signed lease
-- copy is tied to its lease; a rental report is tied to the month or quarter
-- of completed stays it covers.
--
-- Short-term properties get a reporting rhythm: monthly or quarterly, from a
-- start date, with a number of grace days after each period before the
-- upload counts as past due.

create table if not exists public.property_files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id   uuid not null references public.properties (id) on delete cascade,
  kind          text not null check (kind in ('lease', 'rental_report')),
  lease_id      uuid references public.leases (id) on delete set null,
  period_start  date,
  storage_path  text not null unique check (char_length(storage_path) <= 600),
  file_name     text not null check (char_length(file_name) between 1 and 200),
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  created_at    timestamptz not null default now(),
  check (kind <> 'rental_report' or period_start is not null)
);

alter table public.properties
  add column if not exists report_cadence text check (report_cadence in ('monthly', 'quarterly')),
  add column if not exists report_start date,
  add column if not exists report_due_days integer check (report_due_days between 0 and 120);

alter table public.property_files enable row level security;

create policy "own property_files - select" on public.property_files for select using (auth.uid() = user_id);
create policy "own property_files - insert" on public.property_files for insert with check (auth.uid() = user_id);
create policy "own property_files - update" on public.property_files for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own property_files - delete" on public.property_files for delete using (auth.uid() = user_id);

create index if not exists property_files_property_idx on public.property_files (property_id, kind);
create index if not exists property_files_lease_idx    on public.property_files (lease_id);
