-- Short-term rentals: units declare how they rent, and STR stays live in a
-- bookings ledger (manual or CSV-imported). Booking payouts join rent in the
-- yearly financials; the schedule view reads the same rows.

alter table public.units
  add column if not exists rental_type text not null default 'long_term'
  check (rental_type in ('long_term', 'short_term'));

create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  unit_id      uuid references public.units (id) on delete set null,
  guest_name   text,
  platform     text not null default 'other'
               check (platform in ('airbnb','vrbo','booking','direct','other')),
  check_in     date not null,
  check_out    date not null,
  -- What the platform actually deposits (after their fees). This is the
  -- number the financials count.
  payout       numeric(12,2) not null check (payout >= 0),
  -- Optional context: what the guest paid and what was skimmed on the way.
  gross_amount numeric(12,2) check (gross_amount is null or gross_amount >= 0),
  cleaning_fee numeric(12,2) check (cleaning_fee is null or cleaning_fee >= 0),
  platform_fee numeric(12,2) check (platform_fee is null or platform_fee >= 0),
  status       text not null default 'confirmed'
               check (status in ('confirmed','completed','canceled')),
  -- The platform's confirmation code; the dedupe key for CSV re-imports.
  external_id  text,
  source       text not null default 'manual' check (source in ('manual','csv')),
  note         text,
  created_at   timestamptz not null default now(),
  check (check_out > check_in)
);

alter table public.bookings enable row level security;

create policy "own bookings - select" on public.bookings
  for select using (auth.uid() = user_id);
create policy "own bookings - insert" on public.bookings
  for insert with check (auth.uid() = user_id);
create policy "own bookings - update" on public.bookings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own bookings - delete" on public.bookings
  for delete using (auth.uid() = user_id);

-- Re-importing the same platform export must be a no-op, not a double-count.
create unique index if not exists bookings_dedupe_external
  on public.bookings (user_id, property_id, external_id)
  where external_id is not null;

create index if not exists bookings_property_idx
  on public.bookings (property_id, check_in);
