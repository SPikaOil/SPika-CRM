-- 085: campaigns, and material aimed at one reseller instead of all of them.
--
-- NOT RUN YET.
--
-- Her decision, 2026-08-16: a two-month event with La Bandera has posts and
-- photos that only La Bandera should see. Drive stays as the file host.
--
-- WHAT THIS DOES NOT DO, and she knows: Drive has two settings, "restricted"
-- and "anyone with the link". There is nothing in between and no expiring
-- link. We use the second. So this hides the ROW — another reseller cannot
-- find it, list it or ask for it — but the FILE stays open to whoever holds
-- the link. Forwarded, it opens. That is fine for co-branded material meant to
-- be posted publicly, which is what this is for. Anything genuinely
-- confidential belongs in Supabase Storage with an expiring link instead.
--
-- Aimed per ASSET, not per category. A category says what KIND of thing
-- something is — a print, a clip, a photo — and an audience is a different
-- axis. Mixing them gives you "Prints" and "Prints — La Bandera" side by side,
-- and that event has prints AND clips AND photos anyway: one audience, several
-- categories. Same reasoning as is_physical in 072, which is a flag per asset
-- for the same reason.
--
-- And a campaign on top, because tagging thirty assets one at a time is how it
-- goes wrong. A campaign carries the audience; its assets inherit it.

begin;

-- ── Campaigns ─────────────────────────────────────────────────────────────

create table if not exists public.marketing_campaigns (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  name        text not null,
  starts_on   date,
  ends_on     date,
  goal        text not null default '',
  -- Where the thinking lives: what we agreed, what worked, what to try next.
  -- Next to the material it is about, not in a document somebody has to find.
  notes       text not null default '',
  ideas       jsonb not null default '[]'::jsonb,

  visibility  text not null default 'all' check (visibility in ('all', 'selected', 'staff')),
  is_active   boolean not null default true,
  created_by  uuid references public.users(id) on delete set null
);

comment on table public.marketing_campaigns is
  'An event or push, with its period, its thinking, and who it is for. Assets point at it and inherit its audience.';

create table if not exists public.marketing_campaign_customers (
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  primary key (campaign_id, customer_id)
);

-- ── Assets: a third audience, and a campaign to belong to ─────────────────

alter table public.marketing_assets
  add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null;

alter table public.marketing_assets
  drop constraint if exists marketing_assets_visibility_check;

alter table public.marketing_assets
  add constraint marketing_assets_visibility_check
  check (visibility in ('all', 'selected', 'staff', 'campaign'));

comment on column public.marketing_assets.visibility is
  'all = every reseller. selected = only the resellers in marketing_asset_customers. campaign = whoever the campaign is for. staff = internal only.';

create table if not exists public.marketing_asset_customers (
  asset_id    uuid not null references public.marketing_assets(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  primary key (asset_id, customer_id)
);

create index if not exists marketing_assets_campaign_idx on public.marketing_assets (campaign_id);

-- Switched on right here as well as inside reset_policies() further down.
-- Supabase reads the text of a migration before it runs it and cannot see
-- through a function call, so without these three lines it warns that the
-- tables are open. They were not, but a warning nobody can verify at a glance
-- is worth one line each to remove.
alter table public.marketing_campaigns          enable row level security;
alter table public.marketing_campaign_customers enable row level security;
alter table public.marketing_asset_customers    enable row level security;


-- ── One place that answers "may this reseller see this?" ──────────────────
--
-- security definer on purpose: it reads marketing_assets, and it is called
-- FROM the policy on marketing_assets. Without that the policy would recurse.
create or replace function public.marketing_asset_visible_to_me(a_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from public.marketing_assets a
    left join public.marketing_campaigns c on c.id = a.campaign_id
    where a.id = a_id
      and a.is_active
      and case a.visibility
        when 'all' then true
        when 'selected' then exists (
          select 1 from public.marketing_asset_customers ac
          where ac.asset_id = a.id
            and ac.customer_id = public.current_user_customer_id())
        when 'campaign' then c.is_active and (
          c.visibility = 'all'
          or (c.visibility = 'selected' and exists (
                select 1 from public.marketing_campaign_customers cc
                where cc.campaign_id = c.id
                  and cc.customer_id = public.current_user_customer_id())))
        else false
      end
  );
$$;

-- ── Policies ──────────────────────────────────────────────────────────────

select public.reset_policies('marketing_assets');
create policy "marketing: read" on public.marketing_assets for select
  using (
    public.is_staff()
    or public.can_manage_marketing()
    or public.marketing_asset_visible_to_me(id)
  );
create policy "marketing: insert" on public.marketing_assets for insert
  with check (public.can_manage_marketing());
create policy "marketing: update" on public.marketing_assets for update
  using (public.can_manage_marketing());
create policy "marketing: delete" on public.marketing_assets for delete
  using (public.can_manage_marketing());

select public.reset_policies('marketing_campaigns');
create policy "campaigns: read" on public.marketing_campaigns for select
  using (
    public.is_staff()
    or public.can_manage_marketing()
    or (is_active and visibility <> 'staff' and (
          visibility = 'all'
          or exists (select 1 from public.marketing_campaign_customers cc
                     where cc.campaign_id = id
                       and cc.customer_id = public.current_user_customer_id())))
  );
create policy "campaigns: write" on public.marketing_campaigns for insert
  with check (public.can_manage_marketing());
create policy "campaigns: edit" on public.marketing_campaigns for update
  using (public.can_manage_marketing());
create policy "campaigns: remove" on public.marketing_campaigns for delete
  using (public.can_manage_marketing());

-- The two link tables carry no content of their own — they say who something
-- is for. A reseller may read the row that names THEM and no other, so the
-- portal can say "this one is yours" without handing over the guest list.
select public.reset_policies('marketing_asset_customers');
create policy "asset audience: read" on public.marketing_asset_customers for select
  using (public.is_staff() or public.can_manage_marketing()
         or customer_id = public.current_user_customer_id());
create policy "asset audience: write" on public.marketing_asset_customers for all
  using (public.can_manage_marketing()) with check (public.can_manage_marketing());

select public.reset_policies('marketing_campaign_customers');
create policy "campaign audience: read" on public.marketing_campaign_customers for select
  using (public.is_staff() or public.can_manage_marketing()
         or customer_id = public.current_user_customer_id());
create policy "campaign audience: write" on public.marketing_campaign_customers for all
  using (public.can_manage_marketing()) with check (public.can_manage_marketing());

commit;
