'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShoppingCart, Truck, CheckCircle2, Trash2, ChevronDown, ChevronUp, Plus, Search, RotateCcw } from 'lucide-react'
import { useOrders, useUpdateOrder } from '@/hooks/use-orders'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OrderStatus, Order } from '@/types'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

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

const ACTIVE_STATUSES: OrderStatus[] = ['pending_approval', 'processing', 'out_for_delivery', 'delivered', 'invoice_ready', 'invoice_blocked']

function OrdersPageInner() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<string>(searchParams.get('status') ?? 'active')
  const assignedFilter = searchParams.get('assigned') ?? ''
  const { data: allOrders, isLoading } = useOrders()
  const { isAdmin, profile } = useAuth()
  const queryClient = useQueryClient()
  const updateOrder = useUpdateOrder()
  const supabase = createClient()
  const router = useRouter()

  // Non-admins are redirected to delivery notes
  useEffect(() => {
    if (!isAdmin && profile !== undefined) {
      router.replace('/delivery-notes')
    }
  }, [isAdmin, profile, router])

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'price_desc' | 'price_asc'>('newest')
  const [showArchive, setShowArchive] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Mark as paid modal state
  const [paidTarget, setPaidTarget] = useState<Order | null>(null)
  const [paidDate, setPaidDate] = useState('')
  const [markingPaid, setMarkingPaid] = useState(false)

  const baseOrders = assignedFilter
    ? (allOrders?.filter(o => o.assigned_to === assignedFilter) ?? [])
    : (allOrders ?? [])

  const activeOrders = baseOrders.filter(o => ACTIVE_STATUSES.includes(o.status))
  const paidOrders = baseOrders.filter(o => o.status === 'paid')
  const deletedOrders = baseOrders.filter(o => o.status === 'deleted')

  const searchLower = search.toLowerCase().trim()

  function matchesSearch(o: Order) {
    if (!searchLower) return true
    return (
      o.order_number.toLowerCase().includes(searchLower) ||
      (o.customer?.company_name ?? '').toLowerCase().includes(searchLower) ||
      (o.customer?.contact_person ?? '').toLowerCase().includes(searchLower)
    )
  }

  function applySortOrders(list: Order[]) {
    return [...list].sort((a, b) => {
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sort === 'price_desc') return Number(b.total) - Number(a.total)
      if (sort === 'price_asc') return Number(a.total) - Number(b.total)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime() // newest
    })
  }

  const filteredActive = applySortOrders(
    (status === 'active'
      ? activeOrders
      : activeOrders.filter(o => o.status === status)
    ).filter(matchesSearch)
  )

  function openMarkPaid(order: Order, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setPaidDate(new Date().toISOString().split('T')[0])
    setPaidTarget(order)
  }

  async function handleMarkPaid() {
    if (!paidTarget || !paidDate) return
    setMarkingPaid(true)
    try {
      await updateOrder.mutateAsync({ id: paidTarget.id, values: { status: 'paid', invoice_date: paidDate } as any })
      toast.success(`${paidTarget.order_number} marked as paid`)
      setPaidTarget(null)
      setPaidDate('')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to mark as paid')
    } finally {
      setMarkingPaid(false)
    }
  }

  async function handleRevertPaid(order: Order, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await updateOrder.mutateAsync({ id: order.id, values: { status: 'invoice_ready', invoice_date: null } as any })
    toast.success(`${order.order_number} reverted to Send Invoice status`)
  }

  async function handleDelete() {
    if (!deleteTarget || !deleteReason.trim() || !deletePassword) return
    setDeleting(true)
    try {
      // Re-authenticate
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: profile?.email ?? '',
        password: deletePassword,
      })
      if (authError) {
        toast.error('Incorrect password')
        setDeleting(false)
        return
      }

      await supabase.from('orders').update({
        status: 'deleted',
        deleted_by: profile?.id,
        deleted_reason: deleteReason.trim(),
        deleted_at: new Date().toISOString(),
      } as any).eq('id', deleteTarget.id)

      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success(`${deleteTarget.order_number} deleted`)
      setDeleteTarget(null)
      setDeletePassword('')
      setDeleteReason('')
    } catch {
      toast.error('Failed to delete order')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">{filteredActive.length} active orders</p>
        </div>
        <Link href="/quotes/new">
          <Button className="bg-red-600 hover:bg-red-700 gap-2">
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </Link>
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
        <Select value={status} onValueChange={(v) => setStatus(v ?? 'active')}>
          <SelectTrigger className="flex-1 min-w-0">
            <SelectValue placeholder="Active orders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active orders</SelectItem>
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
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : filteredActive.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <ShoppingCart className="h-12 w-12 opacity-20" />
          <p className="font-medium">No orders found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredActive.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              isAdmin={isAdmin}
              statusColors={statusColors}
              statusLabels={statusLabels}
              onMarkPaid={(e) => openMarkPaid(order, e)}
              onDelete={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(order) }}
            />
          ))}
        </div>
      )}

      {/* Archive — paid orders */}
      {isAdmin && paidOrders.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowArchive(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showArchive ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Archive — Paid ({paidOrders.length})
          </button>
          {showArchive && (
            <div className="space-y-2 mt-2">
              {paidOrders.map(order => (
                <OrderRow
                  key={order.id}
                  order={order}
                  isAdmin={isAdmin}
                  statusColors={statusColors}
                  statusLabels={statusLabels}
                  dimmed
                  onRevert={(e) => handleRevertPaid(order, e)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deleted orders */}
      {isAdmin && deletedOrders.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowDeleted(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showDeleted ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Deleted ({deletedOrders.length})
          </button>
          {showDeleted && (
            <div className="space-y-2 mt-2">
              {deletedOrders.map(order => (
                <Link key={order.id} href={`/orders/${order.id}`} className="block p-4 rounded-xl border bg-card opacity-60 hover:opacity-80 transition-opacity">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-medium">{order.order_number}</p>
                        <Badge className="text-xs bg-gray-100 text-gray-500">Deleted</Badge>
                      </div>
                      <p className="font-medium mt-0.5">{order.customer?.company_name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Reason: {(order as any).deleted_reason ?? '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Deleted {(order as any).deleted_at ? new Date((order as any).deleted_at).toLocaleString() : ''}
                      </p>
                    </div>
                    {isAdmin && <p className="text-sm font-semibold shrink-0">XCG {Number(order.total).toFixed(2)}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active filter label */}
      {assignedFilter && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Filtered by worker</span>
          <Link href="/orders" className="text-red-600 hover:underline text-xs">Clear filter</Link>
        </div>
      )}

      {/* Mark as Paid modal */}
      {paidTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                Mark {paidTarget.order_number} as Paid
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the date the payment was received. This will move the order to the paid archive.
              </p>
              <div className="space-y-1.5">
                <Label>Payment date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={paidDate}
                  onChange={e => setPaidDate(e.target.value)}
                />
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setPaidTarget(null); setPaidDate('') }}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={!paidDate || markingPaid}
                  onClick={handleMarkPaid}
                >
                  {markingPaid ? 'Saving...' : 'Confirm Paid'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Delete {deleteTarget.order_number}?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">This will move the order to the Deleted list. It won't be permanently removed.</p>
              <div className="space-y-1.5">
                <Label>Reason for deletion <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. Test order, duplicate, customer cancelled..."
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm your password <span className="text-red-500">*</span></Label>
                <Input
                  type="password"
                  placeholder="Your account password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                />
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setDeleteTarget(null); setDeletePassword(''); setDeleteReason('') }}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={!deleteReason.trim() || !deletePassword || deleting}
                  onClick={handleDelete}
                >
                  {deleting ? 'Deleting...' : 'Delete Order'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersPageInner />
    </Suspense>
  )
}

function OrderRow({
  order, isAdmin, statusColors, statusLabels, onMarkPaid, onDelete, onRevert, dimmed
}: {
  order: Order
  isAdmin: boolean
  statusColors: Record<OrderStatus, string>
  statusLabels: Record<OrderStatus, string>
  onMarkPaid?: (e: React.MouseEvent) => void
  onDelete?: (e: React.MouseEvent) => void
  onRevert?: (e: React.MouseEvent) => void
  dimmed?: boolean
}) {
  const router = useRouter()
  return (
    <Link
      href={`/orders/${order.id}`}
      className={`block px-3 py-2 rounded-xl border bg-card hover:bg-accent transition-colors ${dimmed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
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
            {(order as any).is_consignment && (
              <Badge className="text-xs bg-amber-100 text-amber-700">📦 Consignment</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {order.assigned_user?.name ?? '—'} · {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (() => {
            const credit = (order.delivery?.table_bottles_returned ?? 0) * (order.customer?.table_bottle_return_price ?? 2.50)
            const adj = Number(order.total) - credit
            return <p className="font-semibold text-sm">XCG {adj.toFixed(2)}</p>
          })()}
          <div className="flex gap-1">
            {order.status === 'processing' && (
              // Not a <Link>: the whole row is already an anchor and nested
              // anchors are invalid HTML (causes hydration errors)
              <Button
                size="sm"
                className="h-7 bg-red-600 hover:bg-red-700 text-xs gap-1"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/delivery/${order.id}`) }}
              >
                <Truck className="h-3 w-3" />
                Deliver
              </Button>
            )}
            {isAdmin && order.status === 'invoice_ready' && onMarkPaid && (
              <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-xs gap-1" onClick={onMarkPaid}>
                <CheckCircle2 className="h-3 w-3" />
                Paid
              </Button>
            )}
            {isAdmin && order.status === 'paid' && onRevert && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onRevert}>
                <RotateCcw className="h-3 w-3" />
                Revert
              </Button>
            )}
            {isAdmin && order.status !== 'paid' && onDelete && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-500 hover:bg-red-50 gap-1" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
