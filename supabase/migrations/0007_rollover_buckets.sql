-- Sinking funds: buckets that keep their balance between paychecks instead of
-- being swept to savings. Their allocation stacks up every payday (e.g. a
-- Concert fund growing $100/check) and drains when its expenses hit.
alter table public.buckets
  add column if not exists rolls_over boolean not null default false;
