'use client'

import { useState } from 'react'
import { PackageCheck, Loader2, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { useUpdateTransport } from '@/hooks/use-transports'
import { Transport, QuoteItem } from '@/types'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * Signing a transport in at the other end.
 *
 * Two things happen at a warehouse, and Danique's answer on 2026-08-14 was that
 * BOTH occur: sometimes the bottles stay there as stock and are shipped onward
 * later, sometimes the warehouse only forwards a load that is already sold. So
 * it is a choice per transport, not a rule.
 *
 * Stays as stock  → the bottles are booked IN at the warehouse ('received'), and
 *                   the batch can be seen sitting there instead of on Curaçao.
 * Only forwarded  → nothing is booked. The bottles left Curaçao when the batch
 *                   was picked on the order and they are on their way to the
 *                   customer; adding them to a warehouse would invent stock that
 *                   is never taken off again.
 *
 * There is deliberately no separate 'left Curaçao' booking. Picking the batch on
 * the order already took those bottles off the shelf — booking them out again on
 * departure would count the same bottles twice.
 */
export function ArrivalCard({ transport }: { transport: Transport }) {
  const update = useUpdateTransport()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  const t = transport
  const orders = t.orders ?? []
  const stores = t.stores_at_warehouse ?? false
  const arrived = !!t.arrived_at

  // Only a warehouse can hold stock. A transport straight to the customer has
  // nothing to sign in here — the customer signs the delivery note.
  if (t.ship_to !== 'warehouse') return null

  async function markArrived() {
    setBusy(true)
    try {
      const supabase = createClient()

      if (stores) {
        // Book in exactly what was picked: the same batches, the same skus, at
        // this warehouse. Read back from the movements so the arrival can never
        // claim something that was never picked.
        const { data: picks, error: pickErr } = await supabase
          .from('stock_movements')
          .select('sku, batch_id, order_id')
          .in('order_id', orders.map(o => o.id))
          .eq('reason', 'order')
        if (pickErr) throw pickErr

        const rows: {
          batch_id: string; sku: string; qty: number; location_id: string | null
          reason: string; order_id: string; transport_id: string; note: string
        }[] = []
        for (const order of orders) {
          const items = (order.items ?? []) as QuoteItem[]
          for (const item of items) {
            if (item.qty <= 0) continue
            const pick = (picks ?? []).find(p => p.order_id === order.id && p.sku === item.sku)
            if (!pick) continue
            rows.push({
              batch_id: pick.batch_id,
              sku: item.sku,
              qty: item.qty,
              location_id: t.location_id,
              reason: 'received',
              order_id: order.id,
              transport_id: t.id,
              note: `Received at ${t.location?.name ?? 'the warehouse'}`,
            })
          }
        }

        if (rows.length === 0) {
          toast.warning('Nothing to book in — no batches were chosen on these orders')
        } else {
          const { error } = await supabase.from('stock_movements').insert(rows)
          if (error) throw error
        }
      }

      await update.mutateAsync({
        id: t.id,
        values: { arrived_at: new Date().toISOString(), status: 'delivered' } as never,
      })
      queryClient.invalidateQueries({ queryKey: ['batch_stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      toast.success(stores ? 'Signed in and booked into the warehouse' : 'Signed in')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign this transport in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Warehouse className="h-4 w-4" />
          Arrival at {t.location?.name ?? 'the warehouse'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-red-600"
            checked={stores}
            disabled={arrived}
            onChange={e => update.mutate({
              id: t.id,
              values: { stores_at_warehouse: e.target.checked } as never,
            })}
          />
          <span>
            Stays here as stock
            <span className="block text-xs text-muted-foreground">
              Tick this when the bottles are stored at the warehouse and shipped onward later.
              Leave it off when the warehouse only forwards a load that is already sold.
            </span>
          </span>
        </label>

        {arrived ? (
          <p className="text-sm text-green-700 flex items-center gap-1.5">
            <PackageCheck className="h-4 w-4" />
            Signed in on {new Date(t.arrived_at!).toLocaleDateString('en', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
            {stores ? ' · booked into the warehouse' : ''}
          </p>
        ) : (
          <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
            disabled={busy || orders.length === 0} onClick={markArrived}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
            Sign in as arrived
          </Button>
        )}
        {orders.length === 0 && (
          <p className="text-xs text-muted-foreground">Put an order on this transport first</p>
        )}
      </CardContent>
    </Card>
  )
}
