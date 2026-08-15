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
 * The batches a transport actually brought into a warehouse.
 *
 * Read from the 'received' movements, not from the orders on the transport: an
 * order can sit on a transport without ever having been booked in, and shipping
 * from something that was never received is how a location goes negative.
 */
export function useTransportBatches(transportId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['transport_batches', transportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('sku, batch_id, batch:batches(batch_number, tht_date)')
        .eq('transport_id', transportId!)
        .eq('reason', 'received')
      if (error) throw error
      return (data ?? []).map(row => {
        const batch = row.batch as unknown as { batch_number: string; tht_date: string | null } | null
        return {
          sku: row.sku,
          batch_id: row.batch_id,
          batch_number: batch?.batch_number ?? '',
          tht_date: batch?.tht_date ?? null,
        }
      })
    },
    enabled: !!transportId,
  })
}

/**
 * Which batch each product on an order was taken from: { sku -> batch_id }.
 *
 * A batch is CHOSEN on the order, per product — Danique, 2026-08-14. That choice
 * is not a field on the order: it is the stock movement that took the bottles
 * off the shelf, so the choice and the stock can never disagree.
 */
export function useOrderPicks(orderId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['order_picks', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('sku, batch_id')
        .eq('order_id', orderId!)
        .eq('reason', 'order')
      if (error) throw error
      const picks: Record<string, string> = {}
      for (const row of data ?? []) picks[row.sku] = row.batch_id
      return picks
    },
    enabled: !!orderId,
  })
}

/**
 * Choose the batch for one product on an order, or clear it again.
 *
 * Re-picking REPLACES the earlier choice instead of mirroring it. Nothing
 * physically moved — somebody corrected which batch the bottles came off — and a
 * reversal pair would only make the batch history unreadable. A real movement
 * (filling, shipping, breakage) is still never deleted.
 */
export function useSetOrderPick() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, sku, qty, batchId }: {
      orderId: string; sku: string; qty: number; batchId: string | null
    }) => {
      const { error: delErr } = await supabase
        .from('stock_movements')
        .delete()
        .eq('order_id', orderId)
        .eq('sku', sku)
        .eq('reason', 'order')
      if (delErr) throw delErr
      if (!batchId || qty <= 0) return
      const { error } = await supabase.from('stock_movements').insert({
        batch_id: batchId,
        sku,
        qty: -qty,
        // Picked on Curaçao, where the bottles are filled.
        reason: 'order' as StockReason,
        order_id: orderId,
        note: 'Picked for this order',
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['batch_stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      queryClient.invalidateQueries({ queryKey: ['order_picks', v.orderId] })
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
