-- Property management overhaul — core schema.
-- Properties own units; units carry leases with tenants; money is logged as
-- rent payments (in), property expenses (out), and mortgage payments (debt
-- service, with an optional principal/interest/escrow split so yearly finances
-- can be honest about what is expense and what is equity).
--
-- Every table: user-owned, RLS on, own-rows-only policies. The existing
-- budgeting tables are left untouched.

-- ---------------------------------------------------------------------------
-- PROPERTIES
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null,
  address        text not null default '',
  property_type  text not null default 'single_family'
                 check (property_type in ('single_family','duplex','multi_family','condo','townhome','commercial','land','other')),
  purchase_date  date,
  purchase_price numeric(14,2) check (purchase_price is null or purchase_price >= 0),
  current_value  numeric(14,2) check (current_value is null or current_value >= 0),
  notes          text,
  is_archived    boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- UNITS — one per rentable space. A single-family home has exactly one.
-- ---------------------------------------------------------------------------
create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  label       text not null default 'Main',
  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text,
  phone       text,
  notes       text,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- LEASES — a tenant in a unit at a rent. end_date null = month-to-month.
-- ---------------------------------------------------------------------------
create table if not exists public.leases (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  unit_id        uuid not null references public.units (id) on delete cascade,
  tenant_id      uuid references public.tenants (id) on delete set null,
  rent_amount    numeric(12,2) not null check (rent_amount >= 0),
  due_day        integer not null default 1 check (due_day between 1 and 28),
  start_date     date not null,
  end_date       date,
  deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  status         text not null default 'active' check (status in ('active','ended')),
  notes          text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RENT PAYMENTS — money that actually arrived. property_id is denormalized so
-- per-property finance queries never need a three-table join.
-- ---------------------------------------------------------------------------
create table if not exists public.rent_payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  lease_id     uuid references public.leases (id) on delete set null,
  amount       numeric(12,2) not null check (amount >= 0),
  paid_date    date not null,
  period_month date, -- first of the month this payment covers (null = same as paid month)
  method       text,
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PROPERTY EXPENSES
-- ---------------------------------------------------------------------------
create table if not exists public.property_expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  unit_id      uuid references public.units (id) on delete set null,
  amount       numeric(12,2) not null check (amount >= 0),
  expense_date date not null,
  category     text not null default 'other'
               check (category in ('repairs','maintenance','capex','taxes','insurance','utilities','hoa','management','legal','supplies','travel','other')),
  vendor       text,
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MORTGAGES — one active loan per property is typical; more is allowed (HELOC).
-- ---------------------------------------------------------------------------
create table if not exists public.mortgages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id     uuid not null references public.properties (id) on delete cascade,
  lender          text not null,
  original_amount numeric(14,2) check (original_amount is null or original_amount >= 0),
  current_balance numeric(14,2) not null default 0 check (current_balance >= 0),
  interest_rate   numeric(6,3) check (interest_rate is null or interest_rate >= 0),
  monthly_payment numeric(12,2) not null default 0 check (monthly_payment >= 0),
  start_date      date,
  notes           text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MORTGAGE PAYMENTS — logged debt service. The split is optional; when given,
-- principal counts as equity (not expense) in the yearly finances.
-- ---------------------------------------------------------------------------
create table if not exists public.mortgage_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mortgage_id uuid not null references public.mortgages (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  amount      numeric(12,2) not null check (amount >= 0),
  principal   numeric(12,2) check (principal is null or principal >= 0),
  interest    numeric(12,2) check (interest is null or interest >= 0),
  escrow      numeric(12,2) check (escrow is null or escrow >= 0),
  paid_date   date not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY — own rows only, on every table.
-- ---------------------------------------------------------------------------
alter table public.properties        enable row level security;
alter table public.units             enable row level security;
alter table public.tenants           enable row level security;
alter table public.leases            enable row level security;
alter table public.rent_payments     enable row level security;
alter table public.property_expenses enable row level security;
alter table public.mortgages         enable row level security;
alter table public.mortgage_payments enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'properties','units','tenants','leases',
    'rent_payments','property_expenses','mortgages','mortgage_payments'
  ] loop
    execute format('create policy "own %1$s - select" on public.%1$I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own %1$s - insert" on public.%1$I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own %1$s - update" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own %1$s - delete" on public.%1$I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Per-user and per-property lookups.
create index if not exists properties_user_idx         on public.properties (user_id);
create index if not exists units_property_idx          on public.units (property_id);
create index if not exists tenants_user_idx            on public.tenants (user_id);
create index if not exists leases_unit_idx             on public.leases (unit_id);
create index if not exists leases_user_idx             on public.leases (user_id);
create index if not exists rent_payments_property_idx  on public.rent_payments (property_id, paid_date);
create index if not exists property_expenses_prop_idx  on public.property_expenses (property_id, expense_date);
create index if not exists mortgages_property_idx      on public.mortgages (property_id);
create index if not exists mortgage_payments_prop_idx  on public.mortgage_payments (property_id, paid_date);
