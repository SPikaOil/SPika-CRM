// Shared oil-stock maths. "Real volume" is the actual ml per bottle
// (a 50ml bottle really holds ~42-44ml) — set per product in Products.

// SKUs that consume ready-to-bottle oil (samples/returns excluded)
export const OIL_SKUS = ['oil-100ml', 'oil-50ml', 'oil-30ml-table', 'spika2go-5ml', 'spika2go-3ml']

export type RealVolumes = Record<string, number | null>

// How many bottles of each size a given litres of oil could fill,
// using each product's real volume (skips products without a real volume set)
export function bottlesFromLitres(litres: number, realVolumes: RealVolumes) {
  const ml = litres * 1000
  return OIL_SKUS.map(sku => {
    const vol = realVolumes[sku]
    return { sku, realVolumeMl: vol, bottles: vol && vol > 0 ? Math.floor(ml / vol) : null }
  })
}

// Total real oil volume (in litres) represented by a set of sold bottles
export function litresFromBottles(
  bottlesBySku: Record<string, number>,
  realVolumes: RealVolumes
): number {
  let ml = 0
  for (const sku of OIL_SKUS) {
    const qty = bottlesBySku[sku] ?? 0
    const vol = realVolumes[sku]
    if (qty > 0 && vol && vol > 0) ml += qty * vol
  }
  return ml / 1000
}
