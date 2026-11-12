-- Ops board — a Copart-style status board: sections (columns) hold lines,
-- lines hold tasks, and every line shows red (overdue) / orange (due soon) /
-- blue (open) counts. A section can be tied to a property, in which case its
-- column also shows that property's rent installments.
--
-- Rent payment plans: a lease's money can be expected on a schedule that
-- differs from its monthly due day (e.g. $700 every Monday toward $2,300/mo
-- rent plus a back balance). Rent still accrues monthly on the lease, so the
-- tenant balance stays honest; the plan only says when payments are expected.
--
-- Every table: user-owned, RLS on, own-rows-only policies.

-- ---------------------------------------------------------------------------
-- SECTIONS — one column on the board.
-- ---------------------------------------------------------------------------
create table if not exists public.ops_sections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  icon        text not null default 'clipboard',
  property_id uuid references public.properties (id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- LINES — one row of red/orange/blue tiles inside a section.
-- ---------------------------------------------------------------------------
create table if not exists public.ops_lines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section_id  uuid not null references public.ops_sections (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  info        text check (info is null or char_length(info) <= 400),
  dated       boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- TASKS — done_at null = open. A repeating task, when finished, is followed
-- by a fresh copy at its next due date.
-- ---------------------------------------------------------------------------
create table if not exists public.ops_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  line_id     uuid not null references public.ops_lines (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  assignee    text check (assignee is null or char_length(assignee) <= 60),
  due_date    date,
  repeat      text check (repeat in ('daily', 'weekly', 'monthly')),
  notes       text check (notes is null or char_length(notes) <= 1000),
  done_at     timestamptz,
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RENT SCHEDULES — when a lease's payments are expected, if not monthly.
-- ---------------------------------------------------------------------------
create table if not exists public.rent_schedules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lease_id    uuid not null references public.leases (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  frequency   text not null default 'weekly' check (frequency in ('weekly', 'biweekly', 'monthly')),
  start_date  date not null,
  end_date    date,
  note        text,
  created_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

-- A payment logged from the board says which installment it answers.
alter table public.rent_payments
  add column if not exists schedule_id uuid references public.rent_schedules (id) on delete set null,
  add column if not exists installment_date date;

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY — own rows only, on every new table.
-- ---------------------------------------------------------------------------
alter table public.ops_sections   enable row level security;
alter table public.ops_lines      enable row level security;
alter table public.ops_tasks      enable row level security;
alter table public.rent_schedules enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ops_sections', 'ops_lines', 'ops_tasks', 'rent_schedules'] loop
    execute format('create policy "own %1$s - select" on public.%1$I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own %1$s - insert" on public.%1$I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own %1$s - update" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own %1$s - delete" on public.%1$I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

create index if not exists ops_sections_user_idx      on public.ops_sections (user_id, sort_order);
create index if not exists ops_lines_section_idx      on public.ops_lines (section_id, sort_order);
create index if not exists ops_tasks_line_idx         on public.ops_tasks (line_id);
create index if not exists ops_tasks_user_open_idx    on public.ops_tasks (user_id) where done_at is null;
create index if not exists rent_schedules_lease_idx   on public.rent_schedules (lease_id);
create index if not exists rent_payments_schedule_idx on public.rent_payments (schedule_id, installment_date);
