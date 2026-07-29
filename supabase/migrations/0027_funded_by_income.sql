-- Pass-through pairs: a bill can be marked as funded by a specific income
-- source (rental income → that property's mortgage). This lets the app report
-- honest per-property cash flow instead of blending rentals into the personal
-- budget, where rent looks like spending money and the mortgage looks like a
-- crisis.

alter table public.expenses
  add column funded_by_income_id uuid
  references public.income_sources (id) on delete set null;

create index expenses_funded_by_idx on public.expenses (funded_by_income_id);
