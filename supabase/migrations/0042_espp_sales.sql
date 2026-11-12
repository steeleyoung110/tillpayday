-- ESPP lots can record a sale (date and price) so the Stocks tab can show
-- realized profit or loss, and the ESPP's broker can be E*TRADE (Morgan
-- Stanley at Work).

alter table public.stock_lots
  add column if not exists sale_date  date,
  add column if not exists sale_price numeric(14,4) check (sale_price is null or sale_price >= 0);

alter table public.stock_accounts drop constraint if exists stock_accounts_broker_check;
alter table public.stock_accounts
  add constraint stock_accounts_broker_check check (broker in ('robinhood', 'fidelity', 'etrade', 'other'));
