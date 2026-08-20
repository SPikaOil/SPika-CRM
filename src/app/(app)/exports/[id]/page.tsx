'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, X as XIcon, Ship } from 'lucide-react'
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
  useTransportLocations, useExportOrders, useSetOrderTransport,
  useWarehouseDeliveryAddresses,
} from '@/hooks/use-transports'
import { ColliEditor } from '../_components/colli-editor'
import { OrderPosLine } from '@/components/order-pos-line'
import { TransportDocuments } from '../_components/transport-documents'
import { ReceivedDocuments } from '../_components/received-documents'
import { ArrivalCard } from '../_components/arrival-card'
import { ShortagePanel } from '../_components/shortage-panel'
import { TransportStatus } from '@/types'
import { fmtOwnCurrency, formatCurrency, transportQrPayload } from '@/lib/utils'
import { transportGrossWeight, weightsBySku } from '@/lib/transport-cargo'
import { useProducts } from '@/hooks/use-products'

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

// Same trick for "no drop-off picked" — the load goes to the warehouse itself.
const WAREHOUSE_ITSELF = '__warehouse__'

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
  const { data: dropOffs } = useWarehouseDeliveryAddresses()
  const { data: exportOrders } = useExportOrders()
  // Bottle weights, for the gross weight of the load.
  const { data: products } = useProducts()
  const update = useUpdateTransport()
  const remove = useDeleteTransport()
  const setOrderTransport = useSetOrderTransport()

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

  // Colli drives the QR on the shipping label. The count is the number of
  // packages actually packed out per order, so an order nobody has packed yet
  // is called out rather than quietly counting as zero.
  const totalColli = orders.reduce((sum, o) => sum + (o.colli_contents?.length ?? 0), 0)
  const unpacked = orders.filter(o => (o.colli_contents?.length ?? 0) === 0).length

  // Gross weight of the load, worked out rather than typed: the packaging of
  // every box plus the bottles in it, at the weight the Products screen holds.
  // Her instruction of 2026-08-19. `missing` names any product with no weight
  // set — those bottles are not counted, so the total is too low and says so.
  const packagingWeight = orders.reduce((sum, o) =>
    sum + (o.colli_contents ?? []).reduce((s, c) => s + Number(c.weight_kg ?? 0), 0), 0)
  const gross = transportGrossWeight(t, weightsBySku(products))

  // The doors of THIS warehouse, and the one this load uses. Read from the list
  // as well as from the joined row so the picker is right on the first paint —
  // the same lesson as the warehouse trigger above.
  const dropOffsHere = (dropOffs ?? []).filter(a => a.location_id === t.location_id)
  const dropOff = t.delivery_address
    ?? dropOffsHere.find(a => a.id === t.delivery_address_id)
    ?? null

  function save(values: Parameters<typeof update.mutate>[0]['values']) {
    update.mutate({ id, values })
  }

  /**
   * Rename the transport.
   *
   * Separate from `save` because this one field can be refused, and a heading
   * that silently keeps the typed text while the database still holds the old
   * number is worse than no rename at all. On refusal the input is put back to
   * what is actually stored.
   *
   * The number is on the packing list, the invoice, the B/L, every shipping
   * label and inside every QR — all of them read it off the transport, so a
   * rename reaches them the next time a document is generated. Papers already
   * printed keep the old number.
   */
  function saveNumber(value: string, el: HTMLInputElement) {
    const next = value.trim()
    if (next === t.transport_number) return
    // Empty never reaches the database: the column is NOT NULL, and a transport
    // nobody can look up by number is a lost transport.
    if (!next) {
      el.value = t.transport_number
      return
    }
    update.mutate(
      { id, values: { transport_number: next } },
      // The message comes from useUpdateTransport, which knows how to phrase a
      // number that is already taken. This only puts the heading back to what
      // is actually stored, so the screen never shows a name the database
      // refused.
      { onError: () => { el.value = t.transport_number } },
    )
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
            {/* The number is OURS to decide — her instruction of 2026-08-19.
                The database still hands out a next one when a transport is
                created, so nobody has to invent one, but it is a starting point
                and not a lock. Editable straight in the heading rather than
                hidden in a field below: it is the name of this page.

                Saved on blur, and empty is refused — the column is NOT NULL and
                unique, and a transport with no number is unfindable. A number
                already in use comes back from the database as 23505, which
                saveNumber turns into something readable. */}
            <Input
              key={t.transport_number}
              defaultValue={t.transport_number}
              onBlur={e => saveNumber(e.target.value, e.target)}
              aria-label="Transport number"
              className="text-xl font-bold font-mono h-9 w-44 px-2"
            />
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
            <Label className="text-xs">Warehouse</Label>
            <Select
              value={t.ship_to === 'warehouse' ? (t.location_id ?? '') : 'customer'}
              onValueChange={(v) => {
                if (!v) return
                if (v === 'customer') {
                  save({ ship_to: 'customer', location_id: null, delivery_address_id: null })
                  return
                }
                // A drop-off belongs to one warehouse, so switching warehouse
                // has to let go of the door as well — otherwise the papers
                // would print an address that is nowhere near the new one.
                save({ ship_to: 'warehouse', location_id: v, delivery_address_id: null })
              }}
            >
              {/* The label is written out here rather than left to the Select.
                  Radix remembers the label of the item that was mounted when
                  the value was set, and the warehouse list arrives one render
                  later than the transport does — so the trigger sat there
                  showing the raw id, 4402b887-904a-..., instead of NBC NL 1.
                  Read from our own data and it is right on the first paint. */}
              <SelectTrigger className="h-8 w-full">
                <SelectValue>
                  {t.ship_to === 'warehouse'
                    ? (t.location?.name
                        ?? (locations ?? []).find(l => l.id === t.location_id)?.name
                        ?? 'Pick a warehouse')
                    : 'To the customer'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">To the customer</SelectItem>
                {(locations ?? []).map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {t.ship_to === 'warehouse' && t.location && (
              <p className="text-xs text-muted-foreground">
                {[t.location.street, [t.location.zip, t.location.city].filter(Boolean).join(' '), t.location.country]
                  .filter(Boolean).join(', ')}
              </p>
            )}
            {/* A warehouse is made in Settings and nowhere else — her rule of
                2026-08-19, "settings is leading". This screen used to offer
                "+ New warehouse location", which meant a place could come into
                existence halfway through a shipment with no delivery addresses
                and nobody in charge of it, and the stock booked in on arrival
                would land against a warehouse nobody had set up. Picking one
                here is all this screen does now. */}
            <p className="text-[11px] text-muted-foreground">
              Warehouses and their delivery addresses are set up under{' '}
              <Link href="/settings" className="text-red-600 underline">Settings</Link>.
            </p>
          </div>

          {/* Which door of that warehouse. DPD and the others drop part of a
              load somewhere else and the warehouse collects it there, so the
              address on the papers is often not the warehouse's own (095). Only
              this address is printed — the name in the list is for us. */}
          {t.ship_to === 'warehouse' && t.location_id && (
            <div className="space-y-1.5">
              <Label className="text-xs">Delivery address</Label>
              <Select
                value={t.delivery_address_id ?? WAREHOUSE_ITSELF}
                onValueChange={(v) => {
                  if (!v) return
                  save({ delivery_address_id: v === WAREHOUSE_ITSELF ? null : v })
                }}
              >
                {/* The picker shows the DISPLAY name — that one is ours. What
                    actually gets printed is spelled out underneath, so nobody
                    has to open a PDF to see it. */}
                <SelectTrigger className="h-8 w-full">
                  <SelectValue>
                    {dropOff
                      ? (dropOff.label || dropOff.name || dropOff.street || 'Delivery address')
                      : 'The warehouse itself'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WAREHOUSE_ITSELF}>The warehouse itself</SelectItem>
                  {dropOffsHere.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.label || a.name || a.street}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dropOff ? (
                <p className="text-xs text-muted-foreground">
                  On the packing list:{' '}
                  <span className="text-foreground">
                    {[dropOff.name, dropOff.street,
                      [dropOff.zip, dropOff.city].filter(Boolean).join(' '), dropOff.country]
                      .filter(Boolean).join(', ')}
                  </span>
                  {!dropOff.name && ' — no name set for this address yet'}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Goes to the warehouse address above.
                </p>
              )}
              {dropOffsHere.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No delivery addresses for this warehouse yet — add them under{' '}
                  <Link href="/settings" className="text-red-600 underline">Settings</Link>.
                </p>
              )}
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

          {/* Who the load is addressed to at the other end. Not on the warehouse
              itself, because it can be someone else every transport. A delivery
              address carries a default; leaving this empty uses it (095). */}
          <div className="space-y-1.5">
            <Label className="text-xs">Attn. — who receives it</Label>
            <Input
              key={t.delivery_address_id ?? 'none'}
              className="h-8"
              defaultValue={t.receiver_contact ?? ''}
              placeholder={
                dropOff?.receiver_contact
                  ? `${dropOff.receiver_contact} (from the address)`
                  : 'Name of the contact person at the receiver'
              }
              onBlur={e => e.target.value !== (t.receiver_contact ?? '') && save({ receiver_contact: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              Printed on the packing list as &ldquo;Attn.&rdquo;{' '}
              {dropOff?.receiver_contact
                ? 'Leave it empty to use the name kept on this delivery address.'
                : 'Under the receiver.'}
            </p>
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
            <Label className="text-xs">Internal notes</Label>
            <Input className="h-8" defaultValue={t.notes} placeholder="Only we see this"
              onBlur={e => e.target.value !== t.notes && save({ notes: e.target.value })} />
          </div>

          {/* Two fields on purpose. The one above has been used for things like
              "Back Order Fenix (cavalier drama shipment cover)" — true, useful,
              and not for a customer's eyes. This one is the one that prints. */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">Note on the packing list</Label>
            <Input
              className="h-8"
              defaultValue={t.notes_on_documents ?? ''}
              placeholder="e.g. 3 extra label sheets enclosed"
              onBlur={e => e.target.value !== (t.notes_on_documents ?? '') && save({ notes_on_documents: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              Printed under the goods on the packing list of this transport.
            </p>
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
            {/* Gross weight is worked out, not typed. Only the packaging of each
                box is entered, down in the packing; the bottles come from the
                weight on the Products screen. Her instruction of 2026-08-19.
                The old hand-typed total is what put 1.00 kg on a load of 42
                bottles, so the field is gone rather than left to drift. */}
            <div className="space-y-1.5">
              <Label className="text-xs">Gross weight</Label>
              <p className="h-8 flex items-center font-semibold">
                {gross.kg > 0 ? `${gross.kg.toFixed(2)} kg` : '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                Packaging {packagingWeight.toFixed(2)} kg + contents{' '}
                {(gross.kg - packagingWeight).toFixed(2)} kg
              </p>
              {gross.missing.length > 0 && (
                <p className="text-xs text-amber-600">
                  Too low — no Weight (g) on Products for {gross.missing.join(', ')}
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
              {/* A stand or a sheet of labels riding along. Lands as a €0 line
                  on the order, which is what the packing list prints. */}
              <OrderPosLine order={o} />
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

      {/* Signing in at the other end. Only a warehouse can hold stock. */}
      <ArrivalCard transport={t} />

      {/* What a shortage means for the customer. Only shows once it is signed
          in and something actually came up short. */}
      <ShortagePanel transport={t} />

      <TransportDocuments transport={t} />

      {/* Papers that came back stamped. The card above generates what we send;
          this one keeps what somebody else signed and handed back. */}
      <ReceivedDocuments transport={t} />
    </div>
  )
}
