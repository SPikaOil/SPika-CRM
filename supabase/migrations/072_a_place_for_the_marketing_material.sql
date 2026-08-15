-- Marketing assets: the material a retailer needs to actually sell SPika.
--
-- NOT RUN YET. The screens are checked first; this follows only after approval.
--
-- The heavy files themselves are NOT in this database and NOT in Supabase
-- Storage. Retailers need the original in full resolution, and this project sits
-- on the free plan: 1 GB total, 5 GB egress a month, 50 MB per file — a quota
-- shared with the signed invoices in pod-files. One campaign of clips would eat
-- the allowance that serves our proof documents. So `file_ref` holds a Google
-- Drive file id and the download goes straight from Google to the retailer.
--
-- Drive has no short-lived signed link, so those files are set to "anyone with
-- the link". Unguessable, not secret. Anything that must stay secret (price
-- lists, margins) uses source 'storage' plus visibility 'staff' and never gets
-- a Drive link.

begin;

create table if not exists public.marketing_assets (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  title          text not null,
  description    text,
  category       text not null,
  -- Labelled by USE ('print', 'social', 'whatsapp', 'share'), never by format.
  -- A shop manager knows they are printing a sign; they do not know they need
  -- 4000px. Getting this wrong puts a blurry shelf talker in a store.
  use_label      text,

  source         text not null default 'drive' check (source in ('drive', 'storage')),
  file_ref       text not null,
  file_kind      text,

  usage_terms    text,
  visibility     text not null default 'all' check (visibility in ('all', 'staff')),

  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  download_count integer not null default 0,
  created_by     uuid references public.users(id) on delete set null,

  -- A physical version a reseller can ask us to send. Deliberately a flag per
  -- ASSET and not "category = pos": a printed recipe card is just as physical,
  -- and keying this to the category would mean rebuilding the day she has
  -- those printed.
  is_physical        boolean not null default false,
  -- Off when the print run is out — the button disappears in the portal
  -- instead of collecting requests we cannot fulfil.
  physical_available boolean not null default true
);

create index if not exists marketing_assets_active_idx
  on public.marketing_assets (is_active, category, sort_order);

-- Price material must never be handed to customers. Enforced here as well as in
-- the form, because the form is only a screen and this is the actual rule.
alter table public.marketing_assets
  drop constraint if exists marketing_assets_sales_is_staff_only;
alter table public.marketing_assets
  add constraint marketing_assets_sales_is_staff_only
  check (category <> 'sales' or visibility = 'staff');

alter table public.marketing_assets enable row level security;

-- Policy names must be unique per TABLE, not per command, so the command goes
-- in the name. Dropped first so this migration can be re-run.
drop policy if exists "marketing: read staff or published" on public.marketing_assets;
drop policy if exists "marketing: insert staff"            on public.marketing_assets;
drop policy if exists "marketing: update staff"            on public.marketing_assets;
drop policy if exists "marketing: delete staff"            on public.marketing_assets;

-- Who may PUBLISH marketing material: the owner, and the Marketing role.
--
-- Deliberately NOT public.is_staff(). Adding 'marketing' to is_staff() would
-- hand that person every customer and every order as well, because the policies
-- from migration 050 all hang off that one function. Marketing keeps the asset
-- library current and touches nothing else — and that is enforced here, not
-- only by hiding screens.
create or replace function public.can_manage_marketing()
returns boolean language sql security definer stable as $$
  select coalesce(public.current_user_role()::text, '') in ('admin', 'marketing');
$$;

-- Staff and marketing see everything; a signed-in customer sees only active,
-- published rows.
create policy "marketing: read staff or published"
  on public.marketing_assets for select
  using (
    public.is_staff()
    or public.can_manage_marketing()
    or (is_active and visibility = 'all')
  );

create policy "marketing: insert staff" on public.marketing_assets for insert with check (public.can_manage_marketing());
create policy "marketing: update staff" on public.marketing_assets for update using  (public.can_manage_marketing());
create policy "marketing: delete staff" on public.marketing_assets for delete using  (public.can_manage_marketing());

-- Download counter.
--
-- SECURITY DEFINER on purpose: a customer may NOT update marketing rows, but
-- must be able to bump this one number. This function is the only write they
-- get, it touches a single column, and it cannot be aimed at anything else.
create or replace function public.bump_marketing_download(asset_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.marketing_assets
     set download_count = download_count + 1
   where id = asset_id
     and is_active
     and (public.is_staff() or visibility = 'all');
$$;

revoke all on function public.bump_marketing_download(uuid) from public;
grant execute on function public.bump_marketing_download(uuid) to authenticated;

commit;
