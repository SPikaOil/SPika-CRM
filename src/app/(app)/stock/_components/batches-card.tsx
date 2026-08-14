'use client'

import { useState } from 'react'
import { Boxes, Plus, Check, X, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { formatTht, thtToMonthInput, monthInputToTht, currentMonthInput } from '@/lib/utils'
import {
  useBatches, useBatchStock, useCreateBatch, useAddStockMovements,
} from '@/hooks/use-batches'
import { toast } from 'sonner'

/**
 * Batches, where they begin.
 *
 * Danique's rule: a batch starts here. You fill bottles, create a batch such as
 * SPGE22 and allocate what you just filled to it. From that moment the batch
 * follows the goods — it is chosen on an order, it travels on a transport, it
 * is received or signed for, and afterwards you can see which orders ran under
 * it. No batch, no handover: you cannot give away bottles that were never
 * filled.
 *
 * Not to be confused with a production run, which is only how many litres of
 * oil were made in a month and has no number at all.
 *
 * Allocating writes stock MOVEMENTS, never a total. That is what makes a batch
 * traceable later and a mistake reversible by booking its mirror image instead
 * of editing history.
 */
export function BatchesCard() {
  const { data: batches } = useBatches()
  const { data: stock } = useBatchStock()
  const createBatch = useCreateBatch()
  const addMovements = useAddStockMovements()

  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [number, setNumber] = useState('')
  const [tht, setTht] = useState('')
  const [qty, setQty] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  // What is left of a batch, on Curacao. location_id null = home.
  const remaining = new Map<string, { sku: string; name: string; qty: number }[]>()
  for (const row of stock ?? []) {
    if (row.location_id !== null) continue
    const list = remaining.get(row.batch_id) ?? []
    list.push({ sku: row.sku, name: row.product_name, qty: row.qty })
    remaining.set(row.batch_id, list)
  }

  function reset() {
    setAdding(false)
    setNumber('')
    setTht('')
    setQty({})
  }

  async function create() {
    const lines = SPIKA_PRODUCTS
      .map(p => ({ sku: p.sku, name: p.name, qty: qty[p.sku] ?? 0 }))
      .filter(l => l.qty > 0)

    if (!number.trim()) return
    if (lines.length === 0) { toast.error('Allocate at least one product to this batch'); return }

    setBusy(true)
    try {
      const batch = await createBatch.mutateAsync({
        batch_number: number.trim().toUpperCase(),
        tht_date: monthInputToTht(tht),
      })
      await addMovements.mutateAsync(lines.map(l => ({
        batch_id: batch.id,
        sku: l.sku,
        qty: l.qty,
        // Filled on Curacao, so no location: null is home.
        reason: 'filled' as const,
        note: 'Filled and allocated to the batch',
      })))
      reset()
    } catch {
      // Both hooks already surface their own error; nothing to add here.
    } finally {
      setBusy(false)
    }
  }

  const totalToAllocate = SPIKA_PRODUCTS.reduce((s, p) => s + (qty[p.sku] ?? 0), 0)

  return (
    <Card className="py-3 gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Boxes className="h-4 w-4" />
          Batches
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(batches ?? []).length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No batches yet. Fill bottles, then create a batch and allocate them to it.
          </p>
        )}

        <div className="space-y-1.5">
          {(batches ?? []).map(b => {
            const left = remaining.get(b.id) ?? []
            const total = left.reduce((s, l) => s + l.qty, 0)
            const open = expanded === b.id
            return (
              <div key={b.id} className="rounded-xl border bg-card">
                <button
                  onClick={() => setExpanded(open ? null : b.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium">{b.batch_number}</span>
                      {b.tht_date && (
                        <Badge className="text-xs bg-slate-100 text-slate-700">
                          THT {formatTht(b.tht_date)}
                        </Badge>
                      )}
                      {total === 0 && (
                        <Badge className="text-xs bg-gray-100 text-gray-500">Empty</Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{total} left</span>
                </button>
                {open && (
                  <div className="px-3 pb-2 pt-0 space-y-0.5 border-t">
                    {left.length === 0 ? (
                      <p className="text-xs text-muted-foreground pt-1.5">
                        Nothing left of this batch on Curaçao.
                      </p>
                    ) : left.map(l => (
                      <div key={l.sku} className="flex justify-between text-sm pt-1">
                        <span className="text-muted-foreground">{l.name}</span>
                        <span className="font-medium">{l.qty}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {adding ? (
          <div className="rounded-lg border p-3 space-y-2.5">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Batch number *</Label>
                <Input autoFocus className="h-8 font-mono" placeholder="e.g. SPGE22"
                  value={number} onChange={e => setNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">THT — best before</Label>
                {/* Month and year, like every THT in this app, and never in the
                    past: a batch filled today cannot expire yesterday. */}
                <Input type="month" className="h-8" min={currentMonthInput()}
                  value={thtToMonthInput(monthInputToTht(tht))}
                  onChange={e => setTht(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Bottles filled</Label>
              {SPIKA_PRODUCTS.map(p => (
                <div key={p.sku} className="flex items-center justify-between gap-2">
                  <span className="text-sm flex-1 min-w-0 truncate">{p.name}</span>
                  <Input type="number" min="0" className="h-7 w-24 text-sm text-right px-2"
                    value={qty[p.sku] ?? ''}
                    onChange={e => setQty(q => ({ ...q, [p.sku]: Math.max(0, Number(e.target.value) || 0) }))} />
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold border-t pt-1.5">
                <span>Total</span>
                <span>{totalToAllocate} bottles</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
                disabled={busy || !number.trim() || totalToAllocate === 0} onClick={create}>
                <Check className="h-3.5 w-3.5" />
                Create batch
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={reset}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            New batch
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
