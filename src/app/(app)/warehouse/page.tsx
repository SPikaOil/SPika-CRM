'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Warehouse, Ship, PackageCheck, Clock, User } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTransports, useTransportLocations, useWarehouseMemberships } from '@/hooks/use-transports'
import { useBatchStock } from '@/hooks/use-batches'
import { BatchesAtPlace } from '@/components/batches-at-place'
import { atPlace } from '@/lib/stock-place'
import { transportColli } from '@/lib/transport-cargo'
import { ShopifyWeekCard } from '../stock/_components/shopify-week-card'
import { PosStockPanel } from '@/components/pos-stock-panel'
import { ArrivalCard } from '../exports/_components/arrival-card'

/**
 * What is actually sitting in the warehouses, and what is on its way there.
 *
 * Danique, 2026-08-14: "het is beste dat we eerst een warehouse tabblad
 * aanmaken, want waar wil je alles anders verwerken en bijhouden en checken".
 * Exactly the gap — bottles could be booked into a warehouse and taken out
 * again, but there was nowhere to LOOK at any of it.
 *
 * Curaçao is deliberately not on this page. That is home, and it lives under
 * Stock with the oil, the safety stock and the batches. This page is only the
 * places the goods went to.
 */
export default function WarehousePage() {
  const { isAdmin, can, isLoading, profile } = useAuth()
  const router = useRouter()

  const { data: allLocations, isLoading: locLoading } = useTransportLocations()
  const { data: memberships } = useWarehouseMemberships()
  const { data: transports } = useTransports()
  const { data: stock } = useBatchStock()

  // A warehouse member has to reach their own shelves, so this is gated on the
  // permission, not on being an admin.
  if (!isLoading && !isAdmin && !can('warehouse.view')) {
    router.replace('/dashboard')
    return null
  }

  /**
   * Only your own warehouses.
   *
   * Her decision of 2026-08-16: a warehouse member is linked to a place in
   * Settings, and when they open this tab they see that place and nothing else.
   * Admin keeps the whole list — hiding it from the owner would only mean
   * asking somebody else what is where.
   *
   * A member with no link yet sees NOTHING rather than everything. That is the
   * safe direction: an empty page is a question, a full one is a leak.
   *
   * That last sentence has been standing here since 2026-08-16 while the code
   * underneath did the opposite: no membership fell through to "show them all
   * the warehouses". Nobody noticed because there is one warehouse. Corrected
   * 2026-08-20 to do what it says.
   */
  const mine = (memberships ?? []).filter(m => m.user_id === profile?.id)
  const locations = isAdmin
    ? allLocations
    : (allLocations ?? []).filter(l => mine.some(m => m.location_id === l.id))
  const showsCuracao = isAdmin || mine.some(m => m.location_id === null)
  // Somebody with the permission but no place yet. The line above already
  // gives them nothing; this is so the page says why instead of looking empty.
  const unlinked = !isAdmin && mine.length === 0


  /** Everything still standing at one location, per product and per batch. */
  function stockAt(locationId: string) {
    return (stock ?? [])
      // The place's own stock. What a colleague is carrying is on THEIR list,
      // not on this shelf (migration 112).
      .filter(r => atPlace(r, locationId) && r.qty !== 0)
      .sort((a, b) => a.sku.localeCompare(b.sku) || (a.tht_date ?? '').localeCompare(b.tht_date ?? ''))
  }

  /**
   * On its way: sent to this warehouse and not finished with.
   *
   * A transport stays here while any box is still expected, so the goods
   * receipt for a late colli remains reachable. It drops off once it is closed
   * — either everything landed, or the warehouse said the rest is not coming.
   */
  function inboundTo(locationId: string) {
    return (transports ?? []).filter(
      t => t.ship_to === 'warehouse'
        && t.location_id === locationId
        && t.status !== 'delivered'
        && transportColli(t).some(c => !c.ata)
    )
  }

  /**
   * Booked in here, so its bottles are on the shelves above.
   *
   * The "stays here as stock" tick is no longer part of this question
   * (2026-08-21). A goods receipt is a goods receipt: it happened, the bottles
   * came through this door, and it belongs in this warehouse's history whatever
   * the note says about what happens to them next.
   */
  function arrivedAt(locationId: string) {
    return (transports ?? []).filter(
      t => t.location_id === locationId && t.arrived_at
    )
  }

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Warehouse className="h-6 w-6 text-red-600" />
          Warehouse
        </h1>
        <p className="text-sm text-muted-foreground">
          What is standing at each warehouse, and what is on its way
        </p>
      </div>

      {locLoading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (locations ?? []).length === 0 ? (
        <Card size="sm">
          <CardContent className="py-6 text-center space-y-2">
            {unlinked ? (
              <>
                {/* Not the same as "there are none". Saying so out loud saves a
                    phone call about a page that looks broken. */}
                <p className="text-sm text-muted-foreground">
                  You are not linked to a warehouse yet.
                </p>
                <p className="text-xs text-muted-foreground">
                  An admin adds you under Settings → Warehouses. Until then there is
                  nothing here for you to receive or hand out.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">No warehouse locations yet.</p>
                {/* Settings and nowhere else since 2026-08-19 — this line used to
                    send people to the transport screen, which is exactly the door
                    that was closed. */}
                <p className="text-xs text-muted-foreground">
                  Add one under <Link href="/settings" className="text-red-600 underline">Settings</Link> →
                  Warehouses, together with the delivery addresses it receives at.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        (locations ?? []).map(loc => {
          const rows = stockAt(loc.id)
          const total = rows.reduce((s, r) => s + r.qty, 0)
          const inbound = inboundTo(loc.id)
          const arrived = arrivedAt(loc.id)

          return (
            <Card key={loc.id} size="sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Warehouse className="h-4 w-4" />
                  {loc.name}
                  <span className="ml-auto text-sm font-semibold">{total} bottles</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {[loc.street, [loc.zip, loc.city].filter(Boolean).join(' '), loc.country]
                  .filter(Boolean).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {[loc.street, [loc.zip, loc.city].filter(Boolean).join(' '), loc.country]
                      .filter(Boolean).join(', ')}
                  </p>
                )}

                {/* Who signs for the goods here. A place without a name behind
                    it cannot receive anything, so it is called out rather than
                    left blank. */}
                <p className="text-xs flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {loc.user ? (
                    <span>{loc.user.name}</span>
                  ) : (
                    <span className="text-red-600">
                      Nobody in charge — no one can sign a transport in here
                    </span>
                  )}
                </p>

                {/* Receiving happens here, on the place it arrives at. The
                    form is locked to this warehouse — asking again which one
                    would only be a chance to pick the wrong one. */}
                <PosStockPanel locationId={loc.id} embedded />

                {/* The batches standing here, each one openable.
                    Her design of 2026-08-21: "partijen als dun vakje die je kunt
                    uitklappen waar je alle info in ziet (tp#, ATA, VVP per item
                    etc etc)". A recall is answered from here, and so is "what
                    came through this warehouse six months ago" — an empty batch
                    stays in the list rather than disappearing. */}
                <BatchesAtPlace locationId={loc.id} />

                {/* On its way, and the goods receipt itself.
                    Her instruction of 2026-08-20: a warehouse member has the
                    right to book a load in but could not reach the screen — it
                    lived under Export, which is admin only. That link went to a
                    page that threw them straight back out.
                    So the receipt happens HERE, where they already work, per
                    box, on their own location. Export keeps the freight costs,
                    the prices and the customs papers, and they never see it. */}
                {inbound.length > 0 && (
                  <div className="space-y-2 border-t pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      On its way
                    </p>
                    {inbound.map(t => (
                      <div key={t.id} className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm">
                          <Ship className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-mono">{t.transport_number}</span>
                          <Badge className="bg-orange-100 text-orange-700 text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {t.eta ? `ETA ${new Date(t.eta + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })}` : 'no ETA'}
                          </Badge>
                          {isAdmin && (
                            <Link href={`/exports/${t.id}`} className="ml-auto text-xs text-muted-foreground hover:underline">
                              Open transport →
                            </Link>
                          )}
                        </div>
                        <ArrivalCard transport={t} />
                      </div>
                    ))}
                  </div>
                )}

                {arrived.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Booked in here
                    </p>
                    {/* Only an admin gets a link. Export is admin-only, so for
                        a warehouse member this was a link that threw them back
                        out — worse than no link at all. */}
                    {arrived.map(t => {
                      const line = (
                        <>
                          <PackageCheck className="h-3.5 w-3.5 shrink-0 text-green-600" />
                          <span className="font-mono">{t.transport_number}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(t.arrived_at!).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </>
                      )
                      return isAdmin ? (
                        <Link key={t.id} href={`/exports/${t.id}`}
                          className="flex items-center gap-2 text-sm hover:underline">
                          {line}
                        </Link>
                      ) : (
                        <div key={t.id} className="flex items-center gap-2 text-sm">
                          {line}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })
      )}

      {/* Webshop orders go out from here as often as from Curaçao, so the week
          is booked on this page — pick the transport it came in on, or say it
          left Curaçao straight away. */}
      <ShopifyWeekCard />

      {/* Curaçao gets a card like the others now, her decision of 2026-08-16.
          It is not a row in transport_locations — it is the absence of one —
          but people work there and material sits there, so leaving it off the
          page meant the one place we ship from most had nowhere to look. */}
      {showsCuracao && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              Curaçao
              <span className="ml-auto text-sm font-normal text-muted-foreground">home</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <p className="text-xs text-muted-foreground">
              Bottles here live under Stock, with the batches and the safety stock.
              What is below is the POS material.
            </p>
            <PosStockPanel locationId={null} embedded />
          </CardContent>
        </Card>
      )}

    </div>
  )
}
