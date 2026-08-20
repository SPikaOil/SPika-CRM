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
 * Which batch each product on a TRANSPORT was loaded from: { sku -> batch_id }.
 *
 * Danique, 2026-08-19: "het moment dat we een transport aanmaken, dan is de
 * voorraad op Curacao al verminderd." A transport is a stock transfer, so the
 * bottles leave home when they go on the load — not when somebody picks a batch
 * on an order, and not when the customer signs weeks later.
 *
 * `transport_out` was written into the reason list back in migration 055 and
 * never used for bottles; this is what it was for.
 */
export function useTransportPicks(transportId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['transport_picks', transportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('sku, batch_id, qty')
        .eq('transport_id', transportId!)
        .eq('reason', 'transport_out')
      if (error) throw error
      const picks: Record<string, { batch_id: string; qty: number }> = {}
      for (const row of data ?? []) {
        // Stored negative — it left the shelf. Shown positive.
        picks[row.sku] = { batch_id: row.batch_id, qty: Math.abs(row.qty) }
      }
      return picks
    },
    enabled: !!transportId,
  })
}

/**
 * The products of THIS order that have already been loaded onto a transport out
 * of a batch — so the batch, not a typed month, has the last word on their THT.
 *
 * An export order has no pick of its own since 2026-08-19: its bottles leave
 * Curaçao on the load. Without this the order screen could not tell "no batch
 * anywhere" from "a batch was chosen on the transport", and would keep offering
 * a field that quietly contradicts it.
 */
export function useOrderLoadPicks(orderId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['order_load_picks', orderId],
    queryFn: async () => {
      const { data: links } = await supabase
        .from('transport_orders')
        .select('transport_id')
        .eq('order_id', orderId!)
      const ids = (links ?? []).map(l => l.transport_id as string)
      if (ids.length === 0) return new Set<string>()
      const { data, error } = await supabase
        .from('stock_movements')
        .select('sku')
        .in('transport_id', ids)
        .eq('reason', 'transport_out')
      if (error) throw error
      return new Set((data ?? []).map(r => r.sku as string))
    },
    enabled: !!orderId,
  })
}

/**
 * Put the batch's best-before onto the order lines for that product.
 *
 * Danique, 2026-08-19: "1 partij kan maar 1 tht hebben, anders zijn de partijen
 * niet traceerbaar." The batches table has held one date per batch since
 * migration 055 — the rule was only broken on the ORDER, where the THT was a
 * hand-typed month sitting next to a batch that said something else. The typed
 * one is what reached the invoice, the packing list and the commercial invoice.
 *
 * So it is stamped instead of typed, and stamped onto the stored line rather
 * than worked out at print time: every document already reads `items[].tht_date`
 * and none of them has to learn about batches.
 *
 * A batch with no date of its own clears the line rather than leaving a stale
 * one behind — an empty THT is a question, an old one is a wrong answer.
 */
async function stampTht(
  supabase: ReturnType<typeof createClient>,
  batchId: string,
  orderIds: string[],
  sku: string,
) {
  if (orderIds.length === 0) return
  const { data: batch } = await supabase
    .from('batches')
    .select('tht_date')
    .eq('id', batchId)
    .single()
  const tht = (batch?.tht_date as string | null) ?? null

  const { data: orders } = await supabase
    .from('orders')
    .select('id, items')
    .in('id', orderIds)

  for (const order of orders ?? []) {
    const items = (order.items ?? []) as { sku: string; tht_date?: string | null }[]
    if (!items.some(i => i.sku === sku)) continue
    const next = items.map(i => (i.sku === sku ? { ...i, tht_date: tht ?? undefined } : i))
    await supabase.from('orders').update({ items: next }).eq('id', order.id)
  }
}

/**
 * Bottles already taken off Curaçao by the ORDERS on a transport.
 *
 * Every export order booked out this way until 2026-08-19, when that moved to
 * the transport. Those movements are real — the bottles genuinely left the
 * shelf — so a transport carrying such an order must NOT book them out a second
 * time. The load screen reads this to tell the two apart.
 */
export function useOrderPicksFor(orderIds: string[]) {
  const supabase = createClient()
  const key = [...orderIds].sort().join(',')
  return useQuery({
    queryKey: ['order_picks_for', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('order_id, sku, batch_id, qty, batch:batches(batch_number)')
        .in('order_id', orderIds)
        .eq('reason', 'order')
      if (error) throw error
      return (data ?? []).map(row => {
        const batch = row.batch as unknown as { batch_number: string } | null
        return {
          order_id: row.order_id as string,
          sku: row.sku as string,
          batch_id: row.batch_id as string,
          qty: Math.abs(row.qty as number),
          batch_number: batch?.batch_number ?? '',
        }
      })
    },
    enabled: orderIds.length > 0,
  })
}

/**
 * Load one product onto a transport out of a batch, or take it off again.
 *
 * Re-picking REPLACES the earlier choice rather than mirroring it, the same rule
 * as an order pick: nothing physically moved, somebody corrected which batch the
 * bottles came off, and a reversal pair would only make the batch history
 * unreadable. A real movement — filling, receiving, breakage — is still never
 * deleted.
 */
export function useSetTransportPick() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ transportId, sku, qty, batchId }: {
      transportId: string; sku: string; qty: number; batchId: string | null
    }) => {
      const { error: delErr } = await supabase
        .from('stock_movements')
        .delete()
        .eq('transport_id', transportId)
        .eq('sku', sku)
        .eq('reason', 'transport_out')
      if (delErr) throw delErr
      if (!batchId || qty <= 0) return
      const { error } = await supabase.from('stock_movements').insert({
        batch_id: batchId,
        sku,
        qty: -qty,
        // Off Curaçao, where the bottles are filled. location_id null = home.
        reason: 'transport_out' as StockReason,
        transport_id: transportId,
        note: 'Loaded onto this transport',
      })
      if (error) throw error

      // Every order this transport is meant for gets the batch's THT on that
      // product — the papers of all of them describe the same bottles.
      const { data: links } = await supabase
        .from('transport_orders')
        .select('order_id')
        .eq('transport_id', transportId)
      await stampTht(supabase, batchId, (links ?? []).map(l => l.order_id as string), sku)
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['batch_stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      queryClient.invalidateQueries({ queryKey: ['transport_picks', v.transportId] })
      // The pick stamps the THT onto every order on this load, so the screens
      // showing those orders have to be told.
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['export-orders'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Which batch each product on an order was taken from: { sku -> batch_id }.
 *
 * A batch is CHOSEN on the order, per product — Danique, 2026-08-14. That choice
 * is not a field on the order: it is the stock movement that took the bottles
 * off the shelf, so the choice and the stock can never disagree.
 *
 * LOCAL orders only since 2026-08-19. An export order leaves Curaçao on a
 * transport, and its batch is chosen there — see useTransportPicks above.
 * Picking in both places would take the same bottles off the shelf twice.
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
      await stampTht(supabase, batchId, [orderId], sku)
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['batch_stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      queryClient.invalidateQueries({ queryKey: ["order_picks", v.orderId] })
      queryClient.invalidateQueries({ queryKey: ["orders"] })
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
