import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Customer } from '@/types'
import { toast } from 'sonner'

export function useCustomers(search?: string, category?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['customers', search, category],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*')
        .order('company_name')

      if (search) {
        query = query.or(
          `company_name.ilike.%${search}%,contact_person.ilike.%${search}%,email.ilike.%${search}%`
        )
      }
      if (category && category !== 'all') {
        query = query.eq('customer_category', category)
      }

      const { data, error } = await query
      if (error) throw error
      return data as Customer[]
    },
  })
}

export function useCustomer(id: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['customers', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Customer
    },
    enabled: !!id,
  })
}

export function useCreateCustomer() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Partial<Customer>) => {
      const { data, error } = await supabase
        .from('customers')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data as Customer
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateCustomer() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: Partial<Customer>
    }) => {
      const { data, error } = await supabase
        .from('customers')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Customer
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customers', id] })
      toast.success('Customer updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
