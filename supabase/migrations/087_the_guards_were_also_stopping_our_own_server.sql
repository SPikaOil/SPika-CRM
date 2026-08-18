-- 087: the column guards were refusing our own server key.
--
-- NOT RUN YET.
--
-- Found while testing 086, not by reading it. Setting the scene for the test
-- meant creating a campaign aimed at one reseller, with the service key, and
-- that came back:
--
--   42501  Only an admin can decide who a campaign is for
--
-- The guards from 081 and 086 ask has_perm(...), which asks
-- current_user_role(), which reads public.users where id = auth.uid(). Under
-- the service key there is no auth.uid() at all, so the role comes back empty,
-- so every check says no. The browser was never the problem — our own backend
-- was.
--
-- Nothing in the app writes those columns from a server route today; I checked
-- all sixteen. So this is a trap rather than a live break, and it is exactly
-- the kind that goes off months later inside something unrelated.
--
-- The fix is to let a call with no session through. That is not a hole: the
-- service key already bypasses every row-level policy in this database by
-- design, and whoever holds it could drop these triggers outright. A guard that
-- stops it adds no safety and only breaks server code in a way nobody will
-- connect back to here. It guards the BROWSER, and a browser always has a
-- session.

begin;

create or replace function public.guard_assignment()
returns trigger language plpgsql security definer as $$
begin
  -- No session = our own server on the service key, which every admin route
  -- already runs on. See the note at the top of this migration.
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.assigned_to is not null and not public.has_perm('work.assign') then
      raise exception 'Only an admin can assign this to someone. Leave it unassigned and it will be allocated.'
        using errcode = '42501';
    end if;
  elsif new.assigned_to is distinct from old.assigned_to
        and not public.has_perm('work.assign') then
    raise exception 'Only an admin can change who this is assigned to'
      using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.guard_delivery_assignment()
returns trigger language plpgsql security definer as $$
declare order_assignee uuid;
begin
  if auth.uid() is null then return new; end if;
  if public.has_perm('work.assign') then return new; end if;
  if new.assigned_to is null or new.assigned_to = auth.uid() then return new; end if;

  select assigned_to into order_assignee from public.orders where id = new.order_id;
  if new.assigned_to is distinct from order_assignee then
    raise exception 'Only an admin can put someone else on this delivery'
      using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.guard_marketing_aim()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is null then return new; end if;
  if public.can_allocate_marketing() then return new; end if;

  if tg_op = 'INSERT' then
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

create or replace function public.guard_campaign_aim()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is null then return new; end if;
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

commit;
