'use client'

import { useState } from 'react'
import { Package, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import { usePosItems } from '@/hooks/use-pos-items'
import { useUpdateTransport } from '@/hooks/use-transports'
import { posOrderLineFor } from '@/lib/pos'
import { driveThumbnail } from '@/lib/marketing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Transport } from '@/types'

/**
 * POS material riding on a transport, with no order behind it.
 *
 * Danique, 2026-08-19: "stel we hebben een transport waar we het niet linken
 * aan een order, dan moeten we nogsteeds POS materiaal kunnen selecteren om mee
 * te sturen." Until now a stand was a €0 line on an ORDER — the only reason it
 * reached the packing list — so a load carrying no order had nowhere to put
 * one. And a stock transfer to our own warehouse is precisely the load that
 * carries display material.
 *
 * Picked from the whole CATALOGUE rather than from a reseller's register: there
 * is no reseller here. The material is going to a warehouse, and who eventually
 * gets it is decided over there.
 *
 * It does not move POS stock by itself. That is booked where it has always been
 * booked — the POS panel on the Warehouse page, with "Left on a transport" —
 * because a box of wobblers can be picked off a shelf days after somebody typed
 * it onto the load.
 */
export function TransportPosLine({ transport }: { transport: Transport }) {
  const { can, isAdmin } = useAuth()
  const canGrant = isAdmin || can('pos.grant')

  const { data: catalogue } = usePosItems()
  const update = useUpdateTransport()

  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('1')

  const onLoad = transport.pos_items ?? []

  function write(next: { sku: string; name: string; qty: number }[]) {
    update.mutate({ id: transport.id, values: { pos_items: next } as never })
  }

  function add() {
    const item = (catalogue ?? []).find(i => i.id === pick)
    if (!item) return
    const line = posOrderLineFor(item, Math.max(1, Number(qty) || 1))
    if (onLoad.some(l => l.sku === line.sku)) {
      toast.error('That one is already on this transport')
      return
    }
    write([...onLoad, { sku: line.sku, name: line.name, qty: line.qty }])
    setPick('')
    setQty('1')
    setAdding(false)
  }

  function remove(sku: string) {
    write(onLoad.filter(l => l.sku !== sku))
  }

  const available = (catalogue ?? []).filter(
    i => !onLoad.some(l => l.sku === posOrderLineFor(i, 1).sku),
  )

  // Nothing in the catalogue and nothing on the load: no reason to take up room
  // on a screen that is already busy.
  if ((catalogue ?? []).length === 0 && onLoad.length === 0) return null

  return (
    <div className="rounded-lg border border-dashed p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          POS material on this transport
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
          <Button size="sm" className="h-7 text-xs" onClick={add} disabled={!pick || update.isPending}>
            Add
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setAdding(false); setPick('') }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {onLoad.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nothing yet. Anything added here goes on the packing list, with or without
          an order on this transport.
        </p>
      ) : (
        <div className="space-y-1">
          {onLoad.map(line => {
            const item = (catalogue ?? []).find(i => posOrderLineFor(i, 1).sku === line.sku)
            const photo = (item?.photos ?? [])[0]
            return (
              <div key={line.sku} className="flex items-center gap-2">
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={driveThumbnail(photo, 80)} alt="" className="h-6 w-6 rounded object-cover border shrink-0" />
                )}
                <span className="text-xs font-medium w-6 shrink-0">{line.qty}×</span>
                <span className="text-xs flex-1 truncate">
                  {line.name.replace(' (POS material)', '')}
                </span>
                {canGrant && (
                  <button
                    onClick={() => {
                      if (!confirm(`Take ${line.name.replace(' (POS material)', '')} off this transport?`)) return
                      remove(line.sku)
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
