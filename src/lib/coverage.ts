import { isPosLine } from '@/lib/pos'

/**
 * Can this shelf cover what has already been promised from it?
 *
 * Danique, 2026-08-20, when I proposed a threshold you have to set: "kunnen we
 * toch een regel van maken?" She was right, and this is the rule I had missed.
 *
 * "Low stock" is a judgement — forty bottles is three weeks at one place and
 * three days at another, and a warehouse abroad has no sales history in this
 * app to work it out from. But "there is less standing here than the runs we
 * have already prepared need" is a FACT. Nobody has to set it, nobody has to
 * agree with it, and it is the only version of running low that always means
 * somebody has to act.
 *
 * POS is left out: a stand does not come off the bottle shelf and is counted
 * somewhere else entirely.
 */
export interface CoverageGap {
  sku: string
  name: string
  /** What the prepared runs from this place together need. */
  promised: number
  /** What is actually standing there. */
  have: number
  /** promised − have, always positive. This is the number that hurts. */
  short: number
}

export interface StockLine {
  sku: string
  product_name?: string
  location_id: string | null
  /** Who is carrying it. Null = the place itself (migration 112). */
  holder_id?: string | null
  qty: number
}

export interface RunLines {
  items: { sku: string; name: string; qty: number }[] | null
}

export function coverageGaps(
  stock: StockLine[] | undefined,
  runs: RunLines[] | undefined,
  locationIds: (string | null)[],
): CoverageGap[] {
  const promised = new Map<string, { name: string; qty: number }>()
  for (const run of runs ?? []) {
    for (const i of run.items ?? []) {
      if (i.qty <= 0 || isPosLine(i)) continue
      const at = promised.get(i.sku)
      if (at) at.qty += i.qty
      else promised.set(i.sku, { name: i.name, qty: i.qty })
    }
  }
  if (promised.size === 0) return []

  const have = new Map<string, number>()
  for (const row of stock ?? []) {
    // The place's own stock. Bottles in a person's car are not on the shelf,
    // so they cannot cover a run standing ready at that shelf.
    if (row.holder_id || !locationIds.includes(row.location_id) || row.qty <= 0) continue
    have.set(row.sku, (have.get(row.sku) ?? 0) + row.qty)
  }

  const gaps: CoverageGap[] = []
  for (const [sku, need] of promised) {
    const standing = have.get(sku) ?? 0
    if (standing >= need.qty) continue
    gaps.push({
      sku,
      name: need.name,
      promised: need.qty,
      have: standing,
      short: need.qty - standing,
    })
  }
  return gaps.sort((a, b) => b.short - a.short)
}
