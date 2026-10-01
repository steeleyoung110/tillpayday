-- A mortgage can be recorded knowing only "I pay $X a month since <date>".
-- NULL balance means "not entered yet" — deliberately distinct from 0 (paid
-- off), so equity math can say "incomplete" instead of lying.
alter table public.mortgages
  alter column current_balance drop not null,
  alter column current_balance set default null;
