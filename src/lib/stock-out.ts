import { SupabaseClient } from '@supabase/supabase-js'
import { allocateFifo, lotsFor } from '@/lib/fifo'
import { isPosLine } from '@/lib/pos'

/**
 * Bottles leaving for a customer, and coming back if the run is called off.
 *
 * WHEN they leave: the moment the run is made up, not when the customer signs.
 * Her answer of 2026-08-21 — "ja zodra het je de run klaarzet, echter is die
 * order pas echt rond bij tekenen klant." Bottles boxed up and in the car are
 * not standing in the warehouse, and while the app pretended they were, the
 * same fifty could be promised to two customers.
 *
 * WHERE they come from: what the runner is CARRYING first (migration 112), then
 * the warehouse the order goes out from (migration 114). That is the order it
 * happens in the street — you empty your own boot before you go back to the
 * shelf.
 *
 * One place, because three screens set a run going: preparing one on the order
 * page, starting a delivery straight away, and the warehouse doing either. Three
 * copies of this would drift, and a booking that drifts is a count nobody
 * believes.
 */

export interface RunItem { sku: string; name: string; qty: number }

/** Never booked below zero: a place that quietly goes negative makes every later count meaningless. */
export interface BookOutResult { rows: number; shortages: string[] }

export async function bookRunOut(
  supabase: SupabaseClient,
  args: {
    orderId: string
    deliveryId: string
    items: RunItem[]
    /** Who is taking it out. They may be carrying stock of their own. */
    runnerId: string | null
    /** The warehouse this order goes out from. Null = Curaçao. */
    warehouseId: string | null
  },
): Promise<BookOutResult> {
  const { orderId, deliveryId, items, runnerId, warehouseId } = args
  const bottles = items.filter(i => i.qty > 0 && !isPosLine(i))
  if (bottles.length === 0) return { rows: 0, shortages: [] }

  const { data: carried } = runnerId
    ? await supabase
        .from('batch_stock')
        .select('batch_id, batch_number, tht_date, sku, location_id, holder_id, qty')
        .eq('holder_id', runnerId)
    : { data: [] }

  // `= null` matches nothing in SQL, so Curaçao needs `is`.
  const shelfQuery = supabase
    .from('batch_stock')
    .select('batch_id, batch_number, tht_date, sku, location_id, holder_id, qty')
    .is('holder_id', null)
  const { data: shelf } = await (warehouseId === null
    ? shelfQuery.is('location_id', null)
    : shelfQuery.eq('location_id', warehouseId))

  const rows: Record<string, unknown>[] = []
  const shortages: string[] = []

  for (const item of bottles) {
    const mine = (carried ?? []).filter(r => r.sku === item.sku && r.qty > 0)
    const fromMe = allocateFifo(
      mine.map(r => ({
        batch_id: r.batch_id as string,
        batch_number: r.batch_number as string,
        tht_date: r.tht_date as string | null,
        qty: r.qty as number,
      })),
      item.qty,
    )
    for (const t of fromMe.take) {
      rows.push({
        batch_id: t.batch_id,
        sku: item.sku,
        qty: -t.qty,
        location_id: null,
        holder_id: runnerId,
        reason: 'warehouse_out',
        order_id: orderId,
        delivery_id: deliveryId,
        note: `On a run to the customer, out of own stock — ${t.batch_number}`,
      })
    }

    const rest = fromMe.short
    if (rest <= 0) continue

    const { take, short } = allocateFifo(lotsFor(shelf ?? [], item.sku, warehouseId), rest)
    for (const t of take) {
      rows.push({
        batch_id: t.batch_id,
        sku: item.sku,
        qty: -t.qty,
        location_id: warehouseId,
        reason: 'warehouse_out',
        order_id: orderId,
        delivery_id: deliveryId,
        note: `On a run to the customer — ${t.batch_number}`,
      })
    }
    if (short > 0) shortages.push(`${short}× ${item.name}`)
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('stock_movements').insert(rows)
    if (error) throw new Error(`Booking the run off stock: ${error.message}`)
  }

  return { rows: rows.length, shortages }
}

/**
 * A run that is called off puts its bottles back.
 *
 * The mirror image of what left, never a delete: the original stays visible, so
 * the shelf can be read back to what happened rather than to what somebody
 * decided to keep. Same rule as every other correction in this app.
 *
 * Silence here would be the worst kind of bug — a cancelled run whose bottles
 * never came back is stock that exists in the warehouse and not in the app.
 */
export async function bookRunBack(
  supabase: SupabaseClient,
  deliveryId: string,
): Promise<{ rows: number }> {
  const { data: went, error } = await supabase
    .from('stock_movements')
    .select('batch_id, sku, qty, location_id, holder_id, order_id')
    .eq('delivery_id', deliveryId)
    .eq('reason', 'warehouse_out')
  if (error) throw new Error(`Reading what went out: ${error.message}`)
  if (!went || went.length === 0) return { rows: 0 }

  const { error: insErr } = await supabase.from('stock_movements').insert(
    went.map(m => ({
      batch_id: m.batch_id,
      sku: m.sku,
      qty: -Number(m.qty),
      location_id: m.location_id,
      holder_id: m.holder_id,
      reason: 'adjustment',
      order_id: m.order_id,
      note: 'Run cancelled — put back',
    })),
  )
  if (insErr) throw new Error(`Putting the bottles back: ${insErr.message}`)

  return { rows: went.length }
}
