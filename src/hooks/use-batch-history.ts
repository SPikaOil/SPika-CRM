import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Where a batch went: every order it was given out on.
 *
 * Danique, 2026-08-21: "we zien dat djamy 50 flessen heeft ontvangen en je ziet
 * welke orders er vanaf zijn gegaan", and about looking back: "waar kunnen we
 * zien bijv over 6 maanden welke orders bij warehouse x zijn geweest en van
 * welke partijen er waren."
 *
 * Nothing extra is stored for this. Every bottle that leaves writes a movement
 * carrying its batch, its order and the day, so the answer has been in the
 * database all along and only ever needed a screen. That is also why it is
 * trustworthy: it is the same rows the stock count is made of, not a second
 * list somebody has to remember to keep up.
 *
 * Also the recall list. If something is wrong with a batch, these are the
 * customers who have it — art. 10.3 of the consignment agreement puts that on
 * us, and art. 2.5 asks a customer to quote the number when they report a
 * hidden defect.
 */
export interface BatchOutflow {
  batch_id: string
  qty: number
  reason: string
  created_at: string
  order: {
    id: string
    order_number: string
    customer: { id: string; company_name: string } | null
  } | null
}

/** Everything that went OUT of these batches, newest first. */
export function useBatchOutflow(batchIds: string[]) {
  const supabase = createClient()
  const key = [...batchIds].sort().join(',')
  return useQuery({
    queryKey: ['batch_outflow', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('batch_id, qty, reason, created_at, order:orders(id, order_number, customer:customers(id, company_name))')
        .in('batch_id', batchIds)
        // Everything that leaves for a customer, whichever door it went out of.
        .in('reason', ['warehouse_out', 'order', 'shopify'])
        .lt('qty', 0)
        .order('created_at', { ascending: false })
      if (error) return [] as BatchOutflow[]
      return (data ?? []) as unknown as BatchOutflow[]
    },
    enabled: batchIds.length > 0,
  })
}

/** Every time a batch's cost price was worked out again, and why. */
export interface CostLogEntry {
  id: string
  batch_id: string
  created_at: string
  vvp_before: number | null
  vvp_after: number | null
  reason: string
}

export function useBatchCostLog(batchIds: string[]) {
  const supabase = createClient()
  const key = [...batchIds].sort().join(',')
  return useQuery({
    queryKey: ['batch_cost_log', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_cost_log')
        .select('id, batch_id, created_at, vvp_before, vvp_after, reason')
        .in('batch_id', batchIds)
        .order('created_at', { ascending: false })
      // A warehouse account may not read this at all and gets nothing, which
      // every screen using it already draws as nothing.
      if (error) return [] as CostLogEntry[]
      return (data ?? []) as CostLogEntry[]
    },
    enabled: batchIds.length > 0,
  })
}
