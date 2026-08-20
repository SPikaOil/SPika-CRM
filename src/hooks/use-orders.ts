import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Order, OrderStatus, Delivery } from '@/types'
import { toast } from 'sonner'

/**
 * Since migration 058 an order can have several deliveries, so PostgREST hands
 * back a LIST where it used to hand back one object. Every screen that reads
 * `order.delivery` would silently see an array instead.
 *
 * So the list is kept as `deliveries` and `delivery` is set to the LAST run —
 * the one that finished the order, which is what the delivery date, the signer
 * and the proof of delivery have always meant on those screens.
 */
function withDeliveries<T extends Record<string, unknown>>(rows: T[] | null): Order[] {
  return ((rows ?? []) as unknown as Order[]).map(order => {
    const raw = (order as unknown as { delivery?: Delivery | Delivery[] }).delivery
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    const sorted = [...list].sort((a, b) =>
      String(a.delivered_at ?? a.created_at ?? '').localeCompare(String(b.delivered_at ?? b.created_at ?? ''))
    )
    /**
     * `delivery` is the last one that actually HAPPENED.
     *
     * Every screen reading it wants proof: the signature, the photo, the table
     * bottles that came back, the signed PDF. Since migration 105 a run can sit
     * here PREPARED, with none of that — and being the newest row it would take
     * this spot and blank out the proof of a delivery that really did occur.
     * The full list stays in `deliveries` for anything that wants both.
     */
    const done = sorted.filter(d => d.delivered_at)
    return {
      ...order,
      deliveries: sorted,
      delivery: done[done.length - 1] ?? sorted[sorted.length - 1],
    } as Order
  })
}

export function useMyOrders(userId?: string, isAdmin?: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['orders', 'mine', userId, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('*, customer:customers(*), assigned_user:users!assigned_to(*), delivery:deliveries(*)')
        .order('planned_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (!isAdmin && userId) query = query.eq('assigned_to', userId)

      const { data, error } = await query
      if (error) throw error
      return withDeliveries(data)
    },
    enabled: !!userId || !!isAdmin,
  })
}

export function useCustomerOrders(customerId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['orders', 'customer', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, assigned_user:users!assigned_to(name), delivery:deliveries(*)')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return withDeliveries(data)
    },
    enabled: !!customerId,
  })
}

export function useOrders(status?: OrderStatus) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['orders', status],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('*, customer:customers(*), assigned_user:users!assigned_to(*), delivery:deliveries(*)')
        .order('created_at', { ascending: false })

      if (status && status !== ('all' as any)) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      return withDeliveries(data)
    },
  })
}

export function useOrder(id: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customer:customers(*), assigned_user:users!assigned_to(*), delivery:deliveries(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return withDeliveries([data])[0]
    },
    enabled: !!id,
  })
}

export function useCreateOrder() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Partial<Order>) => {
      const { data, error } = await supabase
        .from('orders')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data as Order
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Order created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateOrder() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Order> }) => {
      const { data, error } = await supabase
        .from('orders')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Order
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['orders', id] })
      // The Export screens hold their own copy of an order, read through the
      // transport it hangs on. Without these two, adding POS material on a
      // transport saved fine and then showed nothing at all until the page was
      // reloaded — Danique, 2026-08-19. Anything that edits an order from an
      // export screen lands here, so this is the one place it belongs.
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['export-orders'] })
      toast.success('Order updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
