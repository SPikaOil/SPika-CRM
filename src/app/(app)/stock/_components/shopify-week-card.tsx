'use client'

import { useState } from 'react'
import { ShoppingBag, Check, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { BatchSelect } from '@/components/batch-select'
import { useTransports } from '@/hooks/use-transports'
import { useAddStockMovements, useBatchStock, useTransportBatches } from '@/hooks/use-batches'
import { formatTht } from '@/lib/utils'
import { toast } from 'sonner'

// The return sku is the empty table bottle coming back, not something Shopify
// can sell. Same filter the handover screen uses.
const SELLABLE = SPIKA_PRODUCTS.filter(p => !p.sku.includes('return'))

// A sentinel, because a Select item cannot carry an empty value.
const CURACAO = '__curacao__'

/**
 * The week's Shopify sales, entered by hand.
 *
 * Danique, 2026-08-03: "Facturatie shopify gaat via een andere entiteit (...)
 * dus we zullen de orders shopify per week in app verwerken (dus ergens invoeren
 * zodat de partij aangepast word in aantallen."
 *
 * So the invoicing is somebody else's, but the BOTTLES are ours and they are
 * gone. Without this the batch keeps claiming stock that is already in the post.
 *
 * WHERE they went out from, Danique 2026-08-14: from Curaçao you pick the batch,
 * because you are standing in front of it. From a warehouse you cannot — nobody
 * over there reports batch numbers back. What you do know is which TRANSPORT
 * arrived, and the transport already carries the location and the batches on it.
 * So over there you pick the TP, and the batches follow from it.
 *
 * When a transport brought in two batches of the same product, the oldest
 * best-before goes first. Stock that expires first has to leave first, and
 * leaving that choice to whoever fills in the form is how a batch quietly runs
 * past its date.
 */
export function ShopifyWeekCard() {
  const addMovements = useAddStockMovements()
  const { data: transports } = useTransports()
  const { data: stock } = useBatchStock()

  const [open, setOpen] = useState(false)
  const [weekOf, setWeekOf] = useState(mondayOf(new Date()))
  /** Null = shipped from Curaçao, where you pick the batch yourself. */
  const [transportId, setTransportId] = useState<string | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const { data: arrivedBatches } = useTransportBatches(transportId)

  // Only a transport that actually holds stock somewhere can be shipped from:
  // it went to a place and it has been signed in. The "stays here as stock"
  // tick is no longer part of it (2026-08-21) — a goods receipt always books
  // what was counted, so arrived means there is something to take off.
  const stocked = (transports ?? []).filter(
    t => t.arrived_at && t.location_id
  )
  const transport = stocked.find(t => t.id === transportId) ?? null

  /** What is left of one sku at this transport's warehouse, oldest THT first. */
  function availableFor(sku: string) {
    if (!transport) return []
    return (arrivedBatches ?? [])
      .filter(b => b.sku === sku)
      .map(b => ({
        ...b,
        left: (stock ?? [])
          .filter(r => r.batch_id === b.batch_id && r.sku === sku && r.location_id === transport.location_id)
          .reduce((s, r) => s + r.qty, 0),
      }))
      .filter(b => b.left > 0)
      // Oldest best-before first. A batch without a date sorts last — it cannot
      // be shown to expire sooner than one that has a date.
      .sort((a, b) => (a.tht_date ?? '9999-12').localeCompare(b.tht_date ?? '9999-12'))
  }

  const total = SELLABLE.reduce((s, p) => s + (qty[p.sku] ?? 0), 0)

  function reset() {
    setOpen(false)
    setTransportId(null)
    setBatchId(null)
    setQty({})
    setWeekOf(mondayOf(new Date()))
  }

  async function save() {
    const lines = SELLABLE
      .map(p => ({ sku: p.sku, qty: qty[p.sku] ?? 0 }))
      .filter(l => l.qty > 0)
    if (lines.length === 0) { toast.error('Enter at least one bottle'); return }

    // From Curaçao you choose the batch. From a warehouse the transport decides.
    if (!transport && !batchId) { toast.error('Choose the batch these bottles came off'); return }

    const movements: {
      batch_id: string; sku: string; qty: number; location_id: string | null
      reason: 'shopify'; transport_id?: string; note: string
    }[] = []
    const short: string[] = []

    for (const line of lines) {
      if (!transport) {
        movements.push({
          batch_id: batchId!,
          sku: line.sku,
          qty: -line.qty,
          location_id: null,
          reason: 'shopify',
          note: `Shopify — week of ${weekOf}`,
        })
        continue
      }
      // Take from the oldest batch until this line is covered, then move to the
      // next. Two batches of one product become two movements, which is exactly
      // what happened on the shelf.
      let outstanding = line.qty
      for (const b of availableFor(line.sku)) {
        if (outstanding <= 0) break
        const take = Math.min(outstanding, b.left)
        movements.push({
          batch_id: b.batch_id,
          sku: line.sku,
          qty: -take,
          location_id: transport.location_id,
          reason: 'shopify',
          transport_id: transport.id,
          note: `Shopify — week of ${weekOf} · ${transport.transport_number}`,
        })
        outstanding -= take
      }
      // Never book more than is there. Say which line is short instead of
      // pushing a warehouse negative behind her back.
      if (outstanding > 0) {
        short.push(`${SELLABLE.find(p => p.sku === line.sku)?.name ?? line.sku}: ${outstanding} too many`)
      }
    }

    if (short.length > 0) {
      toast.error(`Not enough on ${transport?.transport_number} — ${short.join(', ')}`)
      return
    }

    setBusy(true)
    try {
      await addMovements.mutateAsync(movements)
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
                <Label className="text-xs">Transport</Label>
                {/* The trigger prints the raw value unless it is told what to
                    show — that is how "__curacao__" ended up on screen. */}
                <Select
                  value={transportId ?? CURACAO}
                  onValueChange={v => { if (v) { setTransportId(v === CURACAO ? null : v); setBatchId(null) } }}
                >
                  <SelectTrigger className="h-8 text-xs px-2">
                    <SelectValue>
                      {(v: string) => v === CURACAO
                        ? 'Straight from Curaçao'
                        : stocked.find(t => t.id === v)?.transport_number ?? 'Straight from Curaçao'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CURACAO}>Straight from Curaçao</SelectItem>
                    {stocked.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.transport_number}
                        <span className="text-muted-foreground"> · {t.location?.name ?? 'warehouse'}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* From Curaçao you are standing in front of the batch, so you say
                  which one. From a warehouse the transport already knows. */}
              {!transport ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Batch *</Label>
                  <BatchSelect value={batchId} onChange={setBatchId} />
                </div>
              ) : (
                <div className="sm:col-span-2 rounded-lg bg-muted/50 p-2 space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    At {transport.location?.name ?? 'the warehouse'} · oldest best-before goes first
                  </p>
                  {(arrivedBatches ?? []).length === 0 ? (
                    <p className="text-xs text-red-600">
                      Nothing was booked in on this transport
                    </p>
                  ) : (
                    Array.from(new Map((arrivedBatches ?? []).map(b => [b.batch_id, b])).values()).map(b => (
                      <p key={b.batch_id} className="text-xs">
                        <span className="font-mono">{b.batch_number}</span>
                        {b.tht_date ? <span className="text-muted-foreground"> · THT {formatTht(b.tht_date)}</span> : null}
                      </p>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Bottles sold</Label>
              {SELLABLE.map(p => {
                const there = transport
                  ? availableFor(p.sku).reduce((s, b) => s + b.left, 0)
                  : null
                return (
                  <div key={p.sku} className="flex items-center justify-between gap-2">
                    <span className="text-sm flex-1 min-w-0 truncate">
                      {p.name}
                      {there !== null && (
                        <span className={`text-xs ml-1.5 ${there === 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {there} there
                        </span>
                      )}
                    </span>
                    <Input type="number" min="0" className="h-7 w-24 text-sm text-right px-2"
                      value={qty[p.sku] ?? ''}
                      onChange={e => setQty(q => ({ ...q, [p.sku]: Math.max(0, Number(e.target.value) || 0) }))} />
                  </div>
                )
              })}
              <div className="flex justify-between text-sm font-semibold border-t pt-1.5">
                <span>Total</span>
                <span>{total} bottles</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
                disabled={busy || total === 0 || (!transport && !batchId)} onClick={save}>
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
