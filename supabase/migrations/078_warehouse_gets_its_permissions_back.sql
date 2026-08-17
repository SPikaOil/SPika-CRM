-- 078: the warehouse role has no permissions at all.
--
-- Measured straight after 077 landed:
--
--   role       permissions
--   manager    audit.view, carriers.edit, customernames.view, customers.edit, …
--   marketing  customernames.view, marketing.manage, marketing.view, products.view, …
--   sales      customernames.view, deliveries.own, orders.create
--   warehouse  {}                                                  ← empty
--
-- 077 creates a row for every role so that a missing row cannot read as "no
-- permissions", then adds the new switches per role. Warehouse was given no new
-- switches — correctly, it gets none of them — but that left it with the empty
-- row the insert had just made. Empty means has_perm() answers false to
-- everything, so this role is now locked out of the batches, stock movements
-- and transports it exists to handle.
--
-- These three are what the app has always intended for the role, and are what
-- the Permissions screen would write if an admin pressed "reset to defaults":
-- see DEFAULT_ROLE_PERMISSIONS.warehouse in src/lib/permissions.ts.
--
-- Adding, not replacing — anything an admin ticked stays.

begin;

update public.role_permissions
   set permissions = array(select distinct unnest(permissions || array[
         'warehouse.view', 'warehouse.receive', 'deliveries.own'
       ])),
       updated_at = now()
 where role = 'warehouse';

commit;
