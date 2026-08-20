'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Ship, Search, Plus, PackageCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/auth-context'
import {
  useTransports, useExportOrders, useCreateTransport, useAddOrderToTransport,
} from '@/hooks/use-transports'
import { TransportStatus, Order } from '@/types'
import { fmtOwnCurrency } from '@/lib/utils'
import { Suspense } from 'react'
import { TransitOverview } from './_components/transit-overview'

const statusColors: Record<TransportStatus, string> = {
  draft:     'bg-gray-100 text-gray-700',
  ready:     'bg-blue-100 text-blue-700',
  submitted: 'bg-yellow-100 text-yellow-700',
  cleared:   'bg-green-100 text-green-700',
  delivered: 'bg-emerald-100 text-emerald-700',
}

const statusLabels: Record<TransportStatus, string> = {
  draft: 'Draft', ready: 'Ready', submitted: 'Submitted',
  cleared: 'Cleared', delivered: 'Delivered',
}

const ALL_STATUSES: TransportStatus[] = ['draft', 'ready', 'submitted', 'cleared', 'delivered']

function fmtDay(value?: string | null) {
  if (!value) return null
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function ExportsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const statusFilter = (searchParams.get('status') ?? '') as TransportStatus | ''
  const { isAdmin } = useAuth()

  const { data: transports, isLoading } = useTransports()
  const { data: exportOrders } = useExportOrders()
  const createTransport = useCreateTransport()
  const addOrderToTransport = useAddOrderToTransport()

  const [search, setSearch] = useState('')
  const q = search.toLowerCase().trim()

  // An order is "waiting" when it belongs to an international customer and no
  // transport is named for it yet. Counted over ALL its transports since
  // migration 100, not over the single `transport_id` column, because an order
  // that was sent once and had to be sent again is on two of them.
  const waiting = useMemo(
    () => (exportOrders ?? []).filter(o => (o.transports ?? []).length === 0),
    [exportOrders]
  )

  // The overview is a list of ORDERS. Searching narrows it on the order, the
  // customer, or any of the transport numbers it travels under.
  const ordersShown = useMemo(() => (exportOrders ?? []).filter(o => {
    if (!q) return true
    return (o.order_number ?? '').toLowerCase().includes(q)
      || (o.customer?.company_name ?? '').toLowerCase().includes(q)
      || (o.transports ?? []).some(t => t.transport_number.toLowerCase().includes(q))
  }), [exportOrders, q])

  const filtered = useMemo(() => (transports ?? []).filter(t => {
    if (statusFilter && t.status !== statusFilter) return false
    if (!q) return true
    if (t.transport_number.toLowerCase().includes(q)) return true
    if ((t.destination ?? '').toLowerCase().includes(q)) return true
    return (t.orders ?? []).some(o =>
      (o.order_number ?? '').toLowerCase().includes(q) ||
      (o.customer?.company_name ?? '').toLowerCase().includes(q)
    )
  }), [transports, statusFilter, q])

  async function addToNewTransport(order: Order) {
    const t = await createTransport.mutateAsync({})
    await addOrderToTransport.mutateAsync({ orderId: order.id, transportId: t.id })
    router.push(`/exports/${t.id}`)
  }

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20">
        <p className="font-medium">Access restricted</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ship className="h-6 w-6" />
            Export
          </h1>
          <p className="text-muted-foreground text-sm">
            {filtered.length} transports · {waiting.length} orders waiting
          </p>
        </div>
        <Button
          className="bg-red-600 hover:bg-red-700 gap-2"
          onClick={async () => {
            const t = await createTransport.mutateAsync({})
            router.push(`/exports/${t.id}`)
          }}
        >
          <Plus className="h-4 w-4" />
          New Transport
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by transport number, order, customer or destination…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* How the transports have actually done — promised against real, per
          box. Her instruction of 2026-08-20: in one glance. */}
      <TransitOverview transports={filtered} />

      {/* Every export order, on a transport or not. The ETA lives on the
          transport, so a row only shows a date once the order has been put on
          one — that is the date this list is really about. */}
      {ordersShown.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Export orders ({ordersShown.length}
            {waiting.length > 0 && ` · ${waiting.length} not on a transport`})
          </h2>
          {ordersShown.map(order => {
            // Every transport this order is named on, newest first. Two of them
            // is not a mistake: it is a load that went missing and was sent
            // again, and both movements are real.
            const all = order.transports ?? []
            const t = all[0]
            const eta = fmtDay(t?.eta)
            return (
              // On a phone the customer name was squeezed to "La B…" by the
              // action next to it. Stacked instead: the text gets the full
              // width, the action gets its own line underneath. Two thin rows
              // beat one row with the name cut off.
              <div
                key={order.id}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 px-3 py-1 sm:py-0.5 leading-tight rounded-xl border bg-card ${t ? '' : 'border-dashed'}`}
              >
                <Link href={`/orders/${order.id}`} className="flex-1 min-w-0 hover:opacity-70">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <p className="font-mono text-sm font-medium shrink-0">{order.order_number}</p>
                    <p className="font-medium text-sm truncate">{order.customer?.company_name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {order.customer?.billing_address?.country ?? '—'} · {fmtOwnCurrency(order)}
                    {all.length > 0 && ` · ${all.map(x => x.transport_number).join(', ')}`}
                    {t && ` · ${eta ? `ETA ${eta}` : 'no ETA yet'}`}
                  </p>
                </Link>

                {/* ETA gets its own column on a wide screen; on a phone it is
                    folded into the line above so it cannot push anything out. */}
                <div className="hidden sm:block shrink-0 text-right w-24">
                  {eta ? (
                    <>
                      <p className="text-sm font-semibold">{eta}</p>
                      <p className="text-[10px] text-muted-foreground -mt-0.5">ETA</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t ? 'No ETA yet' : '—'}
                    </p>
                  )}
                </div>

                {/* Both, always. The dropdown used to disappear the moment an
                    order was on a transport, which is why an order that had
                    already been sent could not be put on a second one — the
                    case Danique named on 2026-08-19. Transports it is already
                    on are left out of the list rather than hidden behind it. */}
                <div className="flex items-center gap-2 shrink-0">
                  {t && (
                    <Link href={`/exports/${t.id}`} className="shrink-0">
                      <Button variant="outline" size="sm" className="h-7 text-xs w-full sm:w-auto">Open</Button>
                    </Link>
                  )}
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (!v) return
                      if (v === '__new') { addToNewTransport(order); return }
                      addOrderToTransport.mutate({ orderId: order.id, transportId: v })
                    }}
                  >
                    <SelectTrigger className="h-7 w-full sm:w-40 text-xs shrink-0">
                      <SelectValue placeholder={t ? 'Also on transport…' : 'Put on transport…'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new">+ New transport</SelectItem>
                      {(transports ?? [])
                        .filter(x => x.status === 'draft' || x.status === 'ready')
                        .filter(x => !all.some(a => a.id === x.id))
                        .map(x => (
                          <SelectItem key={x.id} value={x.id}>
                            {x.transport_number}{x.destination ? ` — ${x.destination}` : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        <Link href="/exports">
          <Button variant={!statusFilter ? 'default' : 'outline'} size="sm"
            className={!statusFilter ? 'bg-red-600 hover:bg-red-700' : ''}>
            All
          </Button>
        </Link>
        {ALL_STATUSES.map(s => (
          <Link key={s} href={`/exports?status=${s}`}>
            <Button variant={statusFilter === s ? 'default' : 'outline'} size="sm"
              className={statusFilter === s ? 'bg-red-600 hover:bg-red-700' : ''}>
              {statusLabels[s]}
            </Button>
          </Link>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <PackageCheck className="h-10 w-10 opacity-20" />
          <p className="font-medium">No transports yet</p>
          <p className="text-sm">Put an order on a transport number to start one</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const orders = t.orders ?? []
            /**
             * WHERE THE LOAD GOES, not who bought the goods.
             *
             * Danique, 2026-08-19: "het gaat toch naar NBC, niet naar La
             * Bandera, transport info is leading hier." A transport is a stock
             * transfer to a place, and this list is a list of transports — so
             * the name beside the number is the warehouse it is heading for.
             * The reseller only becomes the destination when the load goes
             * straight to them, and then it is the same answer.
             */
            const goingTo = t.ship_to === 'warehouse'
              ? (t.location?.name ?? 'Warehouse')
              : (Array.from(new Set(orders.map(o => o.customer?.company_name).filter(Boolean)))
                  .join(', ') || 'No orders yet')
            return (
              <Link
                key={t.id}
                href={`/exports/${t.id}`}
                className="block px-3 py-0.5 leading-tight rounded-xl border bg-card hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-sm font-medium">{t.transport_number}</p>
                      <p className="font-medium text-sm truncate">{goingTo}</p>
                      <Badge className={`text-xs ${statusColors[t.status]}`}>
                        {statusLabels[t.status]}
                      </Badge>
                      {orders.length > 1 && (
                        <Badge className="text-xs bg-indigo-100 text-indigo-700">
                          {orders.length} orders
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.destination || '—'}
                      {fmtDay(t.etd) && ` · ETD ${fmtDay(t.etd)}`}
                      {t.carrier && ` · ${t.carrier.name}`}
                    </p>
                  </div>
                  {/* The ETA is the date this row is about — when it lands.
                      Shown only once there is one, like the amount on an order. */}
                  {fmtDay(t.eta) && (
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{fmtDay(t.eta)}</p>
                      <p className="text-[10px] text-muted-foreground -mt-0.5">ETA</p>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ExportsPage() {
  return (
    <Suspense fallback={<div className="p-4 lg:p-6"><Skeleton className="h-40 rounded-xl" /></div>}>
      <ExportsInner />
    </Suspense>
  )
}
