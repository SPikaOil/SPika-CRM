-- 104: a customer keeps its papers, and may be shown them
--
-- Danique, 2026-08-20: "het consignatie contract van la bandera wil ik in het
-- account toevoegen, en ook dat als ze inloggen op portal dat ze ook daar kopie
-- kunnen inzien."
--
-- There was nowhere to put it. `sales_documents` exists but is company-wide and
-- readable by everyone who signs in, so La Bandera's contract would sit in
-- front of every other reseller. The OB form works, but it is ONE form with
-- four columns of its own on `customers` — a pattern that does not survive a
-- second document type, let alone a third.
--
-- So: documents belong to a customer, and each one says for itself whether the
-- customer may see it. The consignment contract today; a price agreement, an
-- NDA or a signed delivery agreement tomorrow, with no further migrations.
--
-- WHERE THE FILE LIVES: `pod-files`, under `contracts/`. Not a new bucket, and
-- that is deliberate — a Make.com scenario watches storage through a webhook
-- that fires on EVERY bucket while its download step only reads pod-files. A
-- new bucket therefore produces 404s until Make disables the scenario, and the
-- signed invoices quietly stop reaching Drive. That has happened twice. Files
-- put here are copied to Drive like everything else, which Danique agreed to.
--
-- The bucket is effectively append-only: an overwrite is refused. A new version
-- of a contract is therefore a NEW row, not a replacement — which is what you
-- want from a contract anyway, because you have to be able to see which version
-- was in force when.

begin;

create table if not exists public.customer_documents (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers(id) on delete cascade,

  name              text not null,
  category          text not null default 'other'
                      check (category in ('contract', 'agreement', 'certificate', 'other')),
  -- The PATH inside pod-files, never a public URL: the bucket has no public
  -- read, so a public URL is a dead link that would also be a leak if it were
  -- not dead. Served through a short-lived signed URL — see lib/storage.ts.
  file_url          text not null,
  file_name         text not null,
  file_size         bigint,

  -- Off by default. Uploading a document and showing it to the customer are two
  -- decisions, and the second one is not made by accident.
  visible_in_portal boolean not null default false,

  notes             text not null default '',
  uploaded_by       uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

comment on table public.customer_documents is
  'Papers that belong to one customer: contracts, agreements, certificates. file_url is a PATH inside pod-files. visible_in_portal decides whether the reseller sees it when they log in.';

comment on column public.customer_documents.visible_in_portal is
  'False by default: uploading and publishing are two separate decisions.';

create index if not exists customer_documents_customer_idx
  on public.customer_documents (customer_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Staff manage them. A portal customer reads their OWN, and only the ones that
-- were deliberately switched on — never anything else, and never a write.
alter table public.customer_documents enable row level security;

drop policy if exists "customer documents: staff manage" on public.customer_documents;
drop policy if exists "customer documents: portal reads own" on public.customer_documents;

create policy "customer documents: staff manage"
  on public.customer_documents for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "customer documents: portal reads own"
  on public.customer_documents for select
  to authenticated
  using (
    visible_in_portal
    and customer_id = public.current_user_customer_id()
  );

commit;
