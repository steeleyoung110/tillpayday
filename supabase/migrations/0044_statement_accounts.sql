-- Stocks: accounts kept from a mailed or downloaded statement (first one:
-- Tiffany's Ally Invest robo portfolio). Their shares and cash are entered
-- from each statement; the daily sync prices them and records their value,
-- so they chart and count like the Robinhood accounts.
--
-- A statement account is any account whose broker isn't Robinhood and isn't
-- the ESPP (the ESPP is valued from its purchase lots instead).

alter table public.stock_accounts drop constraint if exists stock_accounts_broker_check;
alter table public.stock_accounts
  add constraint stock_accounts_broker_check check (broker in ('robinhood', 'fidelity', 'etrade', 'ally', 'other'));

-- The period-end date of the statement the shares and cash came from.
alter table public.stock_accounts add column if not exists statement_date date;

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
  sent_keys text[];
  basis numeric;
  n_pos int := 0;
  n_div int := 0;
  n_new int := 0;
  n_stmt int := 0;
  income numeric;
  st record;
  held int;
  unpriced int;
  stock_value numeric;
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
    -- Fund pages often list the NEXT ex-date beside the LAST pay date; an
    -- ex-date after the pay date belongs to a later payment, so drop it.
    values (uid, upper(dv->>'symbol'), (dv->>'pay_date')::date,
            case when nullif(dv->>'ex_date', '')::date > (dv->>'pay_date')::date then null
                 else nullif(dv->>'ex_date', '')::date end,
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

    -- Yearly dividends at today's shares (latest announced amount per stock).
    select coalesce(sum(sp.quantity * di.per_share * public.stock_payments_per_year(di.frequency)), 0)
    into income
    from stock_positions sp
    join lateral (
      select d.per_share, d.frequency from stock_dividend_info d
      where d.user_id = uid and d.symbol = sp.symbol and d.pay_date > as_of - 400
      order by d.pay_date desc limit 1
    ) di on true
    where sp.account_id = acc_id;

    insert into stock_account_values (user_id, account_id, day, value, cost_basis, annual_income, backfilled)
    values (uid, acc_id, as_of, (acc->>'value')::numeric, round(basis, 2), round(income, 2), false)
    on conflict (account_id, day) do update set value = excluded.value, cost_basis = excluded.cost_basis,
      annual_income = excluded.annual_income, backfilled = false;

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

  -- Statement accounts: the shares and cash from the last statement, at the
  -- latest close. Skipped (nothing recorded) when any holding has no close
  -- from the past week, so a missing quote never records a wrong total.
  sent_keys := array(select a->>'key' from jsonb_array_elements(coalesce(payload->'accounts', '[]'::jsonb)) a);
  for st in
    select a.id, a.cash, a.crypto from stock_accounts a
    where a.user_id = uid and a.broker <> 'robinhood' and a.kind <> 'espp' and not (a.key = any(sent_keys))
  loop
    select count(*), count(*) filter (where px.close is null), coalesce(sum(sp.quantity * px.close), 0),
           case when bool_and(sp.avg_cost is not null) then sum(sp.quantity * sp.avg_cost) end
    into held, unpriced, stock_value, basis
    from stock_positions sp
    left join lateral (
      select p.close from stock_prices p
      where p.user_id = uid and p.symbol = sp.symbol and p.day <= as_of and p.day > as_of - 7
      order by p.day desc limit 1
    ) px on true
    where sp.account_id = st.id and sp.quantity > 0;
    continue when held = 0 or unpriced > 0;

    select coalesce(sum(sp.quantity * di.per_share * public.stock_payments_per_year(di.frequency)), 0)
    into income
    from stock_positions sp
    join lateral (
      select d.per_share, d.frequency from stock_dividend_info d
      where d.user_id = uid and d.symbol = sp.symbol and d.pay_date > as_of - 400
      order by d.pay_date desc limit 1
    ) di on true
    where sp.account_id = st.id;

    insert into stock_account_values (user_id, account_id, day, value, cost_basis, annual_income, backfilled)
    values (uid, st.id, as_of, round(stock_value + coalesce(st.cash, 0) + coalesce(st.crypto, 0), 2),
            round(basis, 2), round(income, 2), false)
    on conflict (account_id, day) do update set value = excluded.value, cost_basis = excluded.cost_basis,
      annual_income = excluded.annual_income, backfilled = false;

    insert into stock_dividends (user_id, account_id, symbol, pay_date, amount, shares, per_share, source)
    select uid, st.id, sp.symbol, di.pay_date, round(sp.quantity * di.per_share, 2), sp.quantity, di.per_share, 'estimated'
    from stock_positions sp
    join stock_dividend_info di on di.user_id = uid and di.symbol = sp.symbol
    where sp.account_id = st.id and sp.quantity > 0 and di.per_share > 0 and di.pay_date is not null
      and di.pay_date <= as_of and di.pay_date > as_of - 10
      and (di.ex_date is null or di.ex_date <= as_of)
    on conflict (account_id, symbol, pay_date, source) do nothing;
    get diagnostics n_new = row_count;
    n_div := n_div + n_new;
    n_stmt := n_stmt + 1;
  end loop;

  return jsonb_build_object('ok', true, 'as_of', as_of, 'positions', n_pos, 'dividends_recorded', n_div,
                            'statement_accounts', n_stmt);
end;
$$;

revoke all on function public.stock_sync_ingest(jsonb) from public;
revoke all on function public.stock_sync_ingest(jsonb) from anon;
revoke all on function public.stock_sync_ingest(jsonb) from authenticated;
