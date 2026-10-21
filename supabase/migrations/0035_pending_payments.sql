-- Pending payments — money that is promised but has NOT landed.
--
-- Honest-numbers rules:
-- - A pending rent payment (e.g. an assistance check that was mailed) is
--   visible everywhere in purple but counts toward NOTHING — not income,
--   not cash flow, not a tenant's balance — until it is marked received.
-- - paid_date becomes nullable: a pending row has an expected_date instead,
--   and gains its paid_date the day it is marked received.

alter table public.rent_payments
  add column if not exists status text not null default 'received'
    check (status in ('received', 'pending')),
  add column if not exists expected_date date;

alter table public.rent_payments
  alter column paid_date drop not null;

-- A received payment must say when it arrived; a pending one must say when
-- it is expected. (Rows may carry both — e.g. after being marked received.)
alter table public.rent_payments
  add constraint rent_payments_status_dates_check check (
    (status = 'received' and paid_date is not null)
    or (status = 'pending' and expected_date is not null)
  );
