'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Colli, Order, QuoteItem, Transport } from '@/types'
import { transportLoadLines } from '@/lib/transport-load'
import { useSetTransportColli } from '@/hooks/use-transports'
import { useProducts } from '@/hooks/use-products'
import { usePosItems } from '@/hooks/use-pos-items'
import { useTransportPicks, useOrderPicksFor, useBatches } from '@/hooks/use-batches'
import { posOrderLineFor, isPosLine } from '@/lib/pos'
import { formatTht } from '@/lib/utils'
import { colliGrossWeight, transportColli, weightsBySku } from '@/lib/transport-cargo'

/**
 * The packing of one TRANSPORT: how many colli the load is split into, what is
 * in each of them, and what the empty box weighs.
 *
 * Danique, 2026-08-19: "per product op het transport, we houden natuurlijk wel
 * rekening met orders die daar nodig en verwerkt moeten worden" — and over
 * there the warehouse repacks, "van grote omdozen naar afhankelijk van de order
 * verpakkingen (webshop orders of B2B orders)". So a transport is a stock
 * transfer packed per product, and the boxes belong to the load rather than to
 * an order. Before migration 100 they hung on the order, which meant two
 * transports carrying the same order printed the same boxes twice.
 *
 * A box may still say which order it was packed for. That stays INSIDE the app:
 * it is never printed and never lands in a QR, the same rule that took the
 * reseller name off the shipping label. It is here so the warehouse can hand
 * over the right boxes without opening them.
 *
 * The number of colli is the LENGTH of the array — there is no separate count
 * field, so "3 colli" and the three packages below it can never disagree.
 *
 * ONE weight is typed and it is the PACKAGING: the box, the filler, the tape.
 * The bottles are already listed in the box and every product carries its weight
 * on the Products screen, so the gross weight is worked out rather than re-typed
 * after every repack. Her instruction of 2026-08-19.
 *
 * Nothing here is mandatory. A transport can leave with colli that have not been
 * packed out yet; the screen only points out where the packing does not add up
 * to what the orders on it need, and it never blocks — a load may deliberately
 * carry more than is outstanding, which is what a re-send of lost goods is.
 */
/** The three outside measurements of a box, in the order they are read off one. */
const SIZE_FIELDS = [
  { key: 'length_cm' as const, short: 'l' },
  { key: 'width_cm' as const,  short: 'w' },
  { key: 'height_cm' as const, short: 'h' },
]

/** The value the "meant for" dropdown uses for a box of loose stock. */
const LOOSE = '__loose__'


export function ColliEditor({ transport }: { transport: Transport }) {
  const setColli = useSetTransportColli()
  const [open, setOpen] = useState(false)
  const { data: products } = useProducts()
  const { data: posItems } = usePosItems()
  const weights = weightsBySku(products)

  /**
   * The batch and its best-before, per product, for THIS load.
   *
   * Her point of 2026-08-19: if the colli is what everything hangs on, the THT
   * belongs beside the box — then whoever signs that box in already has the
   * right information in front of them instead of looking it up.
   *
   * Derived, never a second copy. A batch holds ONE date (her rule), the load
   * says which batch each product left on, so the answer is already settled the
   * moment the transport was picked. Storing it on the box again would be a
   * number that can go stale against the batch it came from.
   */
  const { data: picks = {} } = useTransportPicks(transport.id)
  // A transport loaded before 2026-08-19 took its bottles off Curaçao through
  // the ORDER, so it has no pick of its own. Without this the box would say
  // "no batch" for every product on every load that already existed.
  const { data: oldPicks = [] } = useOrderPicksFor((transport.orders ?? []).map(o => o.id))
  const { data: batches } = useBatches()
  const batchFor = (sku: string) => {
    const batchId = picks[sku]?.batch_id ?? oldPicks.find(p => p.sku === sku)?.batch_id
    return batchId ? (batches ?? []).find(b => b.id === batchId) : undefined
  }

  /**
   * The best-before of a product in this box.
   *
   * From the BATCH when there is one — one partij, one THT, her rule. But there
   * are no batches in the database at all yet, while the orders have carried a
   * THT on their lines for months. Showing "no batch" and nothing else would
   * hide a date that is right there on the order and printed on its invoice.
   *
   * So the batch wins when it exists, and the order line answers when it does
   * not. `fromBatch` says which of the two you are looking at, because "the
   * batch says June 2027" and "somebody typed June 2027" are not the same claim.
   */
  const thtFor = (sku: string) => {
    const batch = batchFor(sku)
    if (batch) {
      return { fromBatch: true, label: batch.batch_number, tht: batch.tht_date ?? null }
    }
    for (const o of transport.orders ?? []) {
      const line = ((o.items ?? []) as QuoteItem[]).find(i => i.sku === sku)
      if (line?.tht_date) return { fromBatch: false, label: null, tht: line.tht_date }
    }
    return null
  }

  const colli: Colli[] = transportColli(transport)
  const orders: Order[] = transport.orders ?? []

  /**
   * What the orders on this transport together need, per product.
   *
   * Read from what each order has AGREED to send on this run (`on_transport`),
   * not from the whole order — her instruction of 2026-08-19, "is niet altijd
   * de hele order". Checking the boxes against the full order flagged every
   * part shipment as wrong, which is how a real warning stops being read.
   *
   * A hint about the load, never a limit on it.
   */
  const needed = new Map<string, { name: string; qty: number }>(
    transportLoadLines({ orders } as Transport).map(l => [l.sku, { name: l.name, qty: l.qty }]),
  )

  /**
   * Everything that can go in a box: the whole product catalogue, because a
   * transport moves stock and may carry bottles no order has asked for yet, and
   * the POS material too — a stand goes IN a box, so it has to be pickable here
   * (her point of 2026-08-19).
   *
   * POS keeps the same `pos-…` sku it has on an order, so a box holding a stand
   * and a box holding the same stand out of an order count as one thing on
   * every document.
   */
  const catalogue = [
    ...(products ?? []).map(p => ({
      sku: p.sku,
      name: p.name,
      ordered: needed.get(p.sku)?.qty ?? 0,
      isPos: false,
    })),
    ...(posItems ?? []).map(i => {
      const line = posOrderLineFor(i, 1)
      return {
        sku: line.sku,
        name: line.name.replace(' (POS material)', ' · POS'),
        ordered: needed.get(line.sku)?.qty ?? 0,
        isPos: true,
      }
    }),
  ]

  function write(next: Colli[]) {
    setColli.mutate({ transportId: transport.id, colli: next })
  }

  function addColli() {
    write([...colli, { items: [], weight_kg: null }])
    setOpen(true)
  }

  function removeColli(index: number) {
    write(colli.filter((_, i) => i !== index))
  }

  function setWeight(index: number, value: string) {
    write(colli.map((c, i) =>
      i === index ? { ...c, weight_kg: value === '' ? null : Number(value) } : c
    ))
  }

  /** One of the three outside measurements of a box (098). */
  function setSize(index: number, key: 'length_cm' | 'width_cm' | 'height_cm', value: string) {
    write(colli.map((c, i) =>
      i === index ? { ...c, [key]: value === '' ? null : Number(value) } : c
    ))
  }

  /** Which order this box was packed for. Never printed — see the note above. */
  function setForOrder(index: number, value: string) {
    write(colli.map((c, i) =>
      i === index ? { ...c, for_order_id: value === LOOSE ? null : value } : c
    ))
  }


  function addItem(index: number, sku: string) {
    const source = catalogue.find(i => i.sku === sku)
    if (!source) return
    write(colli.map((c, i) => {
      if (i !== index) return c
      if (c.items.some(it => it.sku === sku)) return c
      return { ...c, items: [...c.items, { sku, name: source.name, qty: 1 }] }
    }))
  }

  function setItemQty(index: number, sku: string, qty: number) {
    write(colli.map((c, i) =>
      i === index
        ? { ...c, items: c.items.map(it => it.sku === sku ? { ...it, qty } : it) }
        : c
    ))
  }

  function removeItem(index: number, sku: string) {
    write(colli.map((c, i) =>
      i === index ? { ...c, items: c.items.filter(it => it.sku !== sku) } : c
    ))
  }

  // What is packed against what the orders on this transport need. A hint, never
  // a block: a load that carries MORE than is outstanding is a re-send of goods
  // that went missing, and that has to be possible. A silently wrong packing
  // list does not.
  const packed = new Map<string, number>()
  for (const c of colli) {
    for (const it of c.items) packed.set(it.sku, (packed.get(it.sku) ?? 0) + it.qty)
  }
  const skus = new Set([...needed.keys(), ...packed.keys()])
  const mismatches = Array.from(skus)
    .map(sku => ({
      name: needed.get(sku)?.name ?? catalogue.find(c => c.sku === sku)?.name ?? sku,
      ordered: needed.get(sku)?.qty ?? 0,
      inColli: packed.get(sku) ?? 0,
    }))
    .filter(m => m.inColli !== m.ordered)

  const over = mismatches.filter(m => m.inColli > m.ordered)
  const loose = colli.filter(c => !c.for_order_id).length
  const stillOut = colli.filter(c => !c.ata).length

  // Gross for the whole load: every box plus its contents. `missing` names the
  // products with no weight on the Products screen — their bottles are simply
  // not counted, which makes the total too LOW, so it is said out loud instead
  // of quietly ending up on a customs paper.
  const grossPerColli = colli.map(c => colliGrossWeight(c, weights))
  const grossTotal = grossPerColli.reduce((sum, g) => sum + g.kg, 0)
  const missingWeights = Array.from(new Set(grossPerColli.flatMap(g => g.missing)))
  // POS material carries no weight anywhere — a stand is not a product and the
  // catalogue keeps no grams for it. Listing it beside the bottles as "no weight
  // set" would send somebody to the Products screen to fix something that is not
  // there. It gets its own line instead, with the fix that actually works.
  const missingNames = missingWeights
    .filter(sku => !isPosLine({ sku }))
    .map(sku => catalogue.find(i => i.sku === sku)?.name ?? sku)
  const posWithoutWeight = missingWeights
    .filter(sku => isPosLine({ sku }))
    .map(sku => catalogue.find(i => i.sku === sku)?.name ?? sku)

  const orderLabel = (id?: string | null) => {
    const o = orders.find(x => x.id === id)
    return o ? `${o.order_number} — ${o.customer?.company_name ?? ''}`.trim() : null
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <PackageCheck className="h-3.5 w-3.5" />
          {colli.length} colli
          {grossTotal > 0 && ` · ${grossTotal.toFixed(2)} kg gross`}
        </button>
        {colli.length === 0 && (
          <span className="text-xs text-red-600">not packed yet</span>
        )}
        {loose > 0 && (
          <span className="text-xs text-muted-foreground">
            {loose} loose
          </span>
        )}
        {/* How far along the arrival is. The dates themselves live in Goods
            receipt below — this is only a pointer so you can see from the
            packing whether anything is still out. */}
        {colli.length > 0 && stillOut > 0 && (
          <span className="text-xs text-amber-600">
            {stillOut} still out
          </span>
        )}
        {/* Name the product. "Carries more than is outstanding" made you open
            the panel to find out what it meant — her point of 2026-08-20 — and
            a warning you have to go looking into is a warning nobody reads. */}
        {over.length > 0 && (
          <span className="text-xs text-amber-600">
            {over.length === 1
              ? `${over[0].inColli - over[0].ordered}× ${over[0].name} more than needed`
              : `${over.length} products more than needed`}
          </span>
        )}
        <Button size="sm" variant="outline" className="h-6 gap-1 text-xs px-2" onClick={addColli}>
          <Plus className="h-3 w-3" />
          Add colli
        </Button>
      </div>

      {open && colli.length > 0 && (
        <div className="space-y-2 pl-4 border-l">
          {colli.map((c, index) => {
            const available = catalogue.filter(i => !c.items.some(it => it.sku === i.sku))
            return (
              <div key={index} className="rounded-lg border p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Colli {index + 1}</p>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      Packaging kg
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-6 w-20 text-xs text-right px-2"
                      placeholder="0.00"
                      defaultValue={c.weight_kg ?? ''}
                      onBlur={e => setWeight(index, e.target.value)}
                    />
                    <button
                      onClick={() => removeColli(index)}
                      className="text-muted-foreground hover:text-red-600 p-1"
                      title="Remove this colli"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Which order this box was packed for. In-app only: it is not
                    on the label, not on the packing list and not in the QR —
                    her rule of 2026-08-19. It is here so the warehouse can hand
                    over the right boxes without opening them. */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Label className="text-xs text-muted-foreground shrink-0">Packed for</Label>
                  <Select
                    value={c.for_order_id ?? LOOSE}
                    onValueChange={v => v && setForOrder(index, v)}
                  >
                    <SelectTrigger className="h-6 text-xs px-2 w-full sm:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LOOSE}>Loose stock — no order</SelectItem>
                      {orders.map(o => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.order_number} — {o.customer?.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[11px] text-muted-foreground">never printed</span>
                </div>

                {/* The ATA used to be typed here. It moved to Goods receipt on
                    2026-08-20 — her call: the day a box landed is something you
                    know while you are standing in front of it counting, not
                    while you are packing it weeks earlier. */}

                {/* The size of THIS box. It goes on the packing list next to
                    the weight, because a carrier prices a pallet by both (098).
                    Not taken from the product: that is a full carton, and this
                    is whatever actually got packed. */}
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground shrink-0">Size cm</Label>
                  {SIZE_FIELDS.map((f, i) => (
                    <div key={f.key} className="contents">
                      {i > 0 && <span className="text-xs text-muted-foreground shrink-0">×</span>}
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        className="h-6 w-14 text-xs text-right px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder={f.short}
                        defaultValue={c[f.key] ?? ''}
                        onBlur={e => setSize(index, f.key, e.target.value)}
                      />
                    </div>
                  ))}
                  <span className="text-[11px] text-muted-foreground">l × w × h</span>
                </div>

                {/* The numbers that reach the documents. Shown here so nobody
                    has to open a PDF to find out what the load weighs. */}
                <p className="text-xs text-muted-foreground">
                  Gross{' '}
                  <span className="font-semibold text-foreground">
                    {grossPerColli[index].kg.toFixed(2)} kg
                  </span>{' '}
                  — packaging {Number(c.weight_kg ?? 0).toFixed(2)} kg + contents{' '}
                  {(grossPerColli[index].kg - Number(c.weight_kg ?? 0)).toFixed(2)} kg
                </p>

                {c.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Empty</p>
                ) : (
                  <div className="space-y-1">
                    {c.items.map(it => {
                      // The batch this product left Curaçao on, and with it the
                      // one THT it can have. Beside the box, so signing it in
                      // needs no second screen.
                      const info = thtFor(it.sku)
                      return (
                        <div key={it.sku} className="flex items-center gap-2 flex-wrap">
                          <span className="flex-1 min-w-0 truncate text-xs">{it.name}</span>
                          {info ? (
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {info.label ? `${info.label} · ` : ''}
                              {info.tht ? `THT ${formatTht(info.tht)}` : 'no THT'}
                            </span>
                          ) : !isPosLine(it) && (
                            <span className="text-[11px] text-red-600 shrink-0">no THT</span>
                          )}
                          <Input
                            type="number"
                            min="1"
                            className="h-6 w-16 text-xs text-right px-2"
                            defaultValue={it.qty}
                            onBlur={e => setItemQty(index, it.sku, Number(e.target.value) || 1)}
                          />
                          <button
                            onClick={() => removeItem(index, it.sku)}
                            className="text-muted-foreground hover:text-red-600"
                            title="Remove"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {available.length > 0 && (
                  <Select value="" onValueChange={(v) => v && addItem(index, v)}>
                    <SelectTrigger className="h-6 w-full text-xs">
                      <SelectValue placeholder="+ Add product to this colli" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map(i => (
                        <SelectItem key={i.sku} value={i.sku}>
                          {i.name}{i.ordered > 0 ? ` (${i.ordered} needed)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )
          })}

          {/* A product with no weight on the Products screen makes the gross
              weight too low, and too low is the direction that gets a load
              stopped. Said here rather than discovered on the B/L. */}
          {missingNames.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-2.5">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                Gross weight is too low — no weight set for these
              </p>
              {missingNames.map(name => (
                <p key={name} className="text-xs text-amber-700 dark:text-amber-400">{name}</p>
              ))}
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Fill in Weight (g) on the Products screen and this corrects itself.
              </p>
            </div>
          )}

          {posWithoutWeight.length > 0 && (
            <p className="text-xs text-muted-foreground">
              POS material has no weight of its own: {posWithoutWeight.join(', ')}.
              Put it in the packaging weight of the box it sits in.
            </p>
          )}

          {mismatches.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-2.5">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                Packed differently from what the orders on this transport need
              </p>
              {mismatches.map(m => (
                <p key={m.name} className="text-xs text-amber-700 dark:text-amber-400">
                  {m.name}: {m.inColli} packed, {m.ordered} needed
                </p>
              ))}
              {over.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  More than is outstanding is allowed — that is what re-sending a lost
                  load looks like. Nothing is blocked, this is only so you know.
                </p>
              )}
            </div>
          )}

          {/* A loose box is a normal load, not a gap: it ships, it is on the
              packing list, and the commercial invoice prices it from the order
              on board that carries that product. Naming an order is for the
              warehouse — it tells them which boxes to hand to whom. */}
          {loose > 0 && orders.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {loose} {loose === 1 ? 'box is' : 'boxes are'} loose stock. They still
              ship and are still declared — naming an order only tells the warehouse
              which boxes to hand over without opening them.
            </p>
          )}

          {orderLabel(colli[0]?.for_order_id) === null && orders.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No orders on this transport yet, so every box is loose stock.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
