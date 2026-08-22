-- 117: a handover can go to a warehouse, and can be ordered before it is sent.
--
-- Her correction, 2026-08-21: "alle opties moeten mogelijk zijn. Bij bijv sales
-- hier op Curacao doen we soms een handover aan teamlid zoals Djamy of aan Sales
-- persoon. Die neemt bijv 50 flessen mee, daar tekent hij voor en gaat dan aan
-- de slag met orders... En natuurlijk van warehouse naar warehouse moet ook een
-- optie zijn."
--
-- So nothing is replaced. A handover to a person stays exactly as it is, and a
-- warehouse becomes a second kind of destination beside it.
--
-- And the reason she wanted it: "stel dat we het echt uberdruk hebben, en admin
-- laat warehouse x een aantal flessen vervoeren naar warehouse b... dit zou niet
-- moeten zijn dat ik warehouse b ga mailen of bellen. Admin stelt dit in, zodra
-- warehouse a dit gaat regelen en alles invoert, dan zou dit zichtbaar moeten
-- zijn op dashboard van beide warehouses."
--
-- That needs a step the table did not have. Today a handover is created and
-- signed for, two moments. Ordering one is a third, EARLIER moment: the goods
-- have not moved yet and must still be standing where they are. So the bottles
-- now leave at `sent_at` rather than at creation — and for the ordinary
-- hand-to-hand case the sender does both in the same breath, so nothing
-- changes for them.
--
--   created            admin asked for it. Nothing has moved.
--   sent_at            it really left. Off the sending shelf, in the post or a car.
--   signed_at          somebody at the other end counted it. On their shelf.

begin;

alter table public.handover_batches
  -- Where it is going, when that is a place rather than a person. NULL with a
  -- member_id means it goes to that person; NULL with neither is not valid and
  -- the check below refuses it.
  add column if not exists to_location_id uuid references public.transport_locations(id) on delete restrict,
  -- Who it is coming FROM, when a person hands stock back. Her rule for a
  -- return: "terug naar Curacao, via dezelfde handover maar dan de andere kant
  -- op" — one mechanism, both directions.
  add column if not exists from_holder_id uuid references public.users(id) on delete restrict,
  -- When it actually went. NULL = ordered but still standing where it is.
  add column if not exists sent_at timestamptz;

comment on column public.handover_batches.to_location_id is
  'The warehouse this handover is going to. NULL when it goes to a person (member_id).';
comment on column public.handover_batches.from_holder_id is
  'The person handing it over, for a return. NULL when it leaves a place.';
comment on column public.handover_batches.sent_at is
  'When it really left. NULL = ordered but not sent yet, and the bottles are still on the sending shelf.';

-- A handover to a person keeps member_id; one to a warehouse has none.
alter table public.handover_batches alter column member_id drop not null;

-- Everything that already exists went out the moment it was made, so its
-- sending moment is its creation. Without this every past handover would read
-- as "ordered, never sent".
update public.handover_batches
   set sent_at = coalesce(sent_at, created_at)
 where sent_at is null;

-- One destination, and at least one. A handover with neither end named is a row
-- nobody can act on: it would sit on no dashboard and be signed for by nobody.
alter table public.handover_batches
  drop constraint if exists handover_has_a_destination;
alter table public.handover_batches
  add constraint handover_has_a_destination check (
    (member_id is not null and to_location_id is null)
    or (member_id is null and to_location_id is not null)
  );

create index if not exists handover_to_location_idx on public.handover_batches (to_location_id);
create index if not exists handover_from_holder_idx on public.handover_batches (from_holder_id);

commit;
