import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface PricePreset {
  id: string
  category: string
  label: string
  prices: Record<string, number>
  discounts: Record<string, number>
  updated_at: string
}

export function usePricePresets() {
  const supabase = createClient()
  return useQuery<PricePreset[]>({
    queryKey: ['price_presets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_presets')
        .select('*')
        .order('category')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdatePricePreset() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, prices, discounts }: { id: string; prices: Record<string, number>; discounts: Record<string, number> }) => {
      const { error } = await supabase
        .from('price_presets')
        .update({ prices, discounts, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price_presets'] })
    },
  })
}
