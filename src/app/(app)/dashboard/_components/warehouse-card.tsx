'use client'

import Link from 'next/link'
import { Warehouse, PackageCheck, Ship, ArrowLeftRight, AlertTriangle, Clock, Truck, TrendingDown, Package } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTransports, useTransportLocations, useWarehouseMemberships } from '@/hooks/use-transports'
import { useBatchStock } from '@/hooks/use-batches'
import { usePosStock } from '@/hooks/use-pos-stock'
import { useOpenRunsForOrders, useIncomingHandovers } from '@/hooks/use-warehouse-work'
import { transportColli } from '@/lib/transport-cargo'
import { coverageGaps } from '@/lib/coverage'
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
  const { data: posStock } = usePosStock()

  // NO early return before the hooks below. Membership arrives a moment after
  // the first render, so bailing out here would call a different number of
  // hooks on the next one and React would throw. Whether this card shows at all
  // is decided at the bottom, where it belongs.
  const mine = (memberships ?? []).filter(m => m.user_id === userId)
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

  // The warehouse's OWN stock. What a colleague is carrying belongs on their
  // own list, not on this shelf (migration 112).
  const stockHere = (stock ?? []).filter(
    r => !r.holder_id && myLocationIds.includes(r.location_id) && r.qty !== 0,
  )
  const bottles = stockHere.reduce((s, r) => s + r.qty, 0)

  /**
   * Runs still to go out from these shelves, whoever is on them.
   *
   * Not "assigned to me" — a run standing at your own warehouse with nobody's
   * name on it was invisible to the person standing next to it. Her point of
   * 2026-08-20.
   */
  const orderIdsHere = Array.from(new Set(
    (transports ?? [])
      .filter(t => myLocationIds.includes(t.location_id))
      .flatMap(t => (t.orders ?? []).map(o => o.id)),
  ))
  const { data: runsHere } = useOpenRunsForOrders(orderIdsHere)
  const openRuns = runsHere ?? []

  /** On its way to this person by hand or by post, not signed for yet. */
  const { data: incoming } = useIncomingHandovers(userId)
  const handovers = incoming ?? []

  /**
   * Places that have dropped below the floor an admin set for them (106).
   *
   * No threshold means no warning: a number the app guessed would be a number
   * nobody acts on.
   */
  const low = myPlaces
    .filter(l => typeof l.min_bottles === 'number' && l.min_bottles > 0)
    .map(l => ({
      name: l.name,
      min: l.min_bottles as number,
      have: stockHere.filter(r => r.location_id === l.id).reduce((s, r) => s + r.qty, 0),
    }))
    .filter(l => l.have < l.min)

  // Less standing here than the prepared runs need. A rule, not a threshold:
  // "there is not enough for what we already said we would deliver" is a fact.
  const gaps = coverageGaps(stockHere, openRuns, myLocationIds)

  /** POS material standing here — a stand is not a bottle and never counted. */
  const posHere = (posStock ?? []).filter(
    p => myLocationIds.includes(p.location_id) && p.qty > 0,
  )

  /** Anything within six months is worth handing out before it sits too long. */
  const soon = new Date()
  soon.setMonth(soon.getMonth() + 6)
  const nearTht = stockHere
    .filter(r => r.tht_date && new Date(`${r.tht_date.slice(0, 7)}-01`) <= soon)
    .sort((a, b) => (a.tht_date ?? '').localeCompare(b.tht_date ?? ''))

  // Linked to no warehouse: nothing here belongs to them. The Warehouse tab
  // says the same thing in words; a dashboard just stays quiet.
  if (mine.length === 0) return null

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

          {/* Cannot cover what is already promised. A rule, not a setting —
              her point of 2026-08-20. This one always fires, because it is a
              fact rather than a judgement about what "low" means. */}
          {gaps.length > 0 && (
            <div className="flex items-start gap-3 px-3 py-2 bg-red-50 dark:bg-red-950/20">
              <TrendingDown className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  Not enough on the shelf for the runs standing ready
                </p>
                {gaps.slice(0, 4).map(g => (
                  <p key={g.sku} className="text-xs text-muted-foreground">
                    {g.name} — {g.have} here, {g.promised} promised · <span className="text-red-600 font-medium">{g.short} short</span>
                  </p>
                ))}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Curaçao has to send more, or another warehouse hands some over.
                </p>
              </div>
            </div>
          )}

          {/* Below the floor an admin set for this place — optional, on top of
              the rule above. */}
          {low.map(l => (
            <div key={l.name} className="flex items-start gap-3 px-3 py-2">
              <TrendingDown className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  {l.name} is running low
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.have} bottles standing, {l.min} is the floor — Curaçao has to
                  send more, or another warehouse hands some over
                </p>
              </div>
            </div>
          ))}

          {/* Runs to go out from here */}
          {openRuns.length > 0 && (
            <div className="px-3 py-2 space-y-1">
              <p className="text-sm font-medium flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                {openRuns.length} {openRuns.length === 1 ? 'run' : 'runs'} to go out from here
              </p>
              {openRuns.slice(0, 4).map(run => {
                const count = (run.items ?? []).reduce((s, i) => s + i.qty, 0)
                return (
                  <Link
                    key={run.id}
                    href={`/delivery/${run.order_id}`}
                    className="flex items-center gap-2 text-xs hover:underline"
                  >
                    <span className="flex-1 min-w-0 truncate">
                      {run.order?.customer?.company_name ?? run.order?.order_number ?? 'Order'}
                      {' · '}{count} bottles
                    </span>
                    <span className={`shrink-0 ${run.assigned_to ? 'text-muted-foreground' : 'text-amber-600'}`}>
                      {run.assigned_to ? (run.planned_date ?? 'no date') : 'nobody assigned'}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Handovers on their way to you, still to sign */}
          {handovers.length > 0 && (
            <Link href="/handover" className="flex items-start gap-3 px-3 py-2 hover:bg-accent transition-colors">
              <ArrowLeftRight className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {handovers.length} {handovers.length === 1 ? 'handover' : 'handovers'} to sign for
                </p>
                {handovers.slice(0, 3).map(h => (
                  <p key={h.id} className="text-xs text-muted-foreground truncate">
                    {(h.items ?? []).reduce((s, i) => s + i.qty, 0)} bottles
                    {h.tracking_number ? ` · by post, ${h.tracking_number}` : ' · handed over'}
                  </p>
                ))}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Count them and sign — until then they are on nobody&apos;s shelf.
                </p>
              </div>
            </Link>
          )}

          {/* POS material standing here */}
          {posHere.length > 0 && (
            <Link href="/warehouse" className="flex items-start gap-3 px-3 py-2 hover:bg-accent transition-colors">
              <Package className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {posHere.reduce((s, p) => s + p.qty, 0)} pieces of POS material
                </p>
                {posHere.slice(0, 3).map(p => (
                  <p key={`${p.pos_item_id}-${p.location_id}`} className="text-xs text-muted-foreground truncate">
                    {p.qty}× {p.item_name}
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
