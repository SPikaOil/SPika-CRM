import { Transport, QuoteItem } from '@/types'
import { isPosLine } from '@/lib/pos'

/**
 * What a transport carries off Curaçao, per product.
 *
 * The agreed share of every order on it, added up — not their full orders. A
 * part shipment carries exactly what goes in the container (migration 100).
 *
 * One place, because two screens ask the same question and a second copy is
 * how they start disagreeing: the load screen offers a batch per product, and
 * the status guard refuses to let the transport leave while one of them has
 * none. If those two ever computed a different list, the guard would block a
 * product the screen never showed.
 */
export interface LoadLine { sku: string; name: string; qty: number }

export function transportLoadLines(transport: Transport): LoadLine[] {
  const load = new Map<string, LoadLine>()
  for (const o of transport.orders ?? []) {
    for (const i of ((o.on_transport ?? o.items ?? []) as QuoteItem[])) {
      if (i.qty <= 0) continue
      const at = load.get(i.sku)
      if (at) at.qty += i.qty
      else load.set(i.sku, { sku: i.sku, name: i.name, qty: i.qty })
    }
  }
  return Array.from(load.values())
}

/**
 * The bottles on this transport that have no batch behind them yet.
 *
 * POS material is skipped: a display stand does not come out of a filling run
 * and never has a batch. Her point of 2026-08-20.
 *
 * `picked` is what was taken off the shelf for this transport; `alreadyPicked`
 * is what the ORDERS on it took off under the older rule, which counts just as
 * much — those bottles really did leave Curaçao.
 */
export function bottlesWithoutBatch(
  transport: Transport,
  picked: Record<string, unknown>,
  alreadyPicked: { sku: string }[] = [],
): LoadLine[] {
  return transportLoadLines(transport).filter(
    l => !isPosLine(l)
      && !picked[l.sku]
      && !alreadyPicked.some(p => p.sku === l.sku),
  )
}
