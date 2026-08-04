import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Batch, BatchStock, StockMovement, StockReason } from '@/types'
import { toast } from 'sonner'

/**
 * Batches and the stock that hangs off them.
 *
 * Stock is never stored as a total: it is the sum of the movements, read back
 * through the `batch_stock` view. Every flow that touches bottles — filling,
 * shipping, receiving, picking, Shopify, handover, breakage, returns — writes a
 * movement, so a batch can always be traced and a mistake can always be undone
 * by writing the opposite instead of editing history.
 */

export function useBatches() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Batch[]
    },
  })
}

/** Current stock per batch, product and location. location_id null = Curaçao. */
export function useBatchStock() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['batch_stock'],
    queryFn: async () => {
      const { data, error } = await supabase.from('batch_stock').select('*')
      if (error) throw error
      return data as BatchStock[]
    },
  })
}

/** The movements of one batch — the audit trail behind its numbers. */
export function useBatchMovements(batchId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['stock_movements', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('batch_id', batchId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as StockMovement[]
    },
    enabled: !!batchId,
  })
}

export function useCreateBatch() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<Batch>) => {
      const { data, error } = await supabase.from('batches').insert(values).select().single()
      if (error) throw error
      return data as Batch
    },
    onSuccess: (b) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      toast.success(`Batch ${b.batch_number} created`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateBatch() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Batch> }) => {
      const { error } = await supabase.from('batches').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batches'] }),
    onError: (err: Error) => toast.error(err.message),
  })
}

export interface MovementInput {
  batch_id: string
  sku: string
  qty: number
  location_id?: string | null
  reason: StockReason
  order_id?: string | null
  transport_id?: string | null
  note?: string
}

/**
 * Write one or more movements in one go. Filling a batch with three products is
 * three movements, and they belong together — so they are sent as one insert.
 */
export function useAddStockMovements() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (movements: MovementInput[]) => {
      const rows = movements.filter(m => m.qty !== 0)
      if (rows.length === 0) return
      const { error } = await supabase.from('stock_movements').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch_stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Undo a movement by writing its mirror image, never by deleting it. The
 * original stays visible, which is the whole point of keeping movements.
 */
export function useReverseStockMovement() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (m: StockMovement) => {
      const { error } = await supabase.from('stock_movements').insert({
        batch_id: m.batch_id,
        sku: m.sku,
        qty: -m.qty,
        location_id: m.location_id,
        reason: 'adjustment' as StockReason,
        note: `Reversal of ${m.reason} on ${new Date(m.created_at).toLocaleDateString()}`,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch_stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      toast.success('Movement reversed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
