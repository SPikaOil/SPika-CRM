-- 069: a handover moves stock between places
--
-- Danique, 2026-08-14, on moving a batch from one warehouse to another:
-- "van ingeslagen warehouse, naar handover, zodra men daar een persoon kiest,
-- die weer gelinkt is aan een andere warehouse, heb je het al ingezet via de
-- app (...) de handover kan fysiek gebeuren, maar kan ook bijv via post NL
-- verstuurd worden naar de andere locatie, dus we zouden hier track and trace
-- nummer of label nummer in moeten kunnen plaatsen (...) dan bij ontvangst moet
-- desbetreffende nog de eventuele tekorten kunnen doorgeven."
--
-- So a handover stops being "bottles handed to a colleague on Curaçao" and
-- becomes the way stock travels between any two places we hold it.
--
-- WHERE IT GOES is deliberately NOT a column. It follows from the person, via
-- transport_locations.user_id (migrations 066 and 068, one person one place).
-- A destination you can set independently of the receiver is a destination you
-- can set wrong, and then the bottles are booked somewhere nobody is standing.
--
-- WHERE IT COMES FROM has to be said, because the same batch can be lying on
-- Curaçao and in Rotterdam at once. Null keeps meaning Curaçao, exactly as it
-- does in stock_movements.
--
-- The two bookings:
--   handover   -qty  from_location  when it is created, it leaves the shelf
--   received   +qty  their location  when it is signed for, the COUNTED number
-- In between the goods are in the post: off the first shelf, not yet on the
-- second. Which is the truth, and is what you want to see while PostNL has it.

begin;

alter table public.handover_batches
  add column if not exists from_location_id uuid references public.transport_locations(id);

comment on column public.handover_batches.from_location_id is
  'Where the bottles left from. Null = Curaçao, the same convention as stock_movements.location_id. The destination is not stored: it follows from the receiver''s location.';

alter table public.handover_batches
  add column if not exists tracking_number text not null default '';

comment on column public.handover_batches.tracking_number is
  'Track and trace or label number when the handover is posted instead of handed over in person. Empty = handed over physically.';

alter table public.handover_batches
  add column if not exists tracking_carrier text not null default '';

alter table public.handover_batches
  add column if not exists receipt_lines jsonb not null default '[]'::jsonb;

comment on column public.handover_batches.receipt_lines is
  'What the receiver counted: [{sku, name, expected, received, reason}]. Received is what goes into stock; expected is what was sent. A shortage is kept, never silently corrected.';

-- The receiver signs on their OWN device, so they need to be able to write their
-- own row. Migration 040 made handover_batches admin-only for writes, which
-- worked while the admin was standing there holding the phone. It does not work
-- when the bottles are signed for in Rotterdam.
--
-- Narrow on purpose: only your own handover, and only while it is unsigned. A
-- signed handover is a document, and a document does not change afterwards.
drop policy if exists "handover: receiver signs their own" on public.handover_batches;
create policy "handover: receiver signs their own"
  on public.handover_batches for update
  to authenticated
  using (member_id = auth.uid() and signed_at is null)
  with check (member_id = auth.uid());

commit;
