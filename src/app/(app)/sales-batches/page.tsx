'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Boxes, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBatches, useBatchStock } from '@/hooks/use-batches'
import { useBatchCosts } from '@/hooks/use-batch-costs'
import { useBatchOutflow, useBatchCostLog } from '@/hooks/use-batch-history'
import { useTransports, useTransportLocations } from '@/hooks/use-transports'
import { useUsers } from '@/hooks/use-users'
import { formatTht, formatCurrency } from '@/lib/utils'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { transportColli } from '@/lib/transport-cargo'

const ALL = '__all__'

/**
 * Every batch there is: where it is, what came in on it, and which orders went
 * out of it.
 *
 * Her tab, 2026-08-21. She asked for it twice and was right both times: "we
 * moeten ergens overzichtelijk dit kunnen zien, ik weet dat het er is, maar dat
 * is niet overzichtelijk als je iets nodig hebt of in de historie terug wilt
 * kijken." And when the council said fold it into Stock & Production, she
 * overruled that too: "Stock en production is voor productie... partijen en deze
 * partijen zaken hebben uitgeleverd heeft niets met productie te maken."
 *
 * Making a batch stays under Stock, because filling bottles IS production. What
 * happens to it afterwards lives here.
 *
 * Nothing on this page is stored twice. Stock is the sum of the movements, the
 * arrival comes off the transport's own colli, and the outflow is the same rows
 * again read the other way round. That is why it can be trusted: there is no
 * second list that somebody has to remember to update.
 */
export default function SalesBatchesPage() {
  const { isAdmin, can, isLoading } = useAuth()
  const router = useRouter()

  const { data: batches, isLoading: batchesLoading } = useBatches()
  const { data: stock } = useBatchStock()
  const { data: costs } = useBatchCosts()
  const { data: transports } = useTransports()
  const { data: locations } = useTransportLocations()
  const { data: users } = useUsers()

  const [open, setOpen] = useState<string | null>(null)
  const [place, setPlace] = useState<string>(ALL)
  const [product, setProduct] = useState<string>(ALL)
  const [onlyStanding, setOnlyStanding] = useState(false)
  const [search, setSearch] = useState('')

  const all = batches ?? []
  const { data: outflow } = useBatchOutflow(all.map(b => b.id))
  const { data: costLog } = useBatchCostLog(all.map(b => b.id))

  if (!isLoading && !isAdmin && !can('batches.view')) {
    router.replace('/dashboard')
    return null
  }

  const productName = (sku: string) => SPIKA_PRODUCTS.find(p => p.sku === sku)?.name ?? sku
  const personName = (id: string) => (users ?? []).find(u => u.id === id)?.name ?? 'somebody'

  /** Where a batch lives, in words. A person holding it counts as a place. */
  function whereOf(b: { location_id?: string | null; holder_id?: string | null }) {
    if (b.holder_id) return personName(b.holder_id)
    if (!b.location_id) return 'Curaçao'
    return (locations ?? []).find(l => l.id === b.location_id)?.name ?? 'Warehouse'
  }

  const leftOf = (batchId: string) =>
    (stock ?? []).filter(r => r.batch_id === batchId).reduce((s, r) => s + r.qty, 0)
  const costOf = (batchId: string) => {
    const v = (costs ?? []).find(c => c.batch_id === batchId)?.vvp
    return v === null || v === undefined ? null : Number(v)
  }
  const partsOf = (batchId: string) =>
    ((costs ?? []).find(c => c.batch_id === batchId)?.breakdown ?? null) as
      | { product?: number | null; freight?: number; local?: number; storage?: number; rate?: number; bottles?: number }
      | null
  const wentOf = (batchId: string) => (outflow ?? []).filter(o => o.batch_id === batchId)

  const term = search.trim().toLowerCase()
  const rows = all
    .map(b => ({ ...b, left: leftOf(b.id), where: whereOf(b) }))
    .filter(b => place === ALL || (place === 'curacao' ? !b.location_id && !b.holder_id : b.location_id === place))
    .filter(b => product === ALL || b.sku === product)
    .filter(b => !onlyStanding || b.left > 0)
    .filter(b => {
      if (!term) return true
      if (b.batch_number.toLowerCase().includes(term)) return true
      // Searching an ORDER number has to find the batch it came off — that is
      // the question a customer complaint arrives as.
      return wentOf(b.id).some(o =>
        (o.order?.order_number ?? '').toLowerCase().includes(term)
        || (o.order?.customer?.company_name ?? '').toLowerCase().includes(term),
      )
    })
    // Standing stock first, then the empties: history without clutter.
    .sort((a, b) =>
      (b.left > 0 ? 1 : 0) - (a.left > 0 ? 1 : 0)
      || a.batch_number.localeCompare(b.batch_number),
    )

  const totalStanding = rows.reduce((s, b) => s + Math.max(0, b.left), 0)

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-4xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Boxes className="h-6 w-6 text-red-600" />
          Sales Batches
        </h1>
        <p className="text-sm text-muted-foreground">
          Every batch, where it is, and which orders went out of it
        </p>
      </div>

      <Card size="sm">
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder="Batch number, order number or customer"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={place} onValueChange={v => v && setPlace(v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everywhere</SelectItem>
                <SelectItem value="curacao">Curaçao</SelectItem>
                {(locations ?? []).map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={product} onValueChange={v => v && setProduct(v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All products</SelectItem>
                {SPIKA_PRODUCTS.map(p => (
                  <SelectItem key={p.sku} value={p.sku}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm px-1">
              <input
                type="checkbox"
                className="h-4 w-4 accent-red-600"
                checked={onlyStanding}
                onChange={e => setOnlyStanding(e.target.checked)}
              />
              Only what is still standing
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'batch' : 'batches'} · {totalStanding} bottles standing
          </p>
        </CardContent>
      </Card>

      {batchesLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : rows.length === 0 ? (
        <Card size="sm">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {all.length === 0
                ? 'No batches yet. They start at Stock & Production, where bottles are filled.'
                : 'Nothing matches that.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {rows.map(b => {
            const isOpen = open === b.id
            const parent = all.find(x => x.id === b.parent_batch_id)
            const transport = (transports ?? []).find(t => t.id === b.transport_id)
            const went = wentOf(b.id)
            const parts = partsOf(b.id)
            const cost = costOf(b.id)
            const log = (costLog ?? []).filter(l => l.batch_id === b.id)

            const arrivals = (transport ? transportColli(transport) : [])
              .filter(c => c.ata && (c.received_items ?? []).some(l => l.sku === b.sku))
              .map(c => ({
                ata: c.ata as string,
                note: c.ata_note ?? '',
                by: c.received_by ?? null,
                lines: (c.received_items ?? []).filter(l => l.sku === b.sku),
              }))

            return (
              <Card key={b.id} size="sm" className={b.left > 0 ? '' : 'bg-muted/40'}>
                <CardContent className="py-0 px-0">
                  <button
                    onClick={() => setOpen(isOpen ? null : b.id)}
                    className="w-full flex items-center gap-2 px-3 py-1 text-left leading-tight"
                  >
                    {isOpen
                      ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    <span className="font-mono text-sm font-medium truncate">{b.batch_number}</span>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                      {productName(b.sku)}
                    </span>
                    <Badge className="text-[10px] bg-slate-100 text-slate-700 shrink-0">{b.where}</Badge>
                    {b.tht_date && (
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                        THT {formatTht(b.tht_date)}
                      </span>
                    )}
                    {b.left === 0 && (
                      <Badge className="text-[10px] bg-gray-100 text-gray-500 shrink-0">Empty</Badge>
                    )}
                    <span className="ml-auto text-sm font-semibold shrink-0">{b.left}</span>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-2.5 pt-1.5 border-t space-y-2.5 text-xs">
                      <div className="space-y-0.5">
                        <Row label="Product" value={productName(b.sku)} />
                        <Row label="Where" value={b.where} />
                        {formatTht(b.tht_date) && <Row label="Best before" value={formatTht(b.tht_date)!} />}
                        {/* Jumping to the parent is a filter on this same list,
                            not another page — you are already looking at every
                            batch there is. */}
                        {parent && (
                          <Row
                            label="Out of"
                            value={parent.batch_number}
                            onClick={() => { setSearch(parent.batch_number); setOpen(parent.id) }}
                          />
                        )}
                        {transport && (
                          <Row
                            label="Transport"
                            value={transport.transport_number}
                            /* Export is admin-only. A link that throws somebody
                               back out is worse than plain text — the same fault
                               we took off the warehouse page. */
                            href={isAdmin ? `/exports/${transport.id}` : undefined}
                          />
                        )}
                      </div>

                      {arrivals.length > 0 && (
                        <div className="space-y-0.5 pt-1.5 border-t">
                          {arrivals.map((a, i) => (
                            <div key={i} className="space-y-0.5">
                              <Row
                                label="Arrived"
                                value={new Date(a.ata + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                              />
                              {a.lines.map((l, j) => (
                                <Row
                                  key={j}
                                  label="Counted"
                                  value={l.received === l.expected
                                    ? String(l.received)
                                    : `${l.received} of ${l.expected}${l.reason ? ` — ${l.reason}` : ''}`}
                                />
                              ))}
                              {a.by && <Row label="Signed in by" value={personName(a.by)} />}
                              {a.note && <Row label="Note" value={a.note} />}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* What it cost, and every time that changed. Admin only —
                          the count is warehouse business, the money is not, and
                          the database refuses it as well (migration 116). */}
                      {parts && (
                        <div className="space-y-0.5 pt-1.5 border-t">
                          {parts.product !== null && parts.product !== undefined && (
                            <Row label="Product" value={formatCurrency(parts.product, 'XCG')} />
                          )}
                          {!!parts.freight && <Row label="Freight" value={formatCurrency(parts.freight, 'XCG')} />}
                          {!!parts.local && <Row label="Local costs" value={formatCurrency(parts.local, 'XCG')} />}
                          {!!parts.storage && <Row label="Storage" value={formatCurrency(parts.storage, 'XCG')} />}
                          {parts.rate !== undefined && parts.rate !== 1 && (
                            <Row label="Rate used" value={String(parts.rate)} />
                          )}
                          {parts.bottles !== undefined && (
                            <Row label="Spread over" value={`${parts.bottles} bottles received`} />
                          )}
                          <Row
                            label="Cost per bottle"
                            value={cost === null ? 'product cost not set yet' : formatCurrency(cost, 'XCG')}
                            strong
                          />
                          {log.length > 1 && (
                            <details className="pt-1">
                              <summary className="cursor-pointer text-muted-foreground">
                                Worked out {log.length} times
                              </summary>
                              <div className="pt-1 space-y-0.5">
                                {log.map(l => (
                                  <Row
                                    key={l.id}
                                    label={new Date(l.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                                    value={`${l.vvp_after === null ? '—' : formatCurrency(Number(l.vvp_after), 'XCG')} · ${l.reason}`}
                                  />
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}

                      {/* Where it went. The recall list, and the answer to "which
                          orders came off this batch". */}
                      <div className="space-y-0.5 pt-1.5 border-t">
                        <p className="font-semibold text-muted-foreground uppercase tracking-wide">
                          Delivered out of this batch
                        </p>
                        {went.length === 0 ? (
                          <p className="text-muted-foreground">Nothing has gone out yet.</p>
                        ) : went.map((o, i) => (
                          <div key={i} className="flex justify-between gap-3">
                            <span className="text-muted-foreground shrink-0">
                              {new Date(o.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="min-w-0 truncate text-right">
                              {o.order ? (
                                <>
                                  <Link href={`/orders/${o.order.id}`} className="text-red-600 hover:underline">
                                    {o.order.order_number}
                                  </Link>
                                  {o.order.customer && (
                                    <>
                                      {' · '}
                                      <Link href={`/customers/${o.order.customer.id}`} className="hover:underline">
                                        {o.order.customer.company_name}
                                      </Link>
                                    </>
                                  )}
                                </>
                              ) : (
                                <span className="text-muted-foreground">
                                  {o.reason === 'shopify' ? 'Shopify' : 'no order'}
                                </span>
                              )}
                            </span>
                            <span className="font-medium shrink-0 w-10 text-right">{Math.abs(o.qty)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, href, onClick, strong }: {
  label: string; value: string; href?: string; onClick?: () => void; strong?: boolean
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {href ? (
        <Link href={href} className="text-right min-w-0 truncate text-red-600 hover:underline">
          {value}
        </Link>
      ) : onClick ? (
        <button onClick={onClick} className="text-right min-w-0 truncate text-red-600 hover:underline">
          {value}
        </button>
      ) : (
        <span className={`text-right min-w-0 truncate ${strong ? 'font-semibold' : ''}`}>{value}</span>
      )}
    </div>
  )
}
