import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface ProductRecord {
  id: string
  sku: string
  name: string
  default_price: number
  weight_g: number | null
  bottles_per_carton: number | null
  box_height_cm: number | null
  box_length_cm: number | null
  box_width_cm: number | null
}

export function useProducts() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name')
      if (error) throw error
      return data as ProductRecord[]
    },
  })
}

export function useUpdateProduct() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<ProductRecord> }) => {
      const { error } = await supabase.from('products').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })
}
