-- Stocks: a read-only view of brokerage accounts, kept completely apart from
-- the property money (nothing here feeds the dashboard, ledgers or reports).
--
-- Robinhood accounts are filled by a daily sync (a scheduled Claude run that
-- reads Robinhood and calls stock_sync_ingest). The Fidelity ESPP is entered
-- by hand as purchase lots. Dividend history comes from the sync (estimated
-- from each stock's dividend schedule) and from Robinhood activity CSVs.

create table if not exists public.stock_accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key          text not null check (char_length(key) between 1 and 40),
  name         text not null check (char_length(name) between 1 and 80),
  broker       text not null default 'robinhood' check (broker in ('robinhood', 'fidelity', 'other')),
  kind         text not null default 'brokerage' check (kind in ('brokerage', 'agentic', 'espp')),
  last4        text check (last4 is null or last4 ~ '^[0-9A-Za-z]{2,4}$'),
  goal_amount  numeric(14,2),
  goal_date    date,
  goal_note    text,
  cash         numeric(14,2),
  crypto       numeric(14,2),
  synced_at    timestamptz,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, key)
);

-- Current holdings per synced account (replaced on every sync).
create table if not exists public.stock_positions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id  uuid not null references public.stock_accounts (id) on delete cascade,
  symbol      text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  quantity    numeric(18,6) not null check (quantity >= 0),
  avg_cost    numeric(14,4),
  updated_at  timestamptz not null default now(),
  unique (account_id, symbol)
);

-- ESPP (or any hand-kept) purchase lots.
create table if not exists public.stock_lots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id      uuid not null references public.stock_accounts (id) on delete cascade,
  symbol          text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  purchase_date   date,
  shares          numeric(18,6) not null check (shares > 0),
  purchase_price  numeric(14,4) check (purchase_price is null or purchase_price >= 0),
  market_price    numeric(14,4) check (market_price is null or market_price >= 0),
  sold            boolean not null default false,
  note            text,
  created_at      timestamptz not null default now()
);

-- Daily closes for every symbol held.
create table if not exists public.stock_prices (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol      text not null,
  day         date not null,
  close       numeric(14,4) not null,
  prev_close  numeric(14,4),
  primary key (user_id, symbol, day)
);

-- Each account's value at each day's close.
create table if not exists public.stock_account_values (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id  uuid not null references public.stock_accounts (id) on delete cascade,
  day         date not null,
  value       numeric(14,2) not null,
  cost_basis  numeric(14,2),
  backfilled  boolean not null default false,
  primary key (account_id, day)
);

-- Every dividend Robinhood has announced for a held stock (one row per pay
-- date, kept as history so a payment is never missed when the next one is
-- announced early).
create table if not exists public.stock_dividend_info (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol         text not null,
  pay_date       date not null,
  ex_date        date,
  per_share      numeric(14,6) not null,
  frequency      text,
  yield_pct      numeric(8,4),
  updated_at     timestamptz not null default now(),
  primary key (user_id, symbol, pay_date)
);

-- Dividends paid: estimated by the sync, or real from a Robinhood CSV.
create table if not exists public.stock_dividends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id  uuid not null references public.stock_accounts (id) on delete cascade,
  symbol      text not null,
  pay_date    date not null,
  amount      numeric(14,2) not null check (amount >= 0),
  shares      numeric(18,6),
  per_share   numeric(14,6),
  source      text not null default 'estimated' check (source in ('estimated', 'csv', 'manual')),
  created_at  timestamptz not null default now(),
  unique (account_id, symbol, pay_date, source)
);

do $$
declare t text;
begin
  foreach t in array array['stock_accounts','stock_positions','stock_lots','stock_prices','stock_account_values','stock_dividend_info','stock_dividends'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own %1$s - select" on public.%1$I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own %1$s - insert" on public.%1$I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own %1$s - update" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own %1$s - delete" on public.%1$I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

create index if not exists stock_positions_user_idx on public.stock_positions (user_id);
create index if not exists stock_lots_account_idx on public.stock_lots (account_id);
create index if not exists stock_values_user_day_idx on public.stock_account_values (user_id, day);
create index if not exists stock_dividends_user_day_idx on public.stock_dividends (user_id, pay_date);

-- ---------------------------------------------------------------------------
-- stock_sync_ingest: the one door the daily sync writes through. It takes a
-- JSON snapshot read from Robinhood and records it deterministically:
--   { "user_id": uuid, "as_of": "YYYY-MM-DD",
--     "accounts": [{ "key", "name", "kind", "last4", "value", "cash", "crypto",
--                    "positions": [{ "symbol", "quantity", "avg_cost" }] }],
--     "quotes":   [{ "symbol", "close", "prev_close" }],
--     "dividends":[{ "symbol", "per_share", "frequency", "ex_date", "pay_date", "yield_pct" }] }
-- Account names are only set when the account is first created, so a name
-- changed in the app sticks.
-- Not callable from the public API (execute revoked); the sync runs it with
-- the service connection.
-- ---------------------------------------------------------------------------
create or replace function public.stock_sync_ingest(payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  uid uuid := (payload->>'user_id')::uuid;
  as_of date := (payload->>'as_of')::date;
  acc jsonb;
  pos jsonb;
  q jsonb;
  dv jsonb;
  acc_id uuid;
  keep text[];
  basis numeric;
  n_pos int := 0;
  n_div int := 0;
  n_new int := 0;
begin
  if uid is null or as_of is null then
    raise exception 'user_id and as_of are required';
  end if;

  for q in select * from jsonb_array_elements(coalesce(payload->'quotes', '[]'::jsonb)) loop
    insert into stock_prices (user_id, symbol, day, close, prev_close)
    values (uid, upper(q->>'symbol'), as_of, (q->>'close')::numeric, nullif(q->>'prev_close', '')::numeric)
    on conflict (user_id, symbol, day) do update set close = excluded.close, prev_close = excluded.prev_close;
  end loop;

  for dv in select * from jsonb_array_elements(coalesce(payload->'dividends', '[]'::jsonb)) loop
    continue when nullif(dv->>'pay_date', '') is null or coalesce(nullif(dv->>'per_share', '')::numeric, 0) <= 0;
    insert into stock_dividend_info (user_id, symbol, pay_date, ex_date, per_share, frequency, yield_pct, updated_at)
    values (uid, upper(dv->>'symbol'), (dv->>'pay_date')::date, nullif(dv->>'ex_date', '')::date,
            (dv->>'per_share')::numeric, nullif(lower(dv->>'frequency'), ''), nullif(dv->>'yield_pct', '')::numeric, now())
    on conflict (user_id, symbol, pay_date) do update set ex_date = excluded.ex_date, per_share = excluded.per_share,
      frequency = excluded.frequency, yield_pct = excluded.yield_pct, updated_at = now();
  end loop;

  for acc in select * from jsonb_array_elements(coalesce(payload->'accounts', '[]'::jsonb)) loop
    insert into stock_accounts (user_id, key, name, broker, kind, last4, cash, crypto, synced_at)
    values (uid, acc->>'key', acc->>'name', 'robinhood', coalesce(acc->>'kind', 'brokerage'), acc->>'last4',
            nullif(acc->>'cash', '')::numeric, nullif(acc->>'crypto', '')::numeric, now())
    on conflict (user_id, key) do update set kind = excluded.kind, last4 = excluded.last4,
      cash = excluded.cash, crypto = excluded.crypto, synced_at = now()
    returning id into acc_id;

    keep := array(select upper(p->>'symbol') from jsonb_array_elements(coalesce(acc->'positions', '[]'::jsonb)) p);
    delete from stock_positions where account_id = acc_id and not (symbol = any(keep));
    basis := 0;
    for pos in select * from jsonb_array_elements(coalesce(acc->'positions', '[]'::jsonb)) loop
      insert into stock_positions (user_id, account_id, symbol, quantity, avg_cost, updated_at)
      values (uid, acc_id, upper(pos->>'symbol'), (pos->>'quantity')::numeric, nullif(pos->>'avg_cost', '')::numeric, now())
      on conflict (account_id, symbol) do update set quantity = excluded.quantity, avg_cost = excluded.avg_cost, updated_at = now();
      basis := basis + coalesce((pos->>'quantity')::numeric * nullif(pos->>'avg_cost', '')::numeric, 0);
      n_pos := n_pos + 1;
    end loop;

    insert into stock_account_values (user_id, account_id, day, value, cost_basis, backfilled)
    values (uid, acc_id, as_of, (acc->>'value')::numeric, round(basis, 2), false)
    on conflict (account_id, day) do update set value = excluded.value, cost_basis = excluded.cost_basis, backfilled = false;

    -- Dividends that paid in the last 10 days on shares held: record an
    -- estimate (a CSV import later adds the exact amount alongside).
    insert into stock_dividends (user_id, account_id, symbol, pay_date, amount, shares, per_share, source)
    select uid, acc_id, sp.symbol, di.pay_date, round(sp.quantity * di.per_share, 2), sp.quantity, di.per_share, 'estimated'
    from stock_positions sp
    join stock_dividend_info di on di.user_id = uid and di.symbol = sp.symbol
    where sp.account_id = acc_id and di.per_share > 0 and di.pay_date is not null
      and di.pay_date <= as_of and di.pay_date > as_of - 10
      and (di.ex_date is null or di.ex_date <= as_of)
    on conflict (account_id, symbol, pay_date, source) do nothing;
    get diagnostics n_new = row_count;
    n_div := n_div + n_new;
  end loop;

  return jsonb_build_object('ok', true, 'as_of', as_of, 'positions', n_pos, 'dividends_recorded', n_div);
end;
$$;

revoke all on function public.stock_sync_ingest(jsonb) from public;
revoke all on function public.stock_sync_ingest(jsonb) from anon;
revoke all on function public.stock_sync_ingest(jsonb) from authenticated;
