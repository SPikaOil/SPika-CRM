-- 115: a stock movement says which delivery run it belongs to.
--
-- Her answer, 2026-08-21, on when bottles leave the shelf: "ja zodra het je de
-- run klaarzet, echter is die order pas echt rond bij tekenen klant."
--
-- Which is right, and the app had it the other way round: nothing came off the
-- shelf until the customer signed, so bottles already boxed up and in the car
-- still counted as standing in the warehouse. Two people could promise the same
-- fifty bottles to two customers and both screens would agree.
--
-- Moving the booking to the moment the run is made up needs one thing the
-- movements did not have: which RUN they belong to. An order can have several
-- (migration 058), so cancelling one has to put back its own bottles and not
-- another run's. order_id cannot tell them apart.

begin;

alter table public.stock_movements
  add column if not exists delivery_id uuid references public.deliveries(id) on delete set null;

comment on column public.stock_movements.delivery_id is
  'The delivery run these bottles left on. Set when the run is made up, so cancelling it can put exactly these back.';

create index if not exists stock_movements_delivery_idx
  on public.stock_movements (delivery_id);

commit;
