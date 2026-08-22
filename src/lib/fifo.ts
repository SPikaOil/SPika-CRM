import { atPlace } from '@/lib/stock-place'
/**
 * Which batch comes off the shelf first.
 *
 * Danique, 2026-08-19: "Fifo... echter je zegt t fout, 1 partij kan maar 1 tht
 * hebben, anders zijn de partijen niet traceerbaar."
 *
 * That correction is what makes this simple. A batch holds ONE best-before, so
 * the oldest batch and the shortest THT are the same batch — there is no
 * choosing between "first in" and "goes off first", and no case where the two
 * disagree. Oldest date first, and a batch with no date at all goes last: an
 * unknown THT is not the same as a near one, and putting it first would empty
 * exactly the stock nobody can vouch for.
 *
 * A run can span batches. 50 bottles off a shelf holding 30 of SPGE22 and 40 of
 * SPGE23 is 30 and 20, two movements, both traceable — which is the whole
 * reason stock is kept as movements rather than as a number.
 */

export interface StockLot {
  batch_id: string
  batch_number: string
  tht_date: string | null
  /** What is left of this batch AT ONE PLACE. Never a total across locations. */
  qty: number
}

export interface Allocation {
  batch_id: string
  batch_number: string
  tht_date: string | null
  qty: number
}

export interface FifoResult {
  /** What to take, oldest first. Empty when there is nothing on the shelf. */
  take: Allocation[]
  /** What the shelf could not cover. Zero means it was enough. */
  short: number
}

/**
 * Take `needed` off these lots, oldest first.
 *
 * Never invents stock. If the shelf cannot cover the run it says how far it
 * falls short and the caller decides — booking a location negative would make
 * every later count meaningless, and a warehouse that quietly goes below zero
 * is how you stop trusting the number entirely.
 */
export function allocateFifo(lots: StockLot[], needed: number): FifoResult {
  if (needed <= 0) return { take: [], short: 0 }

  const order = [...lots]
    .filter(l => l.qty > 0)
    .sort((a, b) => {
      // No date goes last. Ranked, not hidden: it is still taken if that is all
      // there is, but never before a batch we can date.
      if (!a.tht_date && !b.tht_date) return a.batch_number.localeCompare(b.batch_number)
      if (!a.tht_date) return 1
      if (!b.tht_date) return -1
      return a.tht_date.localeCompare(b.tht_date) || a.batch_number.localeCompare(b.batch_number)
    })

  const take: Allocation[] = []
  let left = needed
  for (const lot of order) {
    if (left <= 0) break
    const qty = Math.min(lot.qty, left)
    take.push({ batch_id: lot.batch_id, batch_number: lot.batch_number, tht_date: lot.tht_date, qty })
    left -= qty
  }

  return { take, short: left }
}

/**
 * The lots of one product at one place, from the batch_stock view.
 *
 * location_id null means Curaçao everywhere in this app, and `is` versus `eq`
 * is the difference between getting the home shelf and getting nothing at all —
 * so the caller passes rows and this only filters and shapes them.
 *
 * The PLACE's own stock: what a person is carrying is theirs, not the shelf's
 * (migration 112). Counting Djamy's fifty bottles as Curaçao stock is exactly
 * what that migration exists to stop.
 */
export function lotsFor(
  stock: { batch_id: string; batch_number: string; tht_date: string | null; sku: string; location_id: string | null; holder_id?: string | null; qty: number }[] | undefined,
  sku: string,
  locationId: string | null,
): StockLot[] {
  return (stock ?? [])
    .filter(r => r.sku === sku && atPlace(r, locationId) && r.qty > 0)
    .map(r => ({
      batch_id: r.batch_id,
      batch_number: r.batch_number,
      tht_date: r.tht_date,
      qty: r.qty,
    }))
}
