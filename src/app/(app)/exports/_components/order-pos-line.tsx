'use client'

import { useState } from 'react'
import { Package, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import { useCustomerPosItems } from '@/hooks/use-pos-items'
import { useUpdateOrder } from '@/hooks/use-orders'
import { posOrderLineFor, isPosLine } from '@/lib/pos'
import { driveThumbnail } from '@/lib/marketing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Order, QuoteItem } from '@/types'

/**
 * Put POS material on an order that already exists.
 *
 * Her case: a transport for La Bandera is being put together and a stand is
 * going along, and there was nowhere to say so. The picker until now lived only
 * on a NEW order and on a delivery run — by the time a transport is being
 * loaded, both of those moments have passed.
 *
 * It writes a €0 line onto the order, so it reaches the packing list the same
 * way everything else does: that document prints the lines it is given. No
 * separate path, no second place for the warehouse to look.
 */
export function OrderPosLine({ order }: { order: Order }) {
  const { can, isAdmin } = useAuth()
  const canGrant = isAdmin || can('pos.grant')

  const { data: register } = useCustomerPosItems((order as never as { customer_id: string }).customer_id)
  const updateOrder = useUpdateOrder()

  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('1')

  const items = ((order.items ?? []) as QuoteItem[])
  const onOrder = items.filter(isPosLine)

  function add() {
    const row = (register ?? []).find(r => r.pos_item_id === pick)
    if (!row?.item) return
    const line = posOrderLineFor(row.item, Math.max(1, Number(qty) || 1))
    if (items.some(i => i.sku === line.sku)) {
      toast.error('That one is already on this order')
      return
    }
    updateOrder.mutate(
      { id: order.id, values: { items: [...items, line] } as never },
      {
        onSuccess: () => { setPick(''); setQty('1'); setAdding(false); toast.success('Added to the packing list') },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  function remove(sku: string) {
    updateOrder.mutate(
      { id: order.id, values: { items: items.filter(i => i.sku !== sku) } as never },
      { onError: (err: Error) => toast.error(err.message) },
    )
  }

  // Nothing registered on this reseller and nothing on the order: no reason to
  // take up space on a screen that is already busy.
  if ((register ?? []).length === 0 && onOrder.length === 0) return null

  const available = (register ?? []).filter(
    r => !items.some(i => i.sku === posOrderLineFor(r.item!, 1).sku),
  )

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
              {available.map(r => (
                <SelectItem key={r.id} value={r.pos_item_id}>{r.item?.name}</SelectItem>
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
          <Button size="sm" className="h-7 text-xs" onClick={add} disabled={!pick || updateOrder.isPending}>
            Add
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setAdding(false); setPick('') }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {onOrder.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nothing yet. Anything added here shows on the packing list at €0.
        </p>
      ) : (
        <div className="space-y-1">
          {onOrder.map(line => {
            const row = (register ?? []).find(r => posOrderLineFor(r.item!, 1).sku === line.sku)
            const photo = (row?.item?.photos ?? [])[0]
            return (
              <div key={line.sku} className="flex items-center gap-2">
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={driveThumbnail(photo, 80)} alt="" className="h-6 w-6 rounded object-cover border shrink-0" />
                )}
                <span className="text-xs font-medium w-6 shrink-0">{line.qty}×</span>
                <span className="text-xs flex-1 truncate">{line.name.replace(' (POS material)', '')}</span>
                {canGrant && (
                  <button
                    onClick={() => {
                      if (!confirm(`Take ${line.name.replace(' (POS material)', '')} off this order?`)) return
                      remove(line.sku)
                    }}
                    className="text-muted-foreground hover:text-red-600 p-0.5 shrink-0"
                    aria-label="Remove"
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
