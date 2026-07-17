import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type PortalUser = {
  id: string
  name: string | null
  email: string | null
  customer_role: string | null
  last_seen_at: string | null
}

// Portal users linked to a customer — including anyone the customer invited
// from the portal, so admins see the full team in the CRM.
export function useCustomerPortalUsers(customerId?: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['customer-portal-users', customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<PortalUser[]> => {
      const { data } = await supabase
        .from('users')
        .select('id, name, email, customer_role, last_seen_at')
        .eq('customer_id', customerId!)
        .eq('role', 'customer')
        .order('customer_role') // owner first
      return (data ?? []) as PortalUser[]
    },
  })
}
