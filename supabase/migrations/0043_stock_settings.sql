-- Stocks: a per-user market-data key (Finnhub) so the Stocks pages and the
-- Board dropdown can show live prices while you're on the site. Read only by
-- the app's server; owner-only like every other table.

create table if not exists public.stock_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  quotes_key  text check (quotes_key is null or char_length(quotes_key) between 8 and 200),
  updated_at  timestamptz not null default now()
);

alter table public.stock_settings enable row level security;
create policy "own stock_settings - select" on public.stock_settings for select using (auth.uid() = user_id);
create policy "own stock_settings - insert" on public.stock_settings for insert with check (auth.uid() = user_id);
create policy "own stock_settings - update" on public.stock_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own stock_settings - delete" on public.stock_settings for delete using (auth.uid() = user_id);
