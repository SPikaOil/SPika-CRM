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
import { useSetTransportColli } from '@/hooks/use-transports'
import { useProducts } from '@/hooks/use-products'
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
  const weights = weightsBySku(products)

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
  const needed = new Map<string, { name: string; qty: number }>()
  for (const o of orders) {
    for (const i of ((o.on_transport ?? o.items ?? []) as QuoteItem[])) {
      if (i.qty <= 0) continue
      const at = needed.get(i.sku)
      if (at) at.qty += i.qty
      else needed.set(i.sku, { name: i.name, qty: i.qty })
    }
  }

  /**
   * Everything that can go in a box: the whole catalogue, because a transport
   * moves stock and may carry bottles no order has asked for yet. What the
   * orders need is shown beside it so the common case stays one glance away.
   */
  const catalogue = (products ?? []).map(p => ({
    sku: p.sku,
    name: p.name,
    ordered: needed.get(p.sku)?.qty ?? 0,
  }))

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

  // Gross for the whole load: every box plus its contents. `missing` names the
  // products with no weight on the Products screen — their bottles are simply
  // not counted, which makes the total too LOW, so it is said out loud instead
  // of quietly ending up on a customs paper.
  const grossPerColli = colli.map(c => colliGrossWeight(c, weights))
  const grossTotal = grossPerColli.reduce((sum, g) => sum + g.kg, 0)
  const missingWeights = Array.from(new Set(grossPerColli.flatMap(g => g.missing)))
  const missingNames = missingWeights.map(
    sku => catalogue.find(i => i.sku === sku)?.name ?? sku,
  )

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
        {over.length > 0 && (
          <span className="text-xs text-amber-600">
            carries more than is outstanding
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
                    {c.items.map(it => (
                      <div key={it.sku} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate text-xs">{it.name}</span>
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
                    ))}
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
