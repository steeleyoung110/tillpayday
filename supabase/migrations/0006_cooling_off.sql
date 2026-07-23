-- Cooling-off: marking a what-if as "bought" first starts a 48-hour timer.
-- The purchase can only be confirmed after it expires; skipping stays
-- available the whole time. Null = no timer running.
alter table public.whatif_items
  add column if not exists cooling_off_started_at timestamptz;
