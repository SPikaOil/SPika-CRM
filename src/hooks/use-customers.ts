import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Customer, ContactLogEntry } from '@/types'
import { toast } from 'sonner'

// By default this returns real customers only — leads are excluded at the
// source, so the customer list, order dropdowns and duplicate checks stay clean
// without touching each caller. Pass { leadsOnly: true } for the Leads page.
export function useCustomers(search?: string, category?: string, opts?: { leadsOnly?: boolean }) {
  const supabase = createClient()
  const leadsOnly = opts?.leadsOnly ?? false

  return useQuery({
    queryKey: ['customers', search, category, leadsOnly ? 'leads' : 'customers'],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*')
        .eq('is_lead', leadsOnly)
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

// Append a touchpoint to a customer's contact log. Read-modify-write on the
// jsonb column — fine here: single admin, ~26 customers, no concurrent writers.
export function useAddContactLog() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ customerId, entry }: { customerId: string; entry: Omit<ContactLogEntry, 'id' | 'created_at'> }) => {
      const { data: current, error: readError } = await supabase
        .from('customers')
        .select('contact_log')
        .eq('id', customerId)
        .single()
      if (readError) throw readError

      const log = (((current as any)?.contact_log ?? []) as ContactLogEntry[])
      const full: ContactLogEntry = {
        ...entry,
        id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
        created_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('customers')
        .update({ contact_log: [full, ...log] })
        .eq('id', customerId)
      if (error) throw error
    },
    onSuccess: (_d, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ['customers', customerId] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Contact logged')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteContactLog() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ customerId, entryId }: { customerId: string; entryId: string }) => {
      const { data: current, error: readError } = await supabase
        .from('customers')
        .select('contact_log')
        .eq('id', customerId)
        .single()
      if (readError) throw readError

      const log = (((current as any)?.contact_log ?? []) as ContactLogEntry[]).filter(e => e.id !== entryId)
      const { error } = await supabase.from('customers').update({ contact_log: log }).eq('id', customerId)
      if (error) throw error
    },
    onSuccess: (_d, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ['customers', customerId] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Contact removed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
