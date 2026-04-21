import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Lead, LeadStage } from '@/types'
import { toast } from 'sonner'

export function useLeads(stage?: LeadStage, assignedTo?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['leads', stage, assignedTo],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*, customer:customers(*), assigned_user:users(*)')
        .order('updated_at', { ascending: false })

      if (stage) query = query.eq('stage', stage)
      if (assignedTo && assignedTo !== 'all') query = query.eq('assigned_to', assignedTo)

      const { data, error } = await query
      if (error) throw error
      return data as Lead[]
    },
  })
}

export function useCreateLead() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Partial<Lead>) => {
      const { data, error } = await supabase
        .from('leads')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateLead() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Lead> }) => {
      const { data, error } = await supabase
        .from('leads')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
