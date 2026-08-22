'use client'

import { useState } from 'react'
import { Boxes, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useBatches, useBatchStock } from '@/hooks/use-batches'
import { useBatchCosts } from '@/hooks/use-batch-costs'
import { useTransports } from '@/hooks/use-transports'
import { useAuth } from '@/contexts/auth-context'
import { atPlace } from '@/lib/stock-place'
import { formatTht, formatCurrency } from '@/lib/utils'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { transportColli } from '@/lib/transport-cargo'

/**
 * The batches of one warehouse, as thin rows you open.
 *
 * Her design, 2026-08-21: "ik zou denken partijen als dun vakje die je kunt
 * uitklappen waar je alle info in ziet (tp#, ATA, VVP per item etc etc)."
 *
 * Everything about an intake batch already exists — it is just spread over the
 * transport, the colli and the movements — so this gathers it in the one place
 * somebody stands when they need it. A recall starts here: which batch, and how
 * much of it is still on this shelf.
 *
 * An EMPTY batch stays in the list, greyed out and dropped to the bottom.
 * Hiding it would make it look as though it never existed, and "what happened
 * at this warehouse six months ago" is exactly the question she asked.
 *
 * The cost price shows only for whoever may read it — it lives behind its own
 * rule since migration 116, so a warehouse account simply gets no number and
 * the line is not drawn.
 */
export function BatchesAtPlace({ locationId }: { locationId: string | null }) {
  const { data: batches } = useBatches()
  const { data: stock } = useBatchStock()
  const { data: costs } = useBatchCosts()
  const { data: transports } = useTransports()
  const { isAdmin } = useAuth()
  const [open, setOpen] = useState<string | null>(null)

  const productName = (sku: string) => SPIKA_PRODUCTS.find(p => p.sku === sku)?.name ?? sku

  /** What is left of this batch HERE. The place's own, never what somebody carries. */
  const leftOf = (batchId: string) =>
    (stock ?? [])
      .filter(r => r.batch_id === batchId && atPlace(r, locationId))
      .reduce((s, r) => s + r.qty, 0)

  const costOf = (batchId: string) => {
    const v = (costs ?? []).find(c => c.batch_id === batchId)?.vvp
    return v === null || v === undefined ? null : Number(v)
  }
  const breakdownOf = (batchId: string) =>
    ((costs ?? []).find(c => c.batch_id === batchId)?.breakdown ?? null) as
      | { product?: number | null; freight?: number; local?: number; storage?: number; rate?: number; bottles?: number }
      | null

  const here = (batches ?? [])
    .filter(b => (b.location_id ?? null) === locationId && b.parent_batch_id)
    .map(b => ({ ...b, left: leftOf(b.id) }))
    // Standing stock first, then the empties — history without clutter.
    .sort((a, b) =>
      (b.left > 0 ? 1 : 0) - (a.left > 0 ? 1 : 0)
      || (a.tht_date ?? '9999-12').localeCompare(b.tht_date ?? '9999-12'),
    )

  if (here.length === 0) {
    return <p className="text-sm text-muted-foreground">No batches here yet</p>
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Boxes className="h-3.5 w-3.5" />
        Batches · {here.length}
      </p>

      {here.map(b => {
        const isOpen = open === b.id
        const transport = (transports ?? []).find(t => t.id === b.transport_id)
        const cost = costOf(b.id)
        const parts = breakdownOf(b.id)

        // Which box it came in on, when it landed and what was counted. Kept on
        // the colli of the transport, which is where the goods receipt wrote it.
        const boxes = transport ? transportColli(transport) : []
        const arrivals = boxes
          .filter(c => c.ata && (c.received_items ?? []).some(l => l.sku === b.sku))
          .map(c => ({
            ata: c.ata as string,
            note: c.ata_note ?? '',
            lines: (c.received_items ?? []).filter(l => l.sku === b.sku),
          }))

        return (
          <div key={b.id} className={`rounded-lg border ${b.left > 0 ? 'bg-card' : 'bg-muted/40'}`}>
            <button
              onClick={() => setOpen(isOpen ? null : b.id)}
              className="w-full flex items-center gap-2 px-2.5 py-1 text-left leading-tight"
            >
              {isOpen
                ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              <span className="font-mono text-xs font-medium truncate">{b.batch_number}</span>
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                {productName(b.sku)}
              </span>
              {b.tht_date && (
                <span className="text-xs text-muted-foreground shrink-0">THT {formatTht(b.tht_date)}</span>
              )}
              {b.left === 0 && <Badge className="text-[10px] bg-gray-100 text-gray-500 shrink-0">Empty</Badge>}
              <span className="ml-auto text-sm font-semibold shrink-0">{b.left}</span>
            </button>

            {isOpen && (
              <div className="px-2.5 pb-2 pt-1 border-t space-y-1 text-xs">
                <Row label="Product" value={productName(b.sku)} />
                {transport && <Row label="Transport" value={transport.transport_number} />}
                {arrivals.map((a, i) => (
                  <div key={i} className="space-y-0.5">
                    <Row label="Arrived" value={new Date(a.ata + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })} />
                    {a.lines.map((l, j) => (
                      <Row
                        key={j}
                        label="Counted"
                        value={l.received === l.expected
                          ? `${l.received}`
                          : `${l.received} of ${l.expected}${l.reason ? ` — ${l.reason}` : ''}`}
                      />
                    ))}
                    {a.note && <Row label="Note" value={a.note} />}
                  </div>
                ))}

                {/* The cost price and how it was arrived at. Admin only — the
                    count is warehouse business, the money is not. */}
                {isAdmin && parts && (
                  <div className="pt-1 border-t space-y-0.5">
                    {parts.product !== null && parts.product !== undefined && (
                      <Row label="Product" value={formatCurrency(parts.product, 'XCG')} />
                    )}
                    {!!parts.freight && <Row label="Freight" value={formatCurrency(parts.freight, 'XCG')} />}
                    {!!parts.local && <Row label="Local costs" value={formatCurrency(parts.local, 'XCG')} />}
                    {!!parts.storage && <Row label="Storage" value={formatCurrency(parts.storage, 'XCG')} />}
                    {parts.rate !== undefined && parts.rate !== 1 && (
                      <Row label="Rate used" value={String(parts.rate)} />
                    )}
                    {parts.bottles !== undefined && (
                      <Row label="Spread over" value={`${parts.bottles} bottles received`} />
                    )}
                    <Row
                      label="Cost per bottle"
                      value={cost === null ? 'product cost not set yet' : formatCurrency(cost, 'XCG')}
                      strong
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right min-w-0 truncate ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
