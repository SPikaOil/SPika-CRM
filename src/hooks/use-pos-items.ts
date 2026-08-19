import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { PosKind } from '@/lib/pos'

export interface PosItem {
  id: string
  created_at: string
  updated_at: string
  name: string
  kind: PosKind
  sku: string | null
  asset_id: string | null
  /** Drive file ids showing what it looks like. First one is the thumbnail. */
  photos: string[]
  is_available: boolean
  notes: string
  sort_order: number
}

/** What a given reseller has standing in their shop. */
export interface CustomerPosItem {
  id: string
  customer_id: string
  pos_item_id: string
  qty: number
  since: string | null
  notes: string
  /** Joined in, so a screen never has to look the name up itself. */
  item?: PosItem
}

/**
 * The catalogue. Everyone signed in may read it — a reseller needs the name of
 * the thing standing in their shop, and there is nothing commercial on the row.
 */
export function usePosItems() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['pos-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_items')
        .select('*')
        .order('sort_order')
        .order('name')
      // Before migration 088 the table does not exist yet. An empty catalogue
      // is the honest answer, and every screen already handles it.
      if (error) return [] as PosItem[]
      return (data ?? []) as PosItem[]
    },
  })
}

export function useSavePosItem() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: Partial<PosItem> & { id?: string }) => {
      const { id, ...row } = input
      const payload = { ...row, updated_at: new Date().toISOString() }
      const { data, error } = id
        ? await supabase.from('pos_items').update(payload).eq('id', id).select().single()
        : await supabase.from('pos_items').insert(payload).select().single()
      if (error) throw error
      return data as PosItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-items'] })
      toast.success('Saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeletePosItem() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pos_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-items'] })
      queryClient.invalidateQueries({ queryKey: ['customer-pos-items'] })
      toast.success('Removed from the catalogue')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * The register for one reseller.
 *
 * Pass no id and it returns nothing rather than everything — a screen that has
 * not loaded its customer yet should show an empty list, not the whole estate.
 */
export function useCustomerPosItems(customerId?: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['customer-pos-items', customerId ?? 'none'],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_pos_items')
        .select('*, item:pos_items(*)')
        .eq('customer_id', customerId!)
      if (error) return [] as CustomerPosItem[]
      return (data ?? []) as CustomerPosItem[]
    },
  })
}

export function useSaveCustomerPosItem() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id?: string; customer_id: string; pos_item_id: string; qty: number
      since?: string | null; notes?: string
    }) => {
      const { id, ...row } = input
      const payload = { ...row, updated_at: new Date().toISOString() }
      // One row per reseller per item, so adding the same one twice adds up
      // rather than failing on the unique key.
      const { error } = id
        ? await supabase.from('customer_pos_items').update(payload).eq('id', id)
        : await supabase.from('customer_pos_items')
            .upsert(payload, { onConflict: 'customer_id,pos_item_id' })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['customer-pos-items', vars.customer_id] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteCustomerPosItem() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string; customerId: string }) => {
      const { error } = await supabase.from('customer_pos_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['customer-pos-items', vars.customerId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
