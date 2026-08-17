-- 080: a reseller gets a named contact at SPika — and the team can see itself again.
--
-- NOT RUN YET. Check the screens in the preview first.
--
-- The portal support page has promised "Your Account Manager" since it was
-- written, and has never once shown one. It reads customers.assigned_to, a
-- column that does not exist (assigned_to lives on leads, orders, tasks and
-- deliveries — never on customers), and then reads a table called `profiles`,
-- which does not exist either. Both errors are swallowed, so the card simply
-- never renders and nobody noticed.
--
-- Her decision, 2026-08-16: build it for real.
--
--   Assigning the account manager  →  customers.edit  (admin + manager today)
--   Seeing who it is               →  the customer, through a server route that
--                                     returns three fields and nothing else
--
-- No new permission key: pointing at a customer's account manager IS editing
-- that customer, and customers.edit already says who may do that.

begin;

alter table public.customers
  add column if not exists assigned_to uuid references public.users(id) on delete set null;

comment on column public.customers.assigned_to is
  'The person at SPika this reseller belongs to. Shown in their portal.';

create index if not exists customers_assigned_to_idx on public.customers (assigned_to);

-- ── The team list, which 076 took away ────────────────────────────────────
--
-- Migration 076 closed a privilege escalation on `users` by rebuilding its
-- policies as "read your own row, admin writes". Correct — but it also means a
-- manager, sales or warehouse account can no longer read the team list, and
-- useUsers() reads public.users straight from the browser. Seven screens feed
-- an "assign to" dropdown from it: dashboard, delivery, handover, orders/new,
-- orders/[id], quotations/[id] and tasks. For anyone who is not an admin, every
-- one of those dropdowns has been showing exactly one name — their own.
--
-- Same shape as customer_names: deliberately NOT security_invoker, because the
-- point is to reach past the rule on `users`. The check lives inside the view,
-- and the columns are the ones a colleague may know about a colleague. No
-- mfa_required, no customer_id, no customer_role.
create or replace view public.team_members as
  select id, email, name, phone, role, is_active, created_at
  from public.users
  where public.is_team()
    and role <> 'customer';

comment on view public.team_members is
  'Colleagues, for assign-to dropdowns. Never portal accounts. Read-only by construction.';

revoke all on public.team_members from anon;
grant select on public.team_members to authenticated;

commit;
