'use client'

import Link from 'next/link'
import { Warehouse, PackageCheck, Ship, ArrowLeftRight, AlertTriangle, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTransports, useTransportLocations, useWarehouseMemberships } from '@/hooks/use-transports'
import { useBatchStock } from '@/hooks/use-batches'
import { transportColli } from '@/lib/transport-cargo'
import { formatTht } from '@/lib/utils'

/**
 * A warehouse member's own morning, on the dashboard.
 *
 * Danique, 2026-08-20: "als warehouse medewerker moet je zien wat er op
 * voorraad ligt, of er orders zijn, eventuele handover naar andere warehouse,
 * inslagen."
 *
 * Until now they opened a dashboard that greeted them as sales and showed two
 * empty boxes. Everything about their actual work — a container arriving, a
 * shelf running down, a box still missing — lived one or two tabs away.
 *
 * Their OWN place only. The Warehouse tab scopes on membership and so does
 * this; somebody linked to nothing sees nothing, which is the safe direction.
 */
export function WarehouseDashboardCard({ userId }: { userId: string | undefined }) {
  const { data: memberships } = useWarehouseMemberships()
  const { data: locations } = useTransportLocations()
  const { data: transports } = useTransports()
  const { data: stock } = useBatchStock()

  const mine = (memberships ?? []).filter(m => m.user_id === userId)
  if (mine.length === 0) return null

  const myLocationIds = mine.map(m => m.location_id)
  const myPlaces = (locations ?? []).filter(l => myLocationIds.includes(l.id))
  const homeToo = myLocationIds.includes(null)

  /** On its way here and not received yet — the boxes to expect. */
  const inbound = (transports ?? []).filter(
    t => t.ship_to === 'warehouse'
      && myLocationIds.includes(t.location_id)
      && transportColli(t).some(c => !c.ata),
  )

  /**
   * Boxes that came up short at intake and nobody has settled.
   *
   * Her case of 2026-08-20: 29 arrived where 30 were sent. It is written down at
   * the goods receipt, but until now it sat inside one transport screen — so the
   * one bottle was only ever found by whoever went looking. Named here, and on
   * the office dashboard too, because deciding what happens next is theirs.
   */
  const shortages = (transports ?? [])
    .filter(t => myLocationIds.includes(t.location_id))
    .flatMap(t => (t.receipt_lines ?? [])
      .filter(l => l.received < l.expected && !l.outcome)
      .map(l => ({ transport: t.transport_number, ...l })))

  const stockHere = (stock ?? []).filter(
    r => myLocationIds.includes(r.location_id) && r.qty !== 0,
  )
  const bottles = stockHere.reduce((s, r) => s + r.qty, 0)

  /** Anything within six months is worth handing out before it sits too long. */
  const soon = new Date()
  soon.setMonth(soon.getMonth() + 6)
  const nearTht = stockHere
    .filter(r => r.tht_date && new Date(`${r.tht_date.slice(0, 7)}-01`) <= soon)
    .sort((a, b) => (a.tht_date ?? '').localeCompare(b.tht_date ?? ''))

  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Warehouse className="h-3.5 w-3.5" />
        {myPlaces.map(l => l.name).concat(homeToo ? ['Curaçao'] : []).join(' · ') || 'Your warehouse'}
      </p>

      <Card size="sm" className="py-0">
        <CardContent className="p-0 divide-y">
          {/* On the shelves */}
          <Link href="/warehouse" className="flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors">
            <PackageCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{bottles} bottles on the shelves</p>
              <p className="text-xs text-muted-foreground">
                {stockHere.length} {stockHere.length === 1 ? 'line' : 'lines'} across
                {' '}{new Set(stockHere.map(r => r.batch_id)).size} batches
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">Open →</span>
          </Link>

          {/* Coming in */}
          {inbound.length > 0 && (
            <Link href="/warehouse" className="flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors">
              <Ship className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {inbound.length} {inbound.length === 1 ? 'transport' : 'transports'} to receive
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {inbound.map(t => {
                    const boxes = transportColli(t)
                    const openBoxes = boxes.filter(c => !c.ata).length
                    return `${t.transport_number} · ${openBoxes} of ${boxes.length} boxes`
                  }).join(' · ')}
                </p>
              </div>
              <Badge className="bg-amber-100 text-amber-800 text-xs shrink-0">
                <Clock className="h-3 w-3 mr-1" />
                Goods receipt
              </Badge>
            </Link>
          )}

          {/* Short at intake, still open */}
          {shortages.length > 0 && (
            <div className="flex items-start gap-3 px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  {shortages.length} {shortages.length === 1 ? 'shortage' : 'shortages'} reported
                </p>
                {shortages.slice(0, 3).map((s, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {s.name} — {s.received} of {s.expected} · {s.transport}
                  </p>
                ))}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Curaçao decides what happens next — you do not have to do anything.
                </p>
              </div>
            </div>
          )}

          {/* Best-before coming up */}
          {nearTht.length > 0 && (
            <Link href="/warehouse" className="flex items-start gap-3 px-3 py-2 hover:bg-accent transition-colors">
              <Clock className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Best-before within six months</p>
                {nearTht.slice(0, 3).map(r => (
                  <p key={`${r.batch_id}-${r.sku}`} className="text-xs text-muted-foreground">
                    {r.qty}× {r.product_name} · {r.batch_number} · THT {formatTht(r.tht_date)}
                  </p>
                ))}
              </div>
            </Link>
          )}

          {/* Move stock to another place */}
          <Link href="/handover" className="flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors">
            <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Hand stock over</p>
              <p className="text-xs text-muted-foreground">
                To another warehouse or a colleague — by hand or by post
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">Open →</span>
          </Link>
        </CardContent>
      </Card>
    </section>
  )
}
