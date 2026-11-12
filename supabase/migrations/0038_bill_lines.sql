-- Bills that log themselves.
--
-- A board line can be a "bill line" (HOA dues, utilities, insurance…): checking
-- one of its tasks off asks what was paid and records a property expense in
-- that category. The task remembers the amount (so next month's copy is
-- prefilled) and which expense it created (so reopening it can take the
-- expense back out).

alter table public.ops_lines
  add column if not exists bill_category text
    check (bill_category in ('repairs','maintenance','capex','taxes','insurance','utilities','hoa','management','legal','supplies','travel','other'));

alter table public.ops_tasks
  add column if not exists amount numeric(12,2) check (amount is null or amount >= 0),
  add column if not exists expense_id uuid references public.property_expenses (id) on delete set null;
