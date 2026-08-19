'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Warehouse, ChevronDown, ChevronRight, Ship, PackageCheck, Clock, User } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTransports, useTransportLocations } from '@/hooks/use-transports'
import { useBatchStock } from '@/hooks/use-batches'
import { formatTht } from '@/lib/utils'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { ShopifyWeekCard } from '../stock/_components/shopify-week-card'
import { PosStockPanel } from '@/components/pos-stock-panel'

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
  const { isAdmin, can, isLoading } = useAuth()
  const router = useRouter()

  const { data: locations, isLoading: locLoading } = useTransportLocations()
  const { data: transports } = useTransports()
  const { data: stock } = useBatchStock()

  const [openLocation, setOpenLocation] = useState<string | null>(null)

  // A warehouse member has to reach their own shelves, so this is gated on the
  // permission, not on being an admin.
  if (!isLoading && !isAdmin && !can('warehouse.view')) {
    router.replace('/dashboard')
    return null
  }

  const productName = (sku: string) => SPIKA_PRODUCTS.find(p => p.sku === sku)?.name ?? sku

  /** Everything still standing at one location, per product and per batch. */
  function stockAt(locationId: string) {
    return (stock ?? [])
      .filter(r => r.location_id === locationId && r.qty !== 0)
      .sort((a, b) => a.sku.localeCompare(b.sku) || (a.tht_date ?? '').localeCompare(b.tht_date ?? ''))
  }

  /** On its way: sent to this warehouse, not signed in yet. */
  function inboundTo(locationId: string) {
    return (transports ?? []).filter(
      t => t.ship_to === 'warehouse' && t.location_id === locationId && !t.arrived_at
    )
  }

  /** Signed in here, so its bottles are on the shelves above. */
  function arrivedAt(locationId: string) {
    return (transports ?? []).filter(
      t => t.location_id === locationId && t.arrived_at && t.stores_at_warehouse
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
            <p className="text-sm text-muted-foreground">No warehouse locations yet.</p>
            <p className="text-xs text-muted-foreground">
              Add one on a transport under <Link href="/exports" className="text-red-600 underline">Export</Link>,
              at &ldquo;Delivery address → + New warehouse location&rdquo;.
            </p>
          </CardContent>
        </Card>
      ) : (
        (locations ?? []).map(loc => {
          const rows = stockAt(loc.id)
          const total = rows.reduce((s, r) => s + r.qty, 0)
          const inbound = inboundTo(loc.id)
          const arrived = arrivedAt(loc.id)
          const open = openLocation === loc.id

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

                {/* On the shelves, per product and per batch — a recall has to be
                    answerable from here. */}
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing standing here</p>
                ) : (
                  <button
                    onClick={() => setOpenLocation(open ? null : loc.id)}
                    className="w-full text-left"
                  >
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      On the shelves · {rows.length} lines
                    </span>
                  </button>
                )}
                {open && rows.map(r => (
                  <div key={`${r.batch_id}-${r.sku}`} className="flex items-center gap-2 text-sm pl-4">
                    <span className="flex-1 min-w-0 truncate">{productName(r.sku)}</span>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{r.batch_number}</span>
                    {r.tht_date && (
                      <span className="text-xs text-muted-foreground shrink-0">THT {formatTht(r.tht_date)}</span>
                    )}
                    <span className="font-medium shrink-0 w-12 text-right">{r.qty}</span>
                  </div>
                ))}

                {/* On its way. Nothing of this counts as stock yet — it counts
                    when somebody over there signs it in. */}
                {inbound.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      On its way
                    </p>
                    {inbound.map(t => (
                      <Link key={t.id} href={`/exports/${t.id}`}
                        className="flex items-center gap-2 text-sm hover:underline">
                        <Ship className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-mono">{t.transport_number}</span>
                        <Badge className="bg-orange-100 text-orange-700 text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {t.eta ? `ETA ${new Date(t.eta + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })}` : 'no ETA'}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground">Sign in →</span>
                      </Link>
                    ))}
                  </div>
                )}

                {arrived.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Booked in here
                    </p>
                    {arrived.map(t => (
                      <Link key={t.id} href={`/exports/${t.id}`}
                        className="flex items-center gap-2 text-sm hover:underline">
                        <PackageCheck className="h-3.5 w-3.5 shrink-0 text-green-600" />
                        <span className="font-mono">{t.transport_number}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(t.arrived_at!).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </Link>
                    ))}
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

      {/* Displays and wobblers live on the same shelves as the bottles, so they
          are counted on the same page. Their own table though — a rack has no
          batch and no sku, which is why stock_movements could never hold it. */}
      <PosStockPanel />
    </div>
  )
}
