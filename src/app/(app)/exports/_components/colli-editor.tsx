'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Colli, Order, QuoteItem } from '@/types'
import { useSetOrderColli } from '@/hooks/use-transports'
import { useProducts } from '@/hooks/use-products'
import { colliGrossWeight, weightsBySku } from '@/lib/transport-cargo'

/**
 * The packing detail of one order: how many colli it is split into, what is in
 * each of them, and what the empty box weighs.
 *
 * The number of colli is the LENGTH of the array — there is no separate count
 * field, so "3 colli" and the three packages below it can never disagree.
 *
 * ONE weight is typed here and it is the PACKAGING: the box, the filler, the
 * tape. The bottles are already listed in the box and every product carries its
 * weight on the Products screen, so the gross weight is worked out rather than
 * re-typed after every repack. Her instruction of 2026-08-19.
 *
 * Nothing here is mandatory. A transport can leave with colli that have not
 * been packed out yet; the screen only points out where the packing does not
 * add up to what was ordered, it never blocks.
 */
export function ColliEditor({ order }: { order: Order }) {
  const setColli = useSetOrderColli()
  const [open, setOpen] = useState(false)
  const { data: products } = useProducts()
  const weights = weightsBySku(products)

  const colli: Colli[] = order.colli_contents ?? []
  const orderItems = ((order.items ?? []) as QuoteItem[]).filter(i => i.qty > 0)

  function write(next: Colli[]) {
    setColli.mutate({ orderId: order.id, colli: next })
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

  function addItem(index: number, sku: string) {
    const source = orderItems.find(i => i.sku === sku)
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

  // What is packed versus what was ordered. Shown as a hint, never as a block —
  // a half-packed transport is a normal state of affairs, a silently wrong
  // packing list is not.
  const packed = new Map<string, number>()
  for (const c of colli) {
    for (const it of c.items) packed.set(it.sku, (packed.get(it.sku) ?? 0) + it.qty)
  }
  const mismatches = orderItems
    .map(i => ({ name: i.name, ordered: i.qty, inColli: packed.get(i.sku) ?? 0 }))
    .filter(m => m.inColli !== m.ordered)

  // Gross for the whole order: every box plus its contents. `missing` names the
  // products with no weight on the Products screen — their bottles are simply
  // not counted, which makes the total too LOW, so it is said out loud instead
  // of quietly ending up on a customs paper.
  const grossPerColli = colli.map(c => colliGrossWeight(c, weights))
  const grossTotal = grossPerColli.reduce((sum, g) => sum + g.kg, 0)
  const missingWeights = Array.from(new Set(grossPerColli.flatMap(g => g.missing)))
  const missingNames = missingWeights.map(
    sku => orderItems.find(i => i.sku === sku)?.name ?? sku,
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <PackageCheck className="h-3.5 w-3.5" />
          {colli.length} {colli.length === 1 ? 'colli' : 'colli'}
          {grossTotal > 0 && ` · ${grossTotal.toFixed(2)} kg gross`}
        </button>
        {colli.length === 0 && (
          <span className="text-xs text-red-600">not packed yet</span>
        )}
        {mismatches.length > 0 && colli.length > 0 && (
          <span className="text-xs text-amber-600">
            packing does not match the order
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
            const available = orderItems.filter(i => !c.items.some(it => it.sku === i.sku))
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

                {/* The number that reaches the documents. Shown here so nobody
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
                          {i.name} ({i.qty} ordered)
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
                Packed differently from what was ordered
              </p>
              {mismatches.map(m => (
                <p key={m.name} className="text-xs text-amber-700 dark:text-amber-400">
                  {m.name}: {m.inColli} in colli, {m.ordered} ordered
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
