-- Contract watch: bills that renew on a date (insurance, phone plans, annual
-- subscriptions) get a renewal_date so the app can nudge "shop this around"
-- before it auto-renews.

alter table public.expenses add column renewal_date date;
