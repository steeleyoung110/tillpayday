-- When the loan is scheduled to be done — typically start + 30 years.
alter table public.mortgages add column if not exists payoff_date date;
