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

export function orderColli(order: Order): Colli[] {
  return order.colli_contents ?? []
}

export function orderColliCount(order: Order): number {
  return orderColli(order).length
}

/** Sum of the weights actually filled in for this order's packages. */
export function orderColliWeight(order: Order): number {
  return orderColli(order).reduce((sum, c) => sum + Number(c.weight_kg ?? 0), 0)
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
  /** Orders that have no packing yet. */
  unpacked: number
  /** Weight added up from the individual packages. 0 when nothing is weighed. */
  weightFromColli: number
  /** The weight typed on the transport itself, if any. */
  declaredWeight: number | null
  /** What to print: the declared total wins, otherwise the weighed packages. */
  weight: number | null
}

export function transportCargo(transport: Transport): TransportCargo {
  const orders = transport.orders ?? []
  const colli = orders.reduce((sum, o) => sum + orderColliCount(o), 0)
  const unpacked = orders.filter(o => orderColliCount(o) === 0).length
  const weightFromColli = orders.reduce((sum, o) => sum + orderColliWeight(o), 0)
  const declaredWeight =
    transport.total_weight_kg === null || transport.total_weight_kg === undefined
      ? null
      : Number(transport.total_weight_kg)

  return {
    orders,
    colli,
    unpacked,
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
  order: Order
  colli: Colli
  qrCodeDataUrl?: string
}

/**
 * One label per package, in order. Packages that have not been packed out yet
 * produce no label — there is nothing to put on it, and a blank label on a box
 * is worse than no label.
 */
export function buildLabelPages(transport: Transport): LabelPage[] {
  const pages: LabelPage[] = []
  for (const order of transport.orders ?? []) {
    for (const colli of orderColli(order)) {
      pages.push({ colliNumber: 0, totalColli: 0, order, colli })
    }
  }
  return pages.map((p, i) => ({ ...p, colliNumber: i + 1, totalColli: pages.length }))
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
): string {
  const lines: string[] = [
    `${transport.transport_number} · Colli ${page.colliNumber}/${page.totalColli}`,
    `Order ${page.order.order_number} — ${page.order.customer?.company_name ?? ''}`.trim(),
  ]
  for (const item of page.colli.items) lines.push(`${item.name} — ${item.qty}`)
  if (page.colli.items.length === 0) lines.push('(empty)')
  // A box can hold bottles from two batches, so every batch behind its contents
  // is named. Art. 10.3 puts traceability on us, and a scan is the fastest way
  // to answer "which batch is this?" without opening anything.
  const inBox = Array.from(new Set(page.colli.items.flatMap(it => batches?.[it.sku] ?? [])))
  if (inBox.length > 0) lines.push(`Batch: ${inBox.join(', ')}`)
  if (page.colli.weight_kg !== null && page.colli.weight_kg !== undefined) {
    lines.push(`${Number(page.colli.weight_kg).toFixed(2)} kg`)
  }
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
  for (const order of transport.orders ?? []) {
    for (const colli of orderColli(order)) {
      for (const item of colli.items) {
        if (item.qty <= 0) continue
        const existing = totals.get(item.sku)
        if (existing) existing.qty += item.qty
        else totals.set(item.sku, { sku: item.sku, name: item.name, qty: item.qty })
      }
    }
  }
  return Array.from(totals.values())
}
