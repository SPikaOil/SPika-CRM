-- 051: a currency per customer category, carried down to the customer and
-- frozen onto the order at its invoice date.
--
-- Prices are ENTERED in the category's own currency. A price for a Dutch
-- restaurant is a market price, not XCG x 2.00, so nothing is converted on the
-- way in. An exchange rate exists only to roll differing currencies up into one
-- reporting number.
--
-- Currency deliberately lives at three levels:
--   price_presets.currency  where the admin sets it (Products -> Categories)
--   customers.currency      copied when the category is applied, so it survives
--                           a later edit to the category
--   orders.currency         stamped at insert, so re-generating last year's
--                           invoice can never silently change its currency —
--                           the same reason is_consignment is stamped (042)
--
-- USD and EUR are NOT treated the same, on purpose. XCG is pegged to the dollar,
-- so the USD rate is a house constant in company_settings. The euro floats: it
-- moved 2.5% between 2 June and 28 July 2026, which is real money on the revenue
-- figures. EUR therefore uses the ECB day rate, stored per day in fx_rates.
--
-- The rate is frozen at the INVOICE DATE, which by house rule (048) is the
-- delivery date. Until an order is delivered its fx_rate is today's rate as an
-- indication; the moment after_delivery_update() writes invoice_date, the
-- trigger below re-stamps it with the rate that applied on that day.

begin;

-- ── Daily exchange rates ────────────────────────────────────────────────────
-- rate_to_xcg = how many XCG one unit of `currency` buys on `rate_date`.
-- Filled by /api/fx/sync (ECB via frankfurter.app, EUR->USD, multiplied by the
-- house USD rate — there is no published EUR/XCG quote).
create table if not exists public.fx_rates (
  currency    text not null,
  rate_date   date not null,
  rate_to_xcg numeric(12,6) not null check (rate_to_xcg > 0),
  source      text not null default 'ecb',
  fetched_at  timestamptz not null default now(),
  primary key (currency, rate_date)
);

alter table public.fx_rates enable row level security;

-- Staff may read; nobody writes through the API. /api/fx/sync uses the service
-- role, so leaving out an insert policy keeps rates out of reach of the portal.
drop policy if exists "fx_rates: read staff" on public.fx_rates;
create policy "fx_rates: read staff" on public.fx_rates
  for select using (public.is_staff());

-- ── Columns ────────────────────────────────────────────────────────────────
alter table public.price_presets add column if not exists currency text          not null default 'XCG';
alter table public.customers     add column if not exists currency text          not null default 'XCG';
alter table public.orders        add column if not exists currency text          not null default 'XCG';
alter table public.orders        add column if not exists fx_rate  numeric(12,6) not null default 1;
alter table public.quotes        add column if not exists currency text          not null default 'XCG';

comment on column public.orders.fx_rate is
  'XCG per 1 unit of orders.currency, frozen at invoice_date. Always 1 for XCG, so historical sums are unaffected.';

-- ── Allowed values ─────────────────────────────────────────────────────────
alter table public.price_presets drop constraint if exists price_presets_currency_check;
alter table public.price_presets add  constraint price_presets_currency_check check (currency in ('XCG', 'USD', 'EUR'));

alter table public.customers drop constraint if exists customers_currency_check;
alter table public.customers add  constraint customers_currency_check check (currency in ('XCG', 'USD', 'EUR'));

alter table public.orders drop constraint if exists orders_currency_check;
alter table public.orders add  constraint orders_currency_check check (currency in ('XCG', 'USD', 'EUR'));

alter table public.quotes drop constraint if exists quotes_currency_check;
alter table public.quotes add  constraint quotes_currency_check check (currency in ('XCG', 'USD', 'EUR'));

-- ── The one category that does not invoice in guilders ──────────────────────
update public.price_presets set currency = 'EUR' where category = 'export-nl-rest';

-- ── Which rate applies on a given day ───────────────────────────────────────
-- Falls back to the most recent stored rate on or before that date (covers
-- weekends and holidays, when the ECB publishes nothing), then to the manual
-- rate in company_settings, so an order can never end up without a rate.
create or replace function public.fx_rate_for(p_currency text, p_date date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case p_currency
    when 'XCG' then 1::numeric
    when 'USD' then coalesce((select s.rate_usd from public.company_settings s limit 1), 1.75)
    else coalesce(
      (select r.rate_to_xcg
         from public.fx_rates r
        where r.currency = p_currency
          and r.rate_date <= coalesce(p_date, current_date)
        order by r.rate_date desc
        limit 1),
      (select s.rate_eur from public.company_settings s limit 1),
      2.00
    )
  end
$$;

-- ── Stamp currency + rate onto an order ─────────────────────────────────────
-- In a trigger, not in the app, on purpose: the customer portal inserts orders
-- straight from the browser, so anything set app-side would be skipped there.
create or replace function public.stamp_order_currency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cust_currency text;
begin
  if tg_op = 'INSERT' then
    select c.currency into cust_currency from public.customers c where c.id = new.customer_id;
    new.currency := coalesce(cust_currency, 'XCG');
  end if;

  -- Before delivery invoice_date is null and this is today's rate as an
  -- indication; after_delivery_update() then writes invoice_date, this trigger
  -- fires again, and the rate is frozen on the real invoice day.
  new.fx_rate := public.fx_rate_for(new.currency, new.invoice_date);

  return new;
end;
$$;

drop trigger if exists stamp_order_currency_trg on public.orders;
create trigger stamp_order_currency_trg
  before insert or update of currency, invoice_date on public.orders
  for each row execute function public.stamp_order_currency();

commit;
