import { Colli, Order, Transport } from '@/types'

/**
 * The one place that answers "how many packages, and how heavy?".
 *
 * Colli used to be derived from bottle counts (12 per carton, 5 kg per carton)
 * in four separate PDF templates, each with its own copy of the arithmetic.
 * Since 2026-08-03 the packing is entered for real — per order, per package,
 * with the items and the weight inside it — so every document, the screen and
 * the shipping-label QR read it from here instead of guessing.
 *
 * Everything degrades honestly: an order nobody has packed out yet contributes
 * zero colli and no weight, and the caller can see that rather than being
 * handed a made-up number.
 */

const BOTTLES_PER_CARTON = 12
const KG_PER_CARTON = 5

/**
 * The packing of a whole transport, in packing order.
 *
 * Since migration 100 the boxes belong to the TRANSPORT, not to the orders on
 * it: a transport is a stock transfer, packed per product, and the warehouse
 * repacks it over there into whatever each order needs. A box may still name
 * the order it was packed for (`for_order_id`) — for our screens only.
 *
 * The fallback matters. Before the migration has run, the boxes are still on
 * the orders, and every screen and document here would otherwise report an
 * empty load. So an empty transport packing falls back to the orders' own,
 * stamped with the order it came from, which is exactly what the migration
 * writes. Once the transport carries its own packing the fallback is dead
 * weight and can go.
 */
export function transportColli(transport: Transport): Colli[] {
  const own = transport.colli_contents ?? []
  if (own.length > 0) return own
  return (transport.orders ?? []).flatMap(o =>
    (o.colli_contents ?? []).map(c => ({ ...c, for_order_id: c.for_order_id ?? o.id })),
  )
}

/** The boxes on this transport that were packed for one particular order. */
export function transportColliForOrder(transport: Transport, orderId: string): Colli[] {
  return transportColli(transport).filter(c => c.for_order_id === orderId)
}

/**
 * Boxes nobody assigned to an order.
 *
 * Not an error — loose stock is the normal case for a warehouse run. It is
 * reported because the commercial invoice prices a box against its order, so an
 * unassigned box has no value to declare and the screen has to say so before a
 * customs paper does.
 */
export function transportLooseColli(transport: Transport): Colli[] {
  return transportColli(transport).filter(c => !c.for_order_id)
}

export function orderColli(order: Order): Colli[] {
  return order.colli_contents ?? []
}

export function orderColliCount(order: Order): number {
  return orderColli(order).length
}

/** Sum of the PACKAGING weights filled in for this order's packages. */
export function orderColliWeight(order: Order): number {
  return orderColli(order).reduce((sum, c) => sum + Number(c.weight_kg ?? 0), 0)
}

/** What one bottle weighs, per sku, in GRAMS. Straight off the Products screen. */
export type ProductWeights = Record<string, number | null | undefined>

/**
 * The gross weight of one package: the box plus everything in it.
 *
 * Her instruction of 2026-08-19 — "ik geef hier in gewicht van de verpakking en
 * de app rekent adhv info in products". Only the packaging is typed. The
 * bottles are already listed in the colli and every product carries a weight in
 * grams, so the document works the total out and cannot fall behind a repack.
 *
 * `missing` names the skus with no weight on the Products screen. Their bottles
 * are simply not in the total, which makes the number too LOW — the one
 * direction that matters on a customs paper, so it is reported rather than
 * hidden and the screen says so out loud.
 */
export function colliGrossWeight(colli: Colli, weights: ProductWeights) {
  let kg = Number(colli.weight_kg ?? 0)
  const missing: string[] = []
  for (const item of colli.items) {
    if (item.qty <= 0) continue
    const grams = weights[item.sku]
    if (grams === null || grams === undefined || !Number.isFinite(Number(grams))) {
      if (!missing.includes(item.sku)) missing.push(item.sku)
      continue
    }
    kg += (Number(grams) * item.qty) / 1000
  }
  return { kg, missing }
}

/**
 * The gross weight of a whole transport: every package, box and contents.
 *
 * This is the figure that goes on the packing list and the bill of lading. It
 * replaces the hand-typed total that used to sit on the transport, which is why
 * transport 20260801 declared 1.00 kg for 42 bottles — that 1.00 was the empty
 * box and nobody had added the 5.43 kg inside it.
 */
export function transportGrossWeight(transport: Transport, weights: ProductWeights) {
  let kg = 0
  const missing: string[] = []
  for (const colli of transportColli(transport)) {
    const one = colliGrossWeight(colli, weights)
    kg += one.kg
    for (const sku of one.missing) if (!missing.includes(sku)) missing.push(sku)
  }
  return { kg, missing }
}

/** Product weights in grams, keyed by sku, for the helpers above. */
export function weightsBySku(
  products: { sku: string; weight_g: number | null }[] | undefined,
): ProductWeights {
  const out: ProductWeights = {}
  for (const p of products ?? []) out[p.sku] = p.weight_g
  return out
}

/**
 * Both customs codes per sku, for the commercial invoice (migration 097).
 *
 * A product has two: European customs and American customs classify the same
 * bottle differently. Which of the two is printed is decided by the destination
 * of the transport — see customsRegion in lib/country.ts.
 */
export type ProductHsCodes = Record<string, { eu: string | null; us: string | null }>

export function hsCodesBySku(
  products: { sku: string; hs_code_eu: string | null; hs_code_us: string | null }[] | undefined,
): ProductHsCodes {
  const out: ProductHsCodes = {}
  for (const p of products ?? []) out[p.sku] = { eu: p.hs_code_eu, us: p.hs_code_us }
  return out
}

/** True when at least one package of this order has been weighed. */
export function orderIsWeighed(order: Order): boolean {
  return orderColli(order).some(c => c.weight_kg !== null && c.weight_kg !== undefined)
}

/**
 * What the old templates worked out from bottle counts. Kept only as a fallback
 * for an order that has not been packed out, and always labelled as an estimate
 * where it is shown.
 */
export function estimatedFromBottles(order: Order) {
  const bottles = ((order.items ?? []) as { qty: number }[])
    .reduce((sum, i) => sum + (i.qty > 0 ? i.qty : 0), 0)
  const cartons = Math.ceil(bottles / BOTTLES_PER_CARTON)
  return { bottles, cartons, weight: cartons * KG_PER_CARTON }
}

export interface TransportCargo {
  orders: Order[]
  /** Packages across the whole transport — this is the number in the label QR. */
  colli: number
  /** Boxes nobody assigned to an order. Loose stock, which is a normal load. */
  loose: number
  /** Weight added up from the individual packages. 0 when nothing is weighed. */
  weightFromColli: number
  /** The weight typed on the transport itself, if any. */
  declaredWeight: number | null
  /** What to print: the declared total wins, otherwise the weighed packages. */
  weight: number | null
}

export function transportCargo(transport: Transport): TransportCargo {
  const orders = transport.orders ?? []
  const boxes = transportColli(transport)
  const colli = boxes.length
  // Since 100 the load is packed per product, so "an order with no packing" is
  // no longer a meaningful count — a box either names an order or it is loose.
  const loose = boxes.filter(c => !c.for_order_id).length
  const weightFromColli = boxes.reduce((sum, c) => sum + Number(c.weight_kg ?? 0), 0)
  const declaredWeight =
    transport.total_weight_kg === null || transport.total_weight_kg === undefined
      ? null
      : Number(transport.total_weight_kg)

  return {
    orders,
    colli,
    loose,
    weightFromColli,
    declaredWeight,
    // The declared total is what the carrier was told, so it is what the
    // paperwork must say. The per-package sum only fills in when nobody typed
    // a total.
    weight: declaredWeight ?? (weightFromColli > 0 ? weightFromColli : null),
  }
}

/** One printed shipping label: one package, numbered across the whole transport. */
export interface LabelPage {
  /** 1-based, counted over the whole transport — a transport goes to one address. */
  colliNumber: number
  totalColli: number
  /**
   * The order this box was packed for, when it was packed for one. Undefined is
   * normal since 100: a transport is a stock transfer and a box of loose stock
   * belongs to no order. Nothing about the order reaches the printed label — it
   * is here so a screen can group by it.
   */
  order?: Order
  colli: Colli
  qrCodeDataUrl?: string
}

/**
 * One label per package, in order. Packages that have not been packed out yet
 * produce no label — there is nothing to put on it, and a blank label on a box
 * is worse than no label.
 */
export function buildLabelPages(transport: Transport): LabelPage[] {
  const byId = new Map((transport.orders ?? []).map(o => [o.id, o]))
  const boxes = transportColli(transport)
  return boxes.map((colli, i) => ({
    colliNumber: i + 1,
    totalColli: boxes.length,
    order: colli.for_order_id ? byId.get(colli.for_order_id) : undefined,
    colli,
  }))
}

/**
 * What the QR on a label encodes: plain text, never a link.
 *
 * Whoever scans this is unloading a box — receiving staff, a warehouse, us. They
 * have no CRM account, and the app redirects every session-less request to the
 * login page, so a URL would hand them a login screen. Plain text shows up in
 * any phone camera, with no internet and no account.
 */
export function colliQrText(
  transport: Transport,
  page: Pick<LabelPage, 'colliNumber' | 'totalColli' | 'order' | 'colli'>,
  /** Batch numbers per sku, so a scan names the batches inside this box. */
  batches?: Record<string, string[]>,
  /** What one bottle weighs per sku, in grams. Without it the weight is the
   *  packaging alone, which is exactly the fault this used to have. */
  weights?: ProductWeights,
): string {
  const lines: string[] = [
    `${transport.transport_number} · Colli ${page.colliNumber}/${page.totalColli}`,
  ]

  // NO order number and NO reseller name. Her instruction of 2026-08-19: this
  // is the outside of a box, and who bought the goods is nobody's business
  // between here and the warehouse door — the same rule that took them off the
  // packing list. Which order a box belongs to stays in the app, where the
  // transport number and the colli number above are enough to find it.

  for (const item of page.colli.items) lines.push(`${item.name} — ${item.qty}`)
  if (page.colli.items.length === 0) lines.push('(empty)')

  // A box can hold bottles from two batches, so every batch behind its contents
  // is named. Art. 10.3 puts traceability on us, and a scan is the fastest way
  // to answer "which batch is this?" without opening anything.
  const inBox = Array.from(new Set(page.colli.items.flatMap(it => batches?.[it.sku] ?? [])))
  if (inBox.length > 0) lines.push(`Batch: ${inBox.join(', ')}`)

  // GROSS, like every other document since 097: the packaging plus the bottles
  // inside. It encoded the packaging alone, so a scan of a box holding 42
  // bottles answered 1.00 kg while the papers with it said 6.43.
  const kg = colliGrossWeight(page.colli, weights ?? {}).kg
  if (kg > 0) lines.push(`${kg.toFixed(2)} kg`)

  return lines.join('\n')
}

/**
 * Every product ORDERED across a transport, added up.
 *
 * @deprecated for documents. Nothing uses it since the bill of lading moved to
 * transportPackedTotals: a transport carries part of an order as often as all
 * of it, and a document that counts the order tells the carrier something that
 * is not in the boxes. Kept for a screen that genuinely wants the order side.
 */
export function transportItemTotals(transport: Transport) {
  const totals = new Map<string, { sku: string; name: string; qty: number }>()
  for (const order of transport.orders ?? []) {
    for (const item of (order.items ?? []) as { sku: string; name: string; qty: number }[]) {
      if (item.qty <= 0) continue
      const existing = totals.get(item.sku)
      if (existing) existing.qty += item.qty
      else totals.set(item.sku, { sku: item.sku, name: item.name, qty: item.qty })
    }
  }
  return Array.from(totals.values())
}

/**
 * Every product actually PACKED across a transport, added up.
 *
 * transportItemTotals above sums what was ORDERED, which is a different number
 * the moment a transport carries part of an order — and it always can. Order
 * 729134 went out with 43 of its 130 bottles in one box, and the bill of lading
 * declared 130 because it counted the order rather than the packing.
 *
 * A carrier is told what is in the boxes. That is this.
 */
export function transportPackedTotals(transport: Transport) {
  const totals = new Map<string, { sku: string; name: string; qty: number }>()
  for (const colli of transportColli(transport)) {
    for (const item of colli.items) {
      if (item.qty <= 0) continue
      const existing = totals.get(item.sku)
      if (existing) existing.qty += item.qty
      else totals.set(item.sku, { sku: item.sku, name: item.name, qty: item.qty })
    }
  }
  return Array.from(totals.values())
}
