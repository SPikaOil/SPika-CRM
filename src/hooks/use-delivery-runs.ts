import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { QuoteItem } from '@/types'
import { toast } from 'sonner'

/**
 * A run that is prepared but not driven yet (migration 105).
 *
 * Danique, 2026-08-20: "er zou hier een tussenstap moeten zijn waar je de
 * deellevering klaarzet en iemand assigned."
 *
 * Until now a `deliveries` row appeared at the moment somebody signed, so up to
 * that instant a run did not exist: nothing to print a packing slip from, and
 * nothing for the person driving it to see. Now the row is written first, empty
 * of proof, and signing fills in the proof.
 *
 * `delivered_at` null IS the prepared state. No status column: a second flag
 * would only be a second thing to keep in step with the first.
 */
export interface DeliveryRun {
  id: string
  order_id: string
  items: QuoteItem[]
  assigned_to: string | null
  planned_date: string | null
  prepared_by: string | null
  delivered_at: string | null
  notes: string
  created_at: string
}

/** The runs of one order, newest first. Prepared and driven alike. */
export function useDeliveryRuns(orderId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['delivery_runs', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('id, order_id, items, assigned_to, planned_date, prepared_by, delivered_at, notes, created_at')
        .eq('order_id', orderId!)
        .order('created_at', { ascending: false })
      // Before migration 105 the two new columns do not exist. An empty list is
      // the honest answer and every screen already handles it.
      if (error) return [] as DeliveryRun[]
      return (data ?? []) as DeliveryRun[]
    },
    enabled: !!orderId,
  })
}

/**
 * Everything waiting for the signed-in person to drive.
 *
 * No user id is passed in: the query asks for open runs and the row-level
 * policy answers with the ones they may see. What lands on their dashboard is
 * therefore decided in one place rather than in every screen that asks.
 */
export function useMyOpenRuns(userId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['delivery_runs', 'mine', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('id, order_id, items, assigned_to, planned_date, delivered_at, order:orders(id, order_number, customer:customers(company_name))')
        .is('delivered_at', null)
        .eq('assigned_to', userId!)
        .order('planned_date', { ascending: true })
      if (error) return []
      return data ?? []
    },
    enabled: !!userId,
  })
}

/**
 * Put a run together: what goes out, who takes it, which day.
 *
 * The order moves to `out_for_delivery` here and nowhere else. That is a real
 * state — the goods are spoken for and on their way — and it is the last time
 * the ORDER is written by this flow: from the signature onwards migration 103's
 * trigger decides the status from the delivery itself.
 */
export function usePrepareDeliveryRun() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, items, assignedTo, plannedDate, preparedBy, notes }: {
      orderId: string
      items: QuoteItem[]
      assignedTo: string | null
      plannedDate: string | null
      preparedBy: string | null
      notes?: string
    }) => {
      if (items.length === 0) throw new Error('Nothing on this run yet')

      const { data, error } = await supabase
        .from('deliveries')
        .insert({
          order_id: orderId,
          items,
          assigned_to: assignedTo,
          planned_date: plannedDate,
          prepared_by: preparedBy,
          notes: notes ?? '',
        })
        .select()
        .single()
      if (error) throw new Error(`Preparing the run: ${error.message}`)

      // Only forward, never back. An order already invoiced or paid is not
      // dragged into "out for delivery" by a second run being prepared.
      const { error: statusErr } = await supabase
        .from('orders')
        .update({ status: 'out_for_delivery' })
        .eq('id', orderId)
        .in('status', ['pending_approval', 'processing'])
      if (statusErr) throw new Error(`Order status: ${statusErr.message}`)

      return data as DeliveryRun
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['delivery_runs', v.orderId] })
      queryClient.invalidateQueries({ queryKey: ['delivery_runs', 'mine'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Run prepared')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/** Change a prepared run — who takes it, which day, what is on it. */
export function useUpdateDeliveryRun() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: {
      id: string
      orderId: string
      values: Partial<Pick<DeliveryRun, 'items' | 'assigned_to' | 'planned_date' | 'notes'>>
    }) => {
      const { error } = await supabase.from('deliveries').update(values).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['delivery_runs', v.orderId] })
      queryClient.invalidateQueries({ queryKey: ['delivery_runs', 'mine'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Drop a run that has not gone out.
 *
 * Only while `delivered_at` is null. A signed delivery is a document — "wat er
 * geleverd is, is geleverd", her rule of 2026-08-14 — and documents are not
 * deleted, they are corrected with a second one.
 */
export function useCancelDeliveryRun() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; orderId: string }) => {
      const { error } = await supabase
        .from('deliveries')
        .delete()
        .eq('id', id)
        .is('delivered_at', null)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['delivery_runs', v.orderId] })
      queryClient.invalidateQueries({ queryKey: ['delivery_runs', 'mine'] })
      toast.success('Run cancelled')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * What of an order is still to go out, per product.
 *
 * Ordered minus everything already on a run — driven OR prepared. A second run
 * prepared for bottles the first one already carries is how a customer gets
 * double, so a prepared run counts against the order exactly as a delivered one
 * does.
 */
export function openPerSkuFor(
  orderItems: QuoteItem[],
  runs: DeliveryRun[],
): Map<string, number> {
  const open = new Map<string, number>()
  for (const i of orderItems) {
    if (i.qty > 0) open.set(i.sku, (open.get(i.sku) ?? 0) + i.qty)
  }
  for (const run of runs) {
    for (const i of (run.items ?? [])) {
      if (!open.has(i.sku)) continue
      open.set(i.sku, Math.max(0, (open.get(i.sku) ?? 0) - i.qty))
    }
  }
  return open
}
