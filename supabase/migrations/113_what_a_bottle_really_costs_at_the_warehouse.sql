-- 113: the cost price of a bottle once it has arrived.
--
-- Her rule, 2026-08-21: "de VVP is de vvp van het product bij vertrek plus
-- vrachtkosten plus eventuele lokale kosten en plus opslagkosten." Converted at
-- the rate of the intake day, and spread per bottle — "Verdeling kosten zoals ik
-- zeg..per fles offcourse".
--
-- And it must be able to change afterwards, which is the part that shapes this:
-- "als 1 colli niet aankomt... dan moet warehouse dat tp op status afgerond
-- kunnen plaatsen, waardoor die laatste colli niet kan meerekenen in de
-- partijen, maar de kosten die normaal op de kwijte colli zouden vallen, worden
-- nu verdeeld over de andere producten die wel ingeslagen zijn... maar ook bijv
-- als we ineens 3 weken later een factuur krijgen van iets wat erbij hoort, dan
-- moet dat ook nog mogelijk zijn. uiteindelijk willen we de reele vvp weten."
--
-- So the number is never typed. It is worked out from the transport's costs and
-- what was actually received, and re-worked whenever either changes. Every pass
-- is written down, because a bottle that silently became more expensive is a
-- margin figure nobody can explain later.
--
-- Products stays the source of the bottle's own cost — her correction the same
-- day: "de vvp productiepartij is de vvp van het product... dus products is
-- leidend hierin." The intake batch FREEZES what that was, so last month's
-- warehouse value does not move when today's price does.

begin;

-- ── The three costs of a leg ─────────────────────────────────────────────────
--
-- Freight is paid up front, always ("vracht moet je ALTIJD vooruit betalen").
-- Local costs and storage turn up later and often twice, which is exactly why
-- the recalculation below has to exist.
alter table public.transports
  add column if not exists local_costs   numeric(12,2),
  add column if not exists storage_costs numeric(12,2),
  -- What the amounts above are IN. XCG needs no rate; anything else is
  -- converted at the rate of the day the goods were signed in.
  add column if not exists costs_currency text not null default 'XCG';

comment on column public.transports.local_costs is
  'Local costs of this leg — clearing, handling, whatever the destination charges.';
comment on column public.transports.storage_costs is
  'Storage charged on this leg. Part of the cost price, her rule of 2026-08-21.';

-- ── What a bottle of this batch cost to get here ─────────────────────────────
alter table public.batches
  add column if not exists vvp numeric(12,4),
  -- How that number was arrived at: product, freight, local, storage, the rate
  -- used and how many bottles it was spread over. A cost price you cannot take
  -- apart is a cost price nobody trusts.
  add column if not exists vvp_breakdown jsonb;

comment on column public.batches.vvp is
  'Cost price per bottle of this batch, landed. Worked out, never typed.';
comment on column public.batches.vvp_breakdown is
  'How the vvp was arrived at: product, freight, local, storage, rate, bottles.';

-- ── Every pass, kept ─────────────────────────────────────────────────────────
create table if not exists public.batch_cost_log (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  batch_id   uuid not null references public.batches(id) on delete cascade,
  vvp_before numeric(12,4),
  vvp_after  numeric(12,4),
  -- In words: 'goods receipt', 'costs changed', 'transport closed — colli 2 is
  -- not coming', 'late invoice added'.
  reason     text not null default '',
  breakdown  jsonb,
  created_by uuid references public.users(id) on delete set null
);

comment on table public.batch_cost_log is
  'Every time a batch cost price was worked out again, and why.';

create index if not exists batch_cost_log_batch_idx
  on public.batch_cost_log (batch_id, created_at desc);

alter table public.batch_cost_log enable row level security;

-- Read follows the warehouse: if you may see the stock you may see what it
-- cost. Writing is the app's own bookkeeping, done by whoever triggered the
-- recalculation — a goods receipt is the usual one, and that is warehouse work.
select public.reset_policies('batch_cost_log');
create policy "batch cost log: read" on public.batch_cost_log for select
  using (public.has_perm('warehouse.view') or public.is_staff());
create policy "batch cost log: write" on public.batch_cost_log for insert
  with check (public.has_perm('warehouse.receive') or public.is_staff());

commit;
