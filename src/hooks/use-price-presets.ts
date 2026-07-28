import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { OrderCurrency } from '@/types'

export interface PricePreset {
  id: string
  category: string
  label: string
  /** The currency this category's prices are ENTERED in — never converted. */
  currency: OrderCurrency
  prices: Record<string, number>
  discounts: Record<string, number>
  products: string[]
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
    mutationFn: async ({ id, prices, discounts, products, currency }: { id: string; prices: Record<string, number>; discounts: Record<string, number>; products: string[]; currency: OrderCurrency }) => {
      const { error } = await supabase
        .from('price_presets')
        .update({ prices, discounts, products, currency, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price_presets'] })
    },
  })
}

export function useCreatePricePreset() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ category, label, currency }: { category: string; label: string; currency: OrderCurrency }) => {
      const { error } = await supabase
        .from('price_presets')
        .insert({ category, label, currency, prices: {}, discounts: {} })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price_presets'] })
    },
  })
}

export function useDeletePricePreset() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('price_presets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price_presets'] })
    },
  })
}
