-- Migrate user_role from enum to text to support all roles: admin, sales, staff, prospect, customer
-- The enum only had 'admin' and 'sales', causing current_user_role() to error for other roles,
-- which broke RLS policies across all tables for non-admin/sales users.

ALTER TABLE public.users ALTER COLUMN role TYPE text;

DROP TYPE IF EXISTS user_role;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;
