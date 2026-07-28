-- Bill price-creep tracking: every amount edit on an expense logs old → new,
-- so "Spotify crept from $9.99 to $11.99" is a fact, not a feeling.

create table public.expense_amount_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expense_id uuid not null references public.expenses (id) on delete cascade,
  old_amount numeric not null,
  new_amount numeric not null,
  changed_at timestamptz not null default now()
);

alter table public.expense_amount_history enable row level security;

create policy "expense_history_select" on public.expense_amount_history
  for select using ((select auth.uid()) = user_id);
create policy "expense_history_insert" on public.expense_amount_history
  for insert with check ((select auth.uid()) = user_id);

create index expense_history_expense_idx on public.expense_amount_history (expense_id);
create index expense_history_user_idx on public.expense_amount_history (user_id);
