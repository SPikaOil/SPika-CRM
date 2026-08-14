-- 061: a customer reports something wrong with what they received
--
-- From the consignment agreement, and it applies just as well to a normal
-- order:
--
--   Art 2.4  Visible shortages and damage are noted on the delivery document at
--            handover. After signing they are no longer accepted.
--   Art 2.5  Hidden defects can be reported afterwards: in writing, within five
--            working days of discovery, quoting the BATCH NUMBER and with
--            PHOTOGRAPHS. The product is not sold and stays available for
--            inspection.
--   Art 4.3  If the cause is a defect attributable to SPika, the customer owes
--            nothing.
--   Art 4.4  Otherwise damaged or unsellable goods count as sold and are
--            payable at the consignment price.
--
-- So a report has two halves, and they belong to different people. The customer
-- states WHAT is wrong, how many, from which batch, with a photo. Only SPika
-- decides WHOSE risk it is — that single choice is the difference between a
-- write-off and an invoice line, and a customer cannot be the one to make it.
--
-- The reason is a fixed list, not free text. Danique asked for a way to stop
-- someone typing "aaaa" to get past the field; a list is the only thing that
-- actually works, and it is also the only way these ever add up in a report.

begin;

do $$ begin
  -- Two kinds, and the difference decides how long you may report them.
  --
  -- VISIBLE ON RECEIPT — damaged, missing, wrong_product, tht_too_short. You
  -- see these when the box is opened, and the customer signs for receipt, so
  -- they are only accepted within 48 hours (art. 2.4).
  --
  -- HIDDEN — leaking, not_sealed, dirty, quality, other. These only surface
  -- when a bottle is picked up or opened, so they can be reported at any time
  -- during the term (art. 2.5).
  create type defect_reason as enum (
    'damaged',        -- broken, dented, crushed
    'missing',        -- short in the box
    'wrong_product',
    'tht_too_short',
    'leaking',
    'not_sealed',
    'dirty',          -- bottle dirty inside or out
    'quality',        -- taste, colour, smell
    'other'           -- forces a written explanation
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  -- Who carries it. Null until SPika has judged the report.
  create type defect_liability as enum (
    'spika',          -- art 4.3 — our defect, customer owes nothing
    'customer',       -- art 4.4 — their risk, counts as sold
    'carrier'         -- damaged in transit, claimed with the carrier
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type defect_status as enum ('open', 'accepted', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists public.defect_reports (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  customer_id   uuid not null references public.customers(id),
  -- Which run it came in on, when the customer knows. Null = the order at large.
  delivery_id   uuid references public.deliveries(id) on delete set null,

  sku           text not null references public.products(sku),
  qty           integer not null check (qty > 0),
  -- Art 2.5 asks for the batch number explicitly.
  batch_number  text not null default '',
  reason        defect_reason not null,
  -- Only required when the reason is 'other'; enforced below.
  note          text not null default '',
  -- Storage PATH, never a public URL — served through a signed URL like every
  -- other proof document in this app.
  photo_url     text,

  status        defect_status not null default 'open',
  liability     defect_liability,
  resolution    text not null default '',

  reported_by   uuid references public.users(id),
  reported_at   timestamptz not null default now(),
  reviewed_by   uuid references public.users(id),
  reviewed_at   timestamptz
);

-- "Other" without an explanation is not a report, it is a shrug.
alter table public.defect_reports drop constraint if exists defect_reports_other_needs_note;
alter table public.defect_reports add constraint defect_reports_other_needs_note
  check (reason <> 'other' or length(btrim(note)) >= 10);

-- A judged report has to say who carries it.
alter table public.defect_reports drop constraint if exists defect_reports_judged_needs_liability;
alter table public.defect_reports add constraint defect_reports_judged_needs_liability
  check (status = 'open' or liability is not null);

create index if not exists defect_reports_order_idx    on public.defect_reports (order_id);
create index if not exists defect_reports_customer_idx on public.defect_reports (customer_id);
create index if not exists defect_reports_status_idx   on public.defect_reports (status);

comment on table public.defect_reports is
  'Something wrong with what was received. The customer states what and how many; SPika decides whose risk it is.';

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Staff see and judge everything. A portal customer may report on their OWN
-- orders and read back what they reported — never anyone else's, and never the
-- liability decision, which only staff may write.
alter table public.defect_reports enable row level security;

drop policy if exists "defect_reports: staff all"        on public.defect_reports;
drop policy if exists "defect_reports: customer read"    on public.defect_reports;
drop policy if exists "defect_reports: customer report"  on public.defect_reports;

create policy "defect_reports: staff all"
  on public.defect_reports for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "defect_reports: customer read"
  on public.defect_reports for select
  to authenticated
  using (customer_id = public.current_user_customer_id());

create policy "defect_reports: customer report"
  on public.defect_reports for insert
  to authenticated
  with check (
    customer_id = public.current_user_customer_id()
    -- A customer files an open report and nothing more. The judgement is ours.
    and status = 'open'
    and liability is null
  );

commit;
