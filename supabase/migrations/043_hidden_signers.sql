-- 043: removable delivery signers
-- The "people who sign for deliveries" list is derived live from delivery
-- history (deliveries.signer_name) — there is no signer table. Admins need to
-- be able to remove someone from that list (staff who left, a typo'd name)
-- WITHOUT touching the delivery records themselves: those carry the signature
-- and are the signed proof of delivery, so they must stay intact.
--
-- Removed names are recorded per customer here and filtered out of the
-- suggestion list. Matching is case-insensitive in the app.

alter table public.customers
  add column if not exists hidden_signers text[] not null default '{}';
