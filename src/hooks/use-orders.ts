import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Order, OrderStatus } from '@/types'
import { toast } from 'sonner'

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
      return data as Order[]
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
      return data as Order[]
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
      return data as Order[]
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
      return data as Order
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
      toast.success('Order updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
