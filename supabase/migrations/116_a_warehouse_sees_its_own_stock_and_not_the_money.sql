-- 116: a warehouse sees its own stock, and nobody's cost price.
--
-- Her rule, 2026-08-21: "warehouse view ziet enkel de vrd die bij desbetreffende
-- warehouse hoort of is." Until now anyone with warehouse.view read the stock of
-- every location and anyone who could receive could book at any of them. The
-- same hole as the name lists the day before, one table over.
--
-- ── And a correction of my own ───────────────────────────────────────────────
--
-- Migration 113 put the cost price on `batches`. That was wrong, and narrowing
-- the policies is what showed it: a warehouse member has to READ batches — they
-- need the parent batch to open an intake batch, and its number and best-before
-- to sign goods in — while the cost price is admin business. Row-level security
-- cannot hide one column, and every signed-in account is the same database role,
-- so column privileges cannot either.
--
-- So the money moves to a table of its own with its own rule. The batch keeps
-- being a batch; what it cost is a separate fact for separate eyes. Nothing is
-- lost — there is no data yet.

begin;

-- ── Whose place is this ──────────────────────────────────────────────────────
--
-- NULL is Curaçao, and `= null` is never true in SQL, so `is not distinct from`
-- is the difference between matching home and matching nothing at all.
create or replace function public.place_is_mine(p_location uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.warehouse_members wm
    where wm.user_id = auth.uid()
      and wm.location_id is not distinct from p_location
  );
$$;

comment on function public.place_is_mine(uuid) is
  'True when the signed-in user is a member of this location. NULL = Curacao.';

-- ── The cost price, on its own ───────────────────────────────────────────────
create table if not exists public.batch_costs (
  batch_id   uuid primary key references public.batches(id) on delete cascade,
  vvp        numeric(12,4),
  breakdown  jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.batch_costs is
  'What a bottle of a batch cost, landed. Its own table because a warehouse may read batches and may not read money.';

insert into public.batch_costs (batch_id, vvp, breakdown)
select id, vvp, vvp_breakdown from public.batches where vvp is not null
on conflict (batch_id) do nothing;

alter table public.batches drop column if exists vvp;
alter table public.batches drop column if exists vvp_breakdown;

alter table public.batch_costs enable row level security;

select public.reset_policies('batch_costs');
create policy "batch costs: staff only" on public.batch_costs for all
  using (public.is_staff())
  with check (public.is_staff());

-- The log of every recalculation follows the same eyes as the number itself.
select public.reset_policies('batch_cost_log');
create policy "batch cost log: staff only" on public.batch_cost_log for all
  using (public.is_staff())
  with check (public.is_staff());

-- ── Stock: your own place, or your own hands ─────────────────────────────────
--
-- Staff see everything — the owner cannot run a warehouse she is not allowed to
-- look at. A warehouse member sees the location they work at, and whatever they
-- are carrying themselves (migration 112), and nothing else.
select public.reset_policies('stock_movements');
create policy "stock moves: read" on public.stock_movements for select
  using (
    public.is_staff()
    or (
      public.has_perm('warehouse.view')
      and (public.place_is_mine(location_id) or holder_id = auth.uid())
    )
  );
create policy "stock moves: write" on public.stock_movements for insert
  with check (
    public.is_staff()
    or (
      public.has_perm('warehouse.receive')
      and (public.place_is_mine(location_id) or holder_id = auth.uid())
    )
  );
create policy "stock moves: update" on public.stock_movements for update
  using (
    public.is_staff()
    or (public.has_perm('warehouse.receive') and public.place_is_mine(location_id))
  );
create policy "stock moves: delete" on public.stock_movements for delete
  using (
    public.is_staff()
    or (public.has_perm('warehouse.receive') and public.place_is_mine(location_id))
  );

-- ── Batches: readable, writable where you work ───────────────────────────────
--
-- READ stays open to the warehouse on purpose. Signing goods in means reading
-- the production batch they came off — its number, its best-before — and that
-- batch lives on Curaçao, not at their place. A batch number is not a secret;
-- the cost price was, and it has moved.
select public.reset_policies('batches');
create policy "batches: read" on public.batches for select
  using (public.has_perm('warehouse.view') or public.is_staff());
create policy "batches: write" on public.batches for insert
  with check (
    public.is_staff()
    or (
      public.has_perm('warehouse.receive')
      and (public.place_is_mine(location_id) or holder_id = auth.uid())
    )
  );
create policy "batches: update" on public.batches for update
  using (
    public.is_staff()
    or (public.has_perm('warehouse.receive') and public.place_is_mine(location_id))
  );
create policy "batches: delete" on public.batches for delete
  using (public.is_staff());

commit;
