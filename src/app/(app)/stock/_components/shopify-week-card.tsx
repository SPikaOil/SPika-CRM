'use client'

import { useState } from 'react'
import { ShoppingBag, Check, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SPIKA_PRODUCTS } from '@/lib/products'

// The return sku is the empty table bottle coming back, not something Shopify
// can sell. Same filter the handover screen uses.
const SELLABLE = SPIKA_PRODUCTS.filter(p => !p.sku.includes('return'))
import { BatchSelect } from '@/components/batch-select'
import { useAddStockMovements } from '@/hooks/use-batches'
import { toast } from 'sonner'

/**
 * The week's Shopify sales, entered by hand.
 *
 * Danique, 2026-08-03: "Facturatie shopify gaat via een andere entiteit (...)
 * dus we zullen de orders shopify per week in app verwerken (dus ergens invoeren
 * zodat de partij aangepast word in aantallen."
 *
 * So the invoicing is somebody else's, but the BOTTLES are ours: they came off a
 * batch on Curaçao and they are gone. Without this the batch would keep claiming
 * stock that is already in the post, and every count after it would be wrong.
 *
 * One batch per entry, like a handover. If a week ran out of one batch and into
 * the next, book it as two entries — that is what actually happened, and it
 * keeps each batch's history true.
 */
export function ShopifyWeekCard() {
  const addMovements = useAddStockMovements()

  const [open, setOpen] = useState(false)
  const [weekOf, setWeekOf] = useState(mondayOf(new Date()))
  const [batchId, setBatchId] = useState<string | null>(null)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const total = SELLABLE.reduce((s, p) => s + (qty[p.sku] ?? 0), 0)

  function reset() {
    setOpen(false)
    setBatchId(null)
    setQty({})
    setWeekOf(mondayOf(new Date()))
  }

  async function save() {
    const lines = SELLABLE
      .map(p => ({ sku: p.sku, qty: qty[p.sku] ?? 0 }))
      .filter(l => l.qty > 0)
    if (lines.length === 0) { toast.error('Enter at least one bottle'); return }
    if (!batchId) { toast.error('Choose the batch these bottles came off'); return }

    setBusy(true)
    try {
      await addMovements.mutateAsync(lines.map(l => ({
        batch_id: batchId,
        sku: l.sku,
        qty: -l.qty,
        // Sold from Curaçao, so no location: null is home.
        reason: 'shopify' as const,
        note: `Shopify — week of ${weekOf}`,
      })))
      toast.success(`${total} bottles booked off for the week of ${weekOf}`)
      reset()
    } catch {
      // useAddStockMovements already surfaces its own error.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="py-3 gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShoppingBag className="h-4 w-4" />
          Shopify — this week
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!open ? (
          <>
            <p className="text-sm text-muted-foreground">
              Enter what Shopify sold this week so the batch is counted down.
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Book the week
            </Button>
          </>
        ) : (
          <div className="rounded-lg border p-3 space-y-2.5">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Week of</Label>
                <Input type="date" className="h-8" value={weekOf}
                  onChange={e => setWeekOf(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Batch *</Label>
                <BatchSelect value={batchId} onChange={setBatchId} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Bottles sold</Label>
              {SELLABLE.map(p => (
                <div key={p.sku} className="flex items-center justify-between gap-2">
                  <span className="text-sm flex-1 min-w-0 truncate">{p.name}</span>
                  <Input type="number" min="0" className="h-7 w-24 text-sm text-right px-2"
                    value={qty[p.sku] ?? ''}
                    onChange={e => setQty(q => ({ ...q, [p.sku]: Math.max(0, Number(e.target.value) || 0) }))} />
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold border-t pt-1.5">
                <span>Total</span>
                <span>{total} bottles</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
                disabled={busy || total === 0 || !batchId} onClick={save}>
                <Check className="h-3.5 w-3.5" />
                Book off
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={reset}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** The Monday of the week a date falls in — a week is booked, not a day. */
function mondayOf(d: Date): string {
  const copy = new Date(d)
  const day = (copy.getDay() + 6) % 7
  copy.setDate(copy.getDate() - day)
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, '0')}-${String(copy.getDate()).padStart(2, '0')}`
}
