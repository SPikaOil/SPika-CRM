-- 067: signing a transport in, including the differences
--
-- Danique, 2026-08-14: "bij warehouse kunnen bij inslag ook verschillen zijn,
-- voeg dit hier ook in toe voor desbetreffende sales personen van de warehouse".
--
-- Until now arrival was one button that booked in exactly what the order said.
-- That is a lie the moment a box arrives short or broken, and it is the lie that
-- makes a warehouse count drift for good: the shelf holds 198 while the app
-- insists on 200, and nothing ever reconciles the two.
--
-- So intake works like a delivery to a customer: somebody counts what really
-- came in, names the difference, and SIGNS for it. What is booked into stock is
-- the counted number, never the expected one.
--
-- The lines are kept as jsonb, exactly like deliveries.items — one row per
-- product per order with expected, received and a reason. That is the document
-- of what happened; the stock movements are the consequence of it.

begin;

alter table public.transports
  add column if not exists received_by uuid references public.users(id);

comment on column public.transports.received_by is
  'The warehouse member who signed this transport in. Null until it is signed in.';

alter table public.transports
  add column if not exists receipt_signature_url text;

comment on column public.transports.receipt_signature_url is
  'PATH inside the private pod-files bucket, never a public URL — the bucket has no public read. Serve it through a signed URL.';

alter table public.transports
  add column if not exists receipt_lines jsonb not null default '[]'::jsonb;

comment on column public.transports.receipt_lines is
  'What was counted at intake: [{order_id, sku, name, expected, received, reason}]. Received is what went into stock; expected is what the order said. A difference is kept, never silently corrected.';

alter table public.transports
  add column if not exists receipt_notes text not null default '';

-- A warehouse member signs in the transports going to their own location, and
-- reads nothing else. Which location is theirs comes from transport_locations
-- (migration 066), so nobody can sign in somebody else's goods.
drop policy if exists "transports: warehouse own location" on public.transports;
create policy "transports: warehouse own location"
  on public.transports for select
  to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.transport_locations l
      where l.id = transports.location_id
        and l.user_id = auth.uid()
    )
  );

drop policy if exists "transports: warehouse signs in" on public.transports;
create policy "transports: warehouse signs in"
  on public.transports for update
  to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.transport_locations l
      where l.id = transports.location_id
        and l.user_id = auth.uid()
    )
  )
  with check (
    public.is_staff()
    or exists (
      select 1 from public.transport_locations l
      where l.id = transports.location_id
        and l.user_id = auth.uid()
    )
  );

commit;
