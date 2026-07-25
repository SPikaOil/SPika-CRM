'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, ChevronDown, ChevronUp, Search, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadCsv, csvDate, csvMoney } from '@/lib/csv-export'
import { useMyOrders } from '@/hooks/use-orders'
import { useAuth } from '@/contexts/auth-context'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OrderStatus, Order } from '@/types'

const statusColors: Record<OrderStatus, string> = {
  pending_approval: 'bg-orange-100 text-orange-700',
  processing: 'bg-yellow-100 text-yellow-700',
  out_for_delivery: 'bg-blue-100 text-blue-700',
  delivered: 'bg-purple-100 text-purple-700',
  invoice_ready: 'bg-green-100 text-green-700',
  invoice_blocked: 'bg-red-100 text-red-700',
  paid: 'bg-emerald-100 text-emerald-700',
  deleted: 'bg-gray-100 text-gray-500',
}

const statusLabels: Record<OrderStatus, string> = {
  pending_approval: 'Pending Approval',
  processing: 'Processing',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  invoice_ready: 'Send Invoice',
  invoice_blocked: 'Invoice Blocked',
  paid: 'Paid',
  deleted: 'Deleted',
}

const ACTIVE_STATUSES: OrderStatus[] = [
  'pending_approval',
  'processing',
  'out_for_delivery',
  'delivered',
  'invoice_ready',
  'invoice_blocked',
]

export default function DeliveryNotesPage() {
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'price_desc' | 'price_asc'>('newest')
  const [showArchive, setShowArchive] = useState(false)
  const [search, setSearch] = useState('')
  const { isAdmin, profile } = useAuth()

  // useMyOrders: if isAdmin=true it returns all orders, otherwise only assigned to userId
  const { data: allOrders, isLoading } = useMyOrders(profile?.id, isAdmin)

  const activeOrders =
    allOrders?.filter((o) => ACTIVE_STATUSES.includes(o.status)) ?? []
  // Paid orders are only visible to admins — sales workers don't need to see them
  const archivedOrders =
    isAdmin ? (allOrders?.filter((o) => o.status === 'paid') ?? []) : []

  const searchLower = search.toLowerCase().trim()
  function matchesSearch(o: Order) {
    if (!searchLower) return true
    return (
      o.order_number.toLowerCase().includes(searchLower) ||
      (o.customer?.company_name ?? '').toLowerCase().includes(searchLower)
    )
  }

  function applySortOrders(list: Order[]) {
    return [...list].sort((a, b) => {
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sort === 'price_desc') return Number(b.total) - Number(a.total)
      if (sort === 'price_asc') return Number(a.total) - Number(b.total)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }

  const filteredActive = applySortOrders(
    (statusFilter === 'active'
      ? activeOrders
      : activeOrders.filter((o) => o.status === statusFilter)
    ).filter(matchesSearch)
  )

  // CSV of the notes currently listed — status filter, search and sort apply
  function exportCsv() {
    downloadCsv(
      'delivery-notes',
      ['Order #', 'Customer', 'Status', 'Planned', 'Created', 'Delivered', 'Assigned to', 'Total', 'Items'],
      filteredActive.map(o => [
        o.order_number,
        o.customer?.company_name ?? '',
        o.status,
        o.planned_date ?? '',
        csvDate(o.created_at),
        csvDate((o.delivery as any)?.delivered_at),
        o.assigned_user?.name ?? '',
        csvMoney(o.total),
        ((o.items ?? []) as any[]).filter(i => i.qty > 0).map(i => `${i.qty}x ${i.sku}`).join('; '),
      ])
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Delivery Notes</h1>
          <p className="text-muted-foreground text-sm">
            {filteredActive.length} active{!isAdmin ? ' assigned' : ''} notes
          </p>
        </div>
        <Button variant="outline" size="icon" title="Export CSV"
          disabled={!filteredActive.length} onClick={exportCsv}>
          <FileSpreadsheet className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by order number or customer name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter + Sort */}
      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'active')}>
          <SelectTrigger className="flex-1 min-w-0">
            <SelectValue placeholder="Active" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            {ACTIVE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="flex-1 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="price_desc">Price: high → low</SelectItem>
            <SelectItem value="price_asc">Price: low → high</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : filteredActive.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <FileText className="h-12 w-12 opacity-20" />
          <p className="font-medium">No delivery notes found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredActive.map((order) => (
            <DeliveryNoteRow
              key={order.id}
              order={order}
              statusColors={statusColors}
              statusLabels={statusLabels}
            />
          ))}
        </div>
      )}

      {/* Archive — paid */}
      {archivedOrders.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showArchive ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Archive — Paid ({archivedOrders.length})
          </button>
          {showArchive && (
            <div className="space-y-2 mt-2">
              {archivedOrders.map((order) => (
                <DeliveryNoteRow
                  key={order.id}
                  order={order}
                  statusColors={statusColors}
                  statusLabels={statusLabels}
                  dimmed
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DeliveryNoteRow({
  order,
  statusColors,
  statusLabels,
  dimmed,
}: {
  order: Order
  statusColors: Record<OrderStatus, string>
  statusLabels: Record<OrderStatus, string>
  dimmed?: boolean
}) {
  return (
    <Link
      href={`/delivery-notes/${order.id}`}
      className={`block px-3 py-0.5 leading-tight rounded-xl border bg-card hover:bg-accent transition-colors ${
        dimmed ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-medium">{order.order_number}</p>
            <p className="font-medium text-sm truncate">{order.customer?.company_name}</p>
            <Badge className={`text-xs ${statusColors[order.status]}`}>
              {statusLabels[order.status]}
            </Badge>
            {(order as any).payment_type === 'cash' && (
              <Badge className="text-xs bg-green-100 text-green-700">Cash</Badge>
            )}
            {(order as any).order_type === 'free_bottle_service' && (
              <Badge className="text-xs bg-emerald-100 text-emerald-700">🎁 Free Bottles</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {order.assigned_user?.name ?? '—'} ·{' '}
            {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </Link>
  )
}
