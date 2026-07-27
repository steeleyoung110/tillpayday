-- Debt as a first-class citizen: liabilities learn their monthly payment so
-- the dashboard can show a real payoff date and total interest cost using the
-- same amortization math as the Grow tab.

alter table public.liabilities
  add column minimum_payment numeric not null default 0 check (minimum_payment >= 0);
