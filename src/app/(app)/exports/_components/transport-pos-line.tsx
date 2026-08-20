'use client'

import { useState } from 'react'
import { Package, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import { usePosItems } from '@/hooks/use-pos-items'
import { useUpdateTransport } from '@/hooks/use-transports'
import { useUpdateOrder } from '@/hooks/use-orders'
import { posOrderLineFor, isPosLine } from '@/lib/pos'
import { transportColli } from '@/lib/transport-cargo'
import { driveThumbnail } from '@/lib/marketing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { QuoteItem, Transport } from '@/types'

/** The owner value for a piece that belongs to no order. */
const LOOSE = '__loose__'

/**
 * All the POS material on this load, and where each piece comes from.
 *
 * This box used to show only the material added to the TRANSPORT itself, under
 * the heading "POS material on this transport". Danique, 2026-08-20: the packing
 * above said there were two stands in Colli 2 while this said "Nothing yet", and
 * she was right that it reads as a contradiction. Both statements were true of
 * their own field and neither was true of the load.
 *
 * POS can arrive here three ways and all three are legitimate:
 *   on an order      a stand a reseller gets — a €0 line on their order
 *   on the transport material going to our own warehouse, no customer involved
 *   in a box         where it physically sits, which is a different question
 *
 * So this is one list of what is going along, saying for each piece whose it is
 * and whether it is packed yet. A stand on an order that is in no box shows up
 * as exactly that, which is how her missing 12-bottle stand became visible.
 *
 * Only the loose ones can be edited here: material on an order belongs to the
 * order, and a piece in a box is moved by repacking it.
 *
 * It books no POS stock. That happens where it always has — the POS panel on the
 * Warehouse page, with "Left on a transport" — because a box of wobblers can be
 * taken off a shelf days after somebody typed it onto the load.
 */
export function TransportPosLine({ transport }: { transport: Transport }) {
  const { can, isAdmin } = useAuth()
  const canGrant = isAdmin || can('pos.grant')

  const { data: catalogue } = usePosItems()
  const update = useUpdateTransport()
  const updateOrder = useUpdateOrder()

  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('1')
  /** Whose piece this is: an order on this load, or nobody. */
  const [owner, setOwner] = useState<string>(LOOSE)

  const loose = transport.pos_items ?? []

  /** Which box each piece sits in, by sku. A piece can be spread over two. */
  const boxesOf = new Map<string, number[]>()
  transportColli(transport).forEach((c, i) => {
    for (const item of c.items) {
      if (!isPosLine(item)) continue
      boxesOf.set(item.sku, [...(boxesOf.get(item.sku) ?? []), i + 1])
    }
  })

  type Row = { sku: string; name: string; qty: number; source: string; loose: boolean }
  const rows: Row[] = []

  // From the orders this transport is meant for.
  for (const o of transport.orders ?? []) {
    for (const line of ((o.items ?? []) as QuoteItem[])) {
      if (!isPosLine(line) || line.qty <= 0) continue
      rows.push({
        sku: line.sku,
        name: line.name,
        qty: line.qty,
        source: o.order_number,
        loose: false,
      })
    }
  }

  // Added to the load itself, with no customer behind it.
  for (const line of loose) {
    rows.push({ sku: line.sku, name: line.name, qty: line.qty, source: 'no order', loose: true })
  }

  // And anything sitting in a box that neither of the two above accounts for —
  // her stand of 8, packed but declared nowhere. Better named than hidden.
  for (const [sku, boxes] of boxesOf) {
    if (rows.some(r => r.sku === sku)) continue
    const inBox = transportColli(transport)
      .flatMap(c => c.items)
      .filter(i => i.sku === sku)
    rows.push({
      sku,
      name: inBox[0]?.name ?? sku,
      qty: inBox.reduce((s, i) => s + i.qty, 0),
      source: `only in Colli ${boxes.join(', ')}`,
      loose: false,
    })
  }

  function write(next: { sku: string; name: string; qty: number }[]) {
    update.mutate({ id: transport.id, values: { pos_items: next } as never })
  }

  /**
   * Put a piece of POS on this load, for a reseller or for nobody.
   *
   * Whose it is, is asked HERE, so there is one door. The per-order POS box that
   * used to sit on this screen said the same things over again the moment this
   * list started showing them — her point of 2026-08-20 about seeing everything
   * twice.
   */
  function add() {
    const item = (catalogue ?? []).find(i => i.id === pick)
    if (!item) return
    const line = posOrderLineFor(item, Math.max(1, Number(qty) || 1))
    if (rows.some(r => r.sku === line.sku)) {
      toast.error('That one is already going along on this transport')
      return
    }

    if (owner === LOOSE) {
      write([...loose, { sku: line.sku, name: line.name, qty: line.qty }])
    } else {
      // On an order it stays what it has always been: a €0 line, so it reaches
      // the packing list the same way everything else on that order does.
      const target = (transport.orders ?? []).find(o => o.id === owner)
      if (!target) return
      const items = ((target.items ?? []) as QuoteItem[])
      updateOrder.mutate({ id: target.id, values: { items: [...items, line] } as never })
    }

    setPick('')
    setQty('1')
    setAdding(false)
  }

  const available = (catalogue ?? []).filter(
    i => !rows.some(r => r.sku === posOrderLineFor(i, 1).sku),
  )

  // Nothing in the catalogue and nothing going along: no reason to take up room
  // on a screen that is already busy.
  if ((catalogue ?? []).length === 0 && rows.length === 0) return null

  return (
    <div className="rounded-lg border border-dashed p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          POS material going along
        </p>
        {canGrant && !adding && available.length > 0 && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={pick || 'none'} onValueChange={v => setPick(!v || v === 'none' ? '' : v)}>
            <SelectTrigger className="h-7 flex-1 min-w-[160px] text-xs">
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Pick one</SelectItem>
              {available.map(i => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="h-7 w-14 text-xs"
          />
          {/* Whose it is. On an order it becomes a €0 line on that order; on
              nobody it rides with the load itself. */}
          <Select value={owner} onValueChange={v => v && setOwner(v)}>
            <SelectTrigger className="h-7 min-w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LOOSE}>No order — with the load</SelectItem>
              {(transport.orders ?? []).map(o => (
                <SelectItem key={o.id} value={o.id}>
                  {o.order_number} — {o.customer?.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-7 text-xs" onClick={add} disabled={!pick || update.isPending}>
            Add
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setAdding(false); setPick('') }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nothing yet. Anything added here goes on the packing list, with or without
          an order on this transport.
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map(r => {
            const item = (catalogue ?? []).find(i => posOrderLineFor(i, 1).sku === r.sku)
            const photo = (item?.photos ?? [])[0]
            const boxes = boxesOf.get(r.sku)
            return (
              <div key={r.sku} className="flex items-center gap-2">
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={driveThumbnail(photo, 80)} alt="" className="h-6 w-6 rounded object-cover border shrink-0" />
                )}
                <span className="text-xs font-medium w-6 shrink-0">{r.qty}×</span>
                <span className="text-xs flex-1 truncate">
                  {r.name.replace(' (POS material)', '')}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">{r.source}</span>
                {/* Packed or not. A stand on an order that is in no box is the
                    one you want to catch before the container leaves. */}
                <span className={`text-[11px] shrink-0 ${boxes ? 'text-muted-foreground' : 'text-amber-600'}`}>
                  {boxes ? `Colli ${boxes.join(', ')}` : 'not in a box'}
                </span>
                {canGrant && r.loose && (
                  <button
                    onClick={() => {
                      if (!confirm(`Take ${r.name.replace(' (POS material)', '')} off this transport?`)) return
                      write(loose.filter(l => l.sku !== r.sku))
                    }}
                    className="text-muted-foreground hover:text-red-600 shrink-0"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
