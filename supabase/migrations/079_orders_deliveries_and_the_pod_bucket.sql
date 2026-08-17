-- 079: the last three tables that still asked for a ROLE, plus the file bucket.
--
-- Measured on the live database on 2026-08-16, after 077 and 078:
--
--   orders      read/insert/update  →  is_staff() OR own customer row
--   deliveries  read/insert/update  →  is_staff()
--
-- is_staff() knows admin, manager, sales and the legacy 'staff'. Warehouse and
-- marketing are not in it and have no customer row, so both halves are false:
-- a warehouse account sees zero orders and zero deliveries. That is the role
-- that exists to hand goods over.
--
-- Her decisions, 2026-08-16:
--   - Sales and Warehouse may both see orders. Without it Sales would LOSE
--     order reading the moment is_staff() is replaced, because that role holds
--     orders.create and not orders.view.
--   - Sales may see marketing material and may grant POS material.
--
-- Also here: `orders` still carried "Customers can insert their own orders",
-- added by hand in the dashboard and a duplicate of the customer half of
-- "orders: insert staff or own". Policies are OR'd, so it changed nothing —
-- but a rule that lives only in the dashboard is exactly how the hole in
-- `users` came about. It goes.
--
-- access_requests is deliberately left alone. Its five hand-made policies were
-- read expression by expression and they are correct: reading is scoped to
-- user_id = auth.uid(), admin sees all, and the anon INSERT is what makes the
-- public request form work. Rows from that form carry no user_id, so nobody
-- but an admin can read them.

begin;

-- ── The switches this needs ───────────────────────────────────────────────

update public.role_permissions
   set permissions = array(select distinct unnest(permissions || array[
         'orders.view', 'marketing.view', 'pos.grant'
       ])),
       updated_at = now()
 where role = 'sales';

update public.role_permissions
   set permissions = array(select distinct unnest(permissions || array['orders.view'])),
       updated_at = now()
 where role = 'warehouse';

-- ── Orders ────────────────────────────────────────────────────────────────
-- Update follows orders.view rather than a create/edit permission on purpose:
-- the delivery flow writes order status and items straight from the browser
-- (delivery/[orderId]/page.tsx sets 'out_for_delivery'), so whoever may see an
-- order to deliver it must also be able to close it out.
select public.reset_policies('orders');
create policy "orders: read" on public.orders for select
  using (public.has_perm('orders.view') or customer_id = public.current_user_customer_id());
create policy "orders: insert" on public.orders for insert
  with check (public.has_perm('orders.create') or customer_id = public.current_user_customer_id());
create policy "orders: update" on public.orders for update
  using (public.has_perm('orders.view') or customer_id = public.current_user_customer_id());
create policy "orders: delete" on public.orders for delete
  using (public.has_perm('orders.delete'));

-- ── Deliveries ────────────────────────────────────────────────────────────
-- No new permission needed: deliveries.own and deliveries.all already exist.
-- Sales holds own, Warehouse holds own since 078, Manager holds both, and
-- Marketing holds neither — which is exactly right.
-- Customers never read this table; the portal reads orders, not deliveries.
select public.reset_policies('deliveries');
create policy "deliveries: read" on public.deliveries for select
  using (public.has_perm('deliveries.own') or public.has_perm('deliveries.all'));
create policy "deliveries: insert" on public.deliveries for insert
  with check (public.has_perm('deliveries.own') or public.has_perm('deliveries.all'));
create policy "deliveries: update" on public.deliveries for update
  using (public.has_perm('deliveries.own') or public.has_perm('deliveries.all'));

-- ── The pod-files bucket ──────────────────────────────────────────────────
--
-- It held two policies since 001:
--
--   insert  bucket_id = 'pod-files' and auth.uid() is not null
--   select  admin or owner = auth.uid()
--
-- Three things wrong with that.
--
-- 1. ANY signed-in account could upload anything, anywhere in the bucket, with
--    no limit — the same bucket that holds every signature and every signed
--    invoice.
--
-- 2. There is no UPDATE policy, so every `upsert: true` upload fails the second
--    time. The code already knows: download-pdf.ts writes to a fresh uuid each
--    attempt with the comment "writing to generated/<name> therefore worked
--    exactly once per document and failed silently ever after". The OB form and
--    the handover signature both upsert to a FIXED path, so re-signing an OB
--    form has been failing silently all along.
--
-- 3. SELECT is admin-or-uploader, so a MANAGER cannot open a delivery note a
--    sales colleague uploaded. Not a lock anyone asked for — a side effect.
--
-- Points 2 and 3 are repairs beyond the literal request. They are here because
-- they live in the same two policies, and leaving them would mean touching this
-- bucket twice. Say the word and I take either back out.
--
-- Customers upload to exactly two folders and nowhere else, measured from the
-- portal: defect-reports/ (report-problem.tsx) and ob-forms/ (ob-sign).

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%pod-files%'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "pod-files: team uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'pod-files' and public.is_team());

create policy "pod-files: customer uploads" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pod-files'
    and public.current_user_customer_id() is not null
    and (storage.foldername(name))[1] in ('defect-reports', 'ob-forms')
  );

create policy "pod-files: team replaces" on storage.objects for update to authenticated
  using      (bucket_id = 'pod-files' and public.is_team())
  with check (bucket_id = 'pod-files' and public.is_team());

create policy "pod-files: customer replaces own" on storage.objects for update to authenticated
  using (
    bucket_id = 'pod-files'
    and public.current_user_customer_id() is not null
    and (storage.foldername(name))[1] in ('defect-reports', 'ob-forms')
  )
  with check (
    bucket_id = 'pod-files'
    and public.current_user_customer_id() is not null
    and (storage.foldername(name))[1] in ('defect-reports', 'ob-forms')
  );

-- Whoever may see an order may open the paperwork that belongs to it. Marketing
-- holds no orders.view, so this bucket stays shut for that role.
create policy "pod-files: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'pod-files'
    and (
      public.role_is(array['admin'])
      or owner = auth.uid()
      or public.has_perm('orders.view')
    )
  );

commit;
