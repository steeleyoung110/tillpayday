-- Autopay audit: manual bills fail when YOU forget; autopay bills fail when
-- the CHARGE silently doesn't go through (or goes through twice). Different
-- failure modes, different nudges. Null = not yet classified.

alter table public.expenses add column autopay boolean;
