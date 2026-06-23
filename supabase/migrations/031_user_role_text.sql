-- Extend user_role enum to support all roles used in the app
-- The enum only had 'admin' and 'sales', causing current_user_role() to error for
-- staff/prospect/customer users, which broke RLS policies for those users.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'prospect';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'customer';

-- Return text so all role comparisons work uniformly
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role::text FROM public.users WHERE id = auth.uid();
$$;
