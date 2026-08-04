'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, Plus, X as XIcon, Ship } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/auth-context'
import {
  useTransport, useUpdateTransport, useDeleteTransport, useCarriers,
  useTransportLocations, useCreateTransportLocation, useExportOrders, useSetOrderTransport,
} from '@/hooks/use-transports'
import { ColliEditor } from '../_components/colli-editor'
import { TransportDocuments } from '../_components/transport-documents'
import { TransportStatus } from '@/types'
import { fmtOwnCurrency, formatCurrency, transportQrPayload } from '@/lib/utils'

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

const EMPTY_LOCATION = { name: '', street: '', zip: '', city: '', country: '' }

export default function TransportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { isAdmin } = useAuth()

  const { data: transport, isLoading } = useTransport(id)
  const { data: carriers } = useCarriers()
  const { data: locations } = useTransportLocations()
  const { data: exportOrders } = useExportOrders()
  const update = useUpdateTransport()
  const remove = useDeleteTransport()
  const createLocation = useCreateTransportLocation()
  const setOrderTransport = useSetOrderTransport()

  const [addingLocation, setAddingLocation] = useState(false)
  const [locationDraft, setLocationDraft] = useState(EMPTY_LOCATION)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20">
        <p className="font-medium">Access restricted</p>
      </div>
    )
  }

  if (isLoading || !transport) {
    return (
      <div className="p-4 lg:p-6 space-y-3 max-w-5xl mx-auto w-full">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }

  const t = transport
  const orders = t.orders ?? []
  const waiting = (exportOrders ?? []).filter(o => !o.transport_id)

  // Null and zero are different: a transport whose freight genuinely cost
  // nothing must still be able to read 0.00 instead of "not filled in".
  const num = (v: unknown): number | null =>
    v === null || v === undefined || v === '' ? null : Number(v)
  const freight = num(t.freight_cost)
  const other = num(t.other_costs)
  const totalCost = freight === null && other === null ? null : (freight ?? 0) + (other ?? 0)
  const totalWeight = num(t.total_weight_kg)

  // Colli drives the QR on the shipping label. The count is the number of
  // packages actually packed out per order, so an order nobody has packed yet
  // is called out rather than quietly counting as zero.
  const totalColli = orders.reduce((sum, o) => sum + (o.colli_contents?.length ?? 0), 0)
  const unpacked = orders.filter(o => (o.colli_contents?.length ?? 0) === 0).length

  // Weight of the load as weighed per package. The transport keeps its own
  // manual total as well: the two are filled in by different people at
  // different moments, and neither should silently overwrite the other.
  const colliWeight = orders.reduce((sum, o) =>
    sum + (o.colli_contents ?? []).reduce((s, c) => s + Number(c.weight_kg ?? 0), 0), 0)

  function save(values: Parameters<typeof update.mutate>[0]['values']) {
    update.mutate({ id, values })
  }

  async function addLocation() {
    if (!locationDraft.name.trim()) return
    const loc = await createLocation.mutateAsync(locationDraft)
    // Switching to warehouse and naming it in one write — the database check
    // rejects a warehouse transport that names no location.
    save({ ship_to: 'warehouse', location_id: loc.id })
    setLocationDraft(EMPTY_LOCATION)
    setAddingLocation(false)
  }

  return (
    <div className="p-4 lg:p-6 space-y-3 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/exports">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Ship className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-bold font-mono">{t.transport_number}</h1>
            <Badge className={`capitalize ${statusColors[t.status]}`}>{statusLabels[t.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
            {t.destination ? ` · ${t.destination}` : ''}
          </p>
        </div>
      </div>

      {/* Status + delete */}
      <Card size="sm">
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">Status</Label>
              <Select value={t.status} onValueChange={(v) => v && save({ status: v as TransportStatus })}>
                <SelectTrigger className="w-48 h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(statusLabels) as TransportStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 border-red-200 hover:bg-red-50 shrink-0"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>

          {confirmDelete && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3 space-y-2">
              <p className="text-sm">
                Remove transport <strong>{t.transport_number}</strong>?
                {orders.length > 0 && ` The ${orders.length} ${orders.length === 1 ? 'order' : 'orders'} on it stay, they just go back to waiting.`}
              </p>
              <div className="flex gap-2">
                <Button size="sm" className="bg-red-600 hover:bg-red-700"
                  onClick={async () => { await remove.mutateAsync(id); router.push('/exports') }}>
                  Remove
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transport details — plain form fields, not hidden behind a hover pencil */}
      <Card size="sm">
        <CardHeader><CardTitle className="text-base">Transport</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Carrier</Label>
            <Select
              value={t.carrier_id ?? ''}
              onValueChange={(v) => v && save({ carrier_id: v })}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue placeholder="Select carrier" />
              </SelectTrigger>
              <SelectContent>
                {(carriers ?? []).length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No carriers yet — add them under Settings
                  </div>
                ) : (carriers ?? []).map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.route ? ` — ${c.route}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Delivery address</Label>
            <Select
              value={t.ship_to === 'warehouse' ? (t.location_id ?? '') : 'customer'}
              onValueChange={(v) => {
                if (!v) return
                if (v === '__new') { setAddingLocation(true); return }
                if (v === 'customer') { save({ ship_to: 'customer', location_id: null }); return }
                save({ ship_to: 'warehouse', location_id: v })
              }}
            >
              <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">To the customer</SelectItem>
                {(locations ?? []).map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
                <SelectItem value="__new">+ New warehouse location</SelectItem>
              </SelectContent>
            </Select>
            {t.ship_to === 'warehouse' && t.location && (
              <p className="text-xs text-muted-foreground">
                {[t.location.street, [t.location.zip, t.location.city].filter(Boolean).join(' '), t.location.country]
                  .filter(Boolean).join(', ')}
              </p>
            )}
          </div>

          {addingLocation && (
            <div className="sm:col-span-2 rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">New warehouse location</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input autoFocus placeholder="Name *" className="h-8"
                  value={locationDraft.name}
                  onChange={e => setLocationDraft(d => ({ ...d, name: e.target.value }))} />
                <Input placeholder="Street" className="h-8"
                  value={locationDraft.street}
                  onChange={e => setLocationDraft(d => ({ ...d, street: e.target.value }))} />
                <Input placeholder="Postcode" className="h-8"
                  value={locationDraft.zip}
                  onChange={e => setLocationDraft(d => ({ ...d, zip: e.target.value }))} />
                <Input placeholder="City" className="h-8"
                  value={locationDraft.city}
                  onChange={e => setLocationDraft(d => ({ ...d, city: e.target.value }))} />
                <Input placeholder="Country" className="h-8"
                  value={locationDraft.country}
                  onChange={e => setLocationDraft(d => ({ ...d, country: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-red-600 hover:bg-red-700"
                  onClick={addLocation} disabled={!locationDraft.name.trim()}>
                  Add &amp; use
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => { setAddingLocation(false); setLocationDraft(EMPTY_LOCATION) }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Destination</Label>
            <Input
              className="h-8"
              defaultValue={t.destination}
              placeholder="e.g. Netherlands"
              onBlur={e => e.target.value !== t.destination && save({ destination: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">ETD — departure</Label>
              <Input type="date" className="h-8" defaultValue={t.etd ?? ''}
                onBlur={e => e.target.value !== (t.etd ?? '') && save({ etd: e.target.value || null })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ETA — arrival</Label>
              <Input type="date" className="h-8" defaultValue={t.eta ?? ''}
                onBlur={e => e.target.value !== (t.eta ?? '') && save({ eta: e.target.value || null })} />
            </div>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Input className="h-8" defaultValue={t.notes} placeholder="Internal notes"
              onBlur={e => e.target.value !== t.notes && save({ notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* Load — colli comes from the orders, the weight is the load as a whole */}
      <Card size="sm">
        <CardHeader><CardTitle className="text-base">Load</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Total colli</Label>
              <p className="h-8 flex items-center font-semibold">
                {totalColli}
                {unpacked > 0 && (
                  <span className="ml-2 text-xs font-normal text-red-600">
                    {unpacked} {unpacked === 1 ? 'order' : 'orders'} not packed yet
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Added up from the packing below
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Total weight (kg)</Label>
              <Input type="number" step="0.01" min="0" className="h-8" placeholder="Not filled in"
                defaultValue={totalWeight ?? ''}
                onBlur={e => save({ total_weight_kg: e.target.value === '' ? null : Number(e.target.value) })} />
              {colliWeight > 0 && (
                <p className="text-xs text-muted-foreground">
                  {colliWeight.toFixed(2)} kg weighed per colli
                  {totalWeight !== null && Math.abs(colliWeight - totalWeight) > 0.01 && (
                    <span className="text-amber-600"> — differs from the total above</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t pt-2">
            <span className="text-xs text-muted-foreground">Shipping label QR</span>
            <code className="text-sm font-mono font-semibold">
              {transportQrPayload(t.transport_number, totalColli)}
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Costs — for the whole transport, because the freight is paid once */}
      <Card size="sm">
        <CardHeader><CardTitle className="text-base">Costs</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Freight cost</Label>
              <Input type="number" step="0.01" min="0" className="h-8" placeholder="Not filled in"
                defaultValue={freight ?? ''}
                onBlur={e => save({ freight_cost: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Other costs</Label>
              <Input type="number" step="0.01" min="0" className="h-8" placeholder="Not filled in"
                defaultValue={other ?? ''}
                onBlur={e => save({ other_costs: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
          </div>
          {totalCost !== null && (
            <div className="flex justify-between text-sm font-semibold border-t pt-2">
              <span>Total transport cost</span>
              <span>{formatCurrency(totalCost, 'XCG')}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders on this transport */}
      <Card size="sm">
        <CardHeader><CardTitle className="text-base">Orders on this transport</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet</p>
          ) : orders.map(o => (
            <div key={o.id} className="rounded-xl border bg-card px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/orders/${o.id}`} className="flex-1 min-w-0 hover:opacity-70 leading-tight">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm font-medium">{o.order_number}</p>
                    <p className="font-medium text-sm truncate">{o.customer?.company_name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{fmtOwnCurrency(o)}</p>
                </Link>
                <button
                  onClick={() => setOrderTransport.mutate({ orderId: o.id, transportId: null })}
                  className="text-muted-foreground hover:text-red-600 p-1 shrink-0"
                  title="Take off this transport"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <ColliEditor order={o} />
            </div>
          ))}

          {waiting.length > 0 && (
            <Select value="" onValueChange={(v) => v && setOrderTransport.mutate({ orderId: v, transportId: id })}>
              <SelectTrigger className="h-8 w-full sm:w-72">
                <SelectValue placeholder="+ Add an order to this transport" />
              </SelectTrigger>
              <SelectContent>
                {waiting.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.order_number} — {o.customer?.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {waiting.length === 0 && orders.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Every export order is on a transport. New orders appear here automatically.
            </p>
          )}
        </CardContent>
      </Card>

      <TransportDocuments transport={t} />
    </div>
  )
}
