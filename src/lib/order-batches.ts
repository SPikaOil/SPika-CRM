import { createClient } from '@/lib/supabase/client'

/**
 * Which batches an order was picked from.
 *
 * There is no batch column on an order on purpose: one order can be picked from
 * two batches when the first runs out, and a single box can hold bottles from
 * both. The truth lives in the stock movements — one row per batch — so this is
 * the one place that turns those rows back into something a document can print.
 *
 * Art. 10.3 of the consignment agreement puts batch traceability on us, and
 * art. 2.5 asks a customer to quote the batch number when they report a hidden
 * defect. They can only do that if it is printed somewhere.
 *
 * Returns a map of sku to batch numbers, oldest allocation first. An order that
 * has not been picked from a batch yet returns an empty map, and every document
 * then simply prints nothing extra.
 */
export type OrderBatches = Record<string, string[]>

export async function fetchOrderBatches(orderId: string | null | undefined): Promise<OrderBatches> {
  if (!orderId) return {}
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_movements')
    .select('sku, batch:batches(batch_number)')
    .eq('order_id', orderId)
    .eq('reason', 'order')
    .order('created_at', { ascending: true })

  // A missing batch is never a reason to fail a document: the invoice still has
  // to come out, it just carries no batch line.
  if (error || !data) return {}

  const out: OrderBatches = {}
  for (const row of data as unknown as { sku: string; batch: { batch_number: string } | null }[]) {
    const number = row.batch?.batch_number
    if (!number) continue
    const list = out[row.sku] ?? []
    if (!list.includes(number)) list.push(number)
    out[row.sku] = list
  }
  return out
}

/** The batch numbers for one product line, ready to print. Empty string when none. */
export function batchLabel(batches: OrderBatches | undefined, sku: string): string {
  const list = batches?.[sku] ?? []
  return list.length > 0 ? list.join(', ') : ''
}

/** Every batch on the order, for a header or a summary line. */
export function allBatches(batches: OrderBatches | undefined): string[] {
  return Array.from(new Set(Object.values(batches ?? {}).flat()))
}
