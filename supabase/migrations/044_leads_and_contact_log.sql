-- 044: leads + contact log
-- A lead is simply a customer with is_lead = true (a potential customer we have
-- not sold to yet). "Convert to customer" flips is_lead back to false — the row,
-- its notes and its contact history all stay put. The contact log is a per-
-- customer jsonb array of touchpoints (who / when / note), available on EVERY
-- customer, not only leads.
--
-- Both columns are additive with defaults, so existing rows become normal
-- customers with an empty log and nothing breaks.

alter table public.customers
  add column if not exists is_lead boolean not null default false;

alter table public.customers
  add column if not exists contact_log jsonb not null default '[]'::jsonb;
