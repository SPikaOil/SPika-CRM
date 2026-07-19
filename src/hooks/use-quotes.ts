import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Quote, QuoteTemplate } from '@/types'
import { toast } from 'sonner'

export function useQuotes() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*, customer:customers(*), creator:users(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Quote[]
    },
  })
}

export function useQuote(id: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['quotes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*, customer:customers(*), creator:users(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Quote
    },
    enabled: !!id,
  })
}

export function useQuoteTemplates() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['quote_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_templates')
        .select('*')
        .order('name')
      if (error) throw error
      return data as QuoteTemplate[]
    },
  })
}

export function useCreateQuote() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Partial<Quote>) => {
      const { data, error } = await supabase
        .from('quotes')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data as Quote
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteQuote() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quotes').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quotation deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// Quotes that already produced an order — these move to the archive
export function useConvertedQuoteIds() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['converted-quote-ids'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('quote_id').not('quote_id', 'is', null)
      return new Set((data ?? []).map((o: any) => o.quote_id as string))
    },
  })
}

export function useUpdateQuote() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Quote> }) => {
      const { data, error } = await supabase
        .from('quotes')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Quote
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      queryClient.invalidateQueries({ queryKey: ['quotes', id] })
      toast.success('Quote updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
