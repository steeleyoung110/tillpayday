-- Safe-to-spend: mark which buckets are flexible day-to-day spending money
-- (groceries, fun…) as opposed to earmarked bills. The dashboard's hero number
-- is the flexible balance divided by days remaining until the next payday.
alter table public.buckets
  add column if not exists is_flexible boolean not null default false;
