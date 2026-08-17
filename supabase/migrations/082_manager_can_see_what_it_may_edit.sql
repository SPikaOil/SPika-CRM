-- 082: the manager row never caught up with the app.
--
-- NOT RUN YET.
--
-- Found by measuring every role against every table, not by reading code.
--
-- The write test said a manager was refused when adding a store location, with
-- 42501 — a row-level security refusal. Asking the database directly gave:
--
--   has_perm('storelocator.edit')  →  true
--   has_perm('storelocator.view')  →  false
--
-- The INSERT was never the problem. PostgREST adds RETURNING whenever the
-- caller wants the new row back, and RETURNING is a read. The read policy asks
-- storelocator.view, which a manager does not hold, so the statement failed on
-- the way out with a message that blamed the insert. Repeated without
-- RETURNING, the row landed: a manager could add a store location through the
-- API and never through the screen.
--
-- Pulling that thread found the real shape of it. src/lib/permissions.ts has
-- always listed what a manager should hold. The row in role_permissions was
-- seeded before several of those keys existed, and every migration since —
-- including mine — adds only the keys it introduces, by design, so that an
-- admin's own choices survive. Nothing ever reconciled the two.
--
-- Live row (20 keys) measured against DEFAULT_ROLE_PERMISSIONS.manager, missing:
--
--   storelocator.view   can edit the store locator, cannot open it
--   products.view       Products tab hidden in the sidebar
--   stock.view          Stock & production hidden
--   salesdocs.view      Sales documents hidden — 1 document sits there unread
--   marketing.view      Marketing tab hidden
--   pos.grant           cannot grant a reseller's POS request
--   reports.view        Reports hidden
--
-- None of these were ever unticked by hand: they were never there to untick.
-- If any of them IS a deliberate choice, untick it on the Permissions screen
-- after this runs and it stays unticked — this migration adds, it does not
-- overwrite.

begin;

update public.role_permissions
   set permissions = array(select distinct unnest(permissions || array[
         'storelocator.view', 'products.view', 'stock.view',
         'salesdocs.view', 'marketing.view', 'pos.grant', 'reports.view'
       ])),
       updated_at = now()
 where role = 'manager';

commit;
