-- Staff deactivation: visible flag on the profile row.
-- The auth ban (banned_until) remains the login-blocking enforcement;
-- is_active is the display state the app reads. Both are always set
-- together by the deactivate/reactivate endpoints — never flip one alone.

alter table public.users
  add column if not exists is_active boolean not null default true;

-- Backfill: staff already banned via the old "delete" button become inactive
update public.users u
set is_active = false
from auth.users a
where a.id = u.id
  and a.banned_until is not null
  and a.banned_until > now();
