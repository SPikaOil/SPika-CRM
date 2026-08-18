import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * The reseller list, names only.
 *
 * Reads the `customer_names` view from migration 077, not the customers table.
 * Marketing is kept out of `customers` on purpose — that table carries the
 * orders, the price agreement and the internal notes. The view carries the
 * company, the city, the country and nothing else, and checks
 * customernames.view for itself.
 */
export interface CustomerName {
  id: string
  company_name: string
  customer_number: string | null
  city: string | null
  country: string | null
  is_lead: boolean
  status: string
}

export function useCustomerNames() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['customer-names'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_names')
        .select('*')
        .order('company_name')
      if (error) throw error
      return (data ?? []) as CustomerName[]
    },
  })
}
