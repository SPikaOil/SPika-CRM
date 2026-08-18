-- 086: making material and deciding who gets it are two different rights.
--
-- NOT RUN YET.
--
-- Her decision, 2026-08-16: "het bepalen van welke asset bij elke klant hoort
-- moet ik te bepalen zijn in permissions, initieel is enkel Admin die een asset
-- kan aanmaken en kan alloceren aan een klant of aan een campagne."
--
-- So the one right splits in two:
--
--   marketing.manage    add and edit assets and campaigns
--   marketing.allocate  decide WHO sees them — visibility, the campaign an
--                       asset belongs to, and the reseller lists
--
-- Both are seeded to NOBODY. Admin holds them because admin holds everything,
-- and both switches sit on the Permissions screen for the day a marketing
-- person is actually hired. NOTE: marketing.manage was held by the marketing
-- role by default until now. This takes that away, on purpose, because she
-- asked for admin-only to start with — tick it back on when the person exists.
--
-- And while we are in here: can_manage_marketing() from 072 named its roles
-- outright —
--
--   select current_user_role() in ('admin', 'marketing')
--
-- which is the exact pattern the whole of 077 was about removing. A sixth role
-- would fall outside it silently. It reads the permission now, like everything
-- else, so the Permissions screen governs this too.
--
-- Aiming is a COLUMN on the asset, and row-level security decides per row, not
-- per field. So the aiming columns are guarded by a trigger — the same shape as
-- guard_assignment() in 081.

begin;

-- ── The gate that 072 hardcoded ───────────────────────────────────────────

create or replace function public.can_manage_marketing()
returns boolean language sql security definer stable as $$
  select public.has_perm('marketing.manage');
$$;

comment on function public.can_manage_marketing is
  'May add and edit marketing material. Reads marketing.manage from role_permissions; admin is always true inside has_perm().';

create or replace function public.can_allocate_marketing()
returns boolean language sql security definer stable as $$
  select public.has_perm('marketing.allocate');
$$;

comment on function public.can_allocate_marketing is
  'May decide WHO sees a piece of material — its visibility, its campaign, and the reseller lists.';

-- Neither is seeded to a role. Admin already passes both.
update public.role_permissions
   set permissions = array(select distinct unnest(permissions)
                           except select unnest(array['marketing.manage', 'marketing.allocate'])),
       updated_at = now()
 where role <> 'admin';

-- ── Aiming is guarded per column ──────────────────────────────────────────

create or replace function public.guard_marketing_aim()
returns trigger language plpgsql security definer as $$
begin
  if public.can_allocate_marketing() then return new; end if;

  if tg_op = 'INSERT' then
    -- Making an asset is allowed without this right; aiming it is not. A new
    -- one may therefore only land on the default, "every reseller".
    if new.visibility <> 'all' or new.campaign_id is not null then
      raise exception 'Only an admin can decide who a piece of material is for'
        using errcode = '42501';
    end if;
  elsif new.visibility is distinct from old.visibility
     or new.campaign_id is distinct from old.campaign_id then
    raise exception 'Only an admin can change who a piece of material is for'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists marketing_assets_guard_aim on public.marketing_assets;
create trigger marketing_assets_guard_aim
  before insert or update on public.marketing_assets
  for each row execute function public.guard_marketing_aim();

create or replace function public.guard_campaign_aim()
returns trigger language plpgsql security definer as $$
begin
  if public.can_allocate_marketing() then return new; end if;
  if tg_op = 'INSERT' then
    if new.visibility <> 'all' then
      raise exception 'Only an admin can decide who a campaign is for'
        using errcode = '42501';
    end if;
  elsif new.visibility is distinct from old.visibility then
    raise exception 'Only an admin can change who a campaign is for'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists marketing_campaigns_guard_aim on public.marketing_campaigns;
create trigger marketing_campaigns_guard_aim
  before insert or update on public.marketing_campaigns
  for each row execute function public.guard_campaign_aim();

-- ── The reseller lists follow the same right ──────────────────────────────

select public.reset_policies('marketing_asset_customers');
create policy "asset audience: read" on public.marketing_asset_customers for select
  using (public.is_staff() or public.can_manage_marketing()
         or customer_id = public.current_user_customer_id());
create policy "asset audience: write" on public.marketing_asset_customers for all
  using (public.can_allocate_marketing()) with check (public.can_allocate_marketing());

select public.reset_policies('marketing_campaign_customers');
create policy "campaign audience: read" on public.marketing_campaign_customers for select
  using (public.is_staff() or public.can_manage_marketing()
         or customer_id = public.current_user_customer_id());
create policy "campaign audience: write" on public.marketing_campaign_customers for all
  using (public.can_allocate_marketing()) with check (public.can_allocate_marketing());

commit;
