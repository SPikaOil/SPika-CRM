import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

/**
 * Which warehouses may serve a customer — and therefore which customers a
 * warehouse serves. One fact, read from both ends (migration 109).
 *
 * NULL is Curaçao, as everywhere else in this app.
 */
export type Place = string | null

export interface CustomerWarehouse {
  id: string
  customer_id: string
  location_id: string | null
}

/** Every link, for screens that need to look up several customers at once. */
export function useCustomerWarehouses() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['customer_warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_warehouses')
        .select('id, customer_id, location_id')
      if (error) return [] as CustomerWarehouse[]
      return (data ?? []) as CustomerWarehouse[]
    },
  })
}

/** The warehouses ticked for one customer. */
export function useWarehousesFor(customerId: string | null | undefined) {
  const { data, isLoading } = useCustomerWarehouses()
  return {
    data: (data ?? []).filter(w => w.customer_id === customerId).map(w => w.location_id),
    isLoading,
  }
}

/**
 * Set the whole list for one customer at once.
 *
 * Replaces rather than adds: the form hands over the ticks as they stand, and
 * working out the difference here keeps every caller from having to.
 */
export function useSetCustomerWarehouses() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, places }: { customerId: string; places: Place[] }) => {
      const { error: delErr } = await supabase
        .from('customer_warehouses')
        .delete()
        .eq('customer_id', customerId)
      if (delErr) throw new Error(delErr.message)
      if (places.length === 0) return
      const { error } = await supabase.from('customer_warehouses').insert(
        places.map(location_id => ({ customer_id: customerId, location_id })),
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer_warehouses'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
