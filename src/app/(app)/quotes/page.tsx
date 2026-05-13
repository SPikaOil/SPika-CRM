'use client'

import Link from 'next/link'
import { Plus, Truck, Calendar } from 'lucide-react'
import { useMyOrders } from '@/hooks/use-orders'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderStatus } from '@/types'

const statusColors: Record<OrderStatus, string> = {
  pending_approval:  'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  processing:        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  out_for_delivery:  'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  delivered:         'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  invoice_ready:     'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  invoice_blocked:   'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  paid:              'bg-emerald-100 text-emerald-700',
  deleted:           'bg-gray-100 text-gray-500',
}

const statusLabels: Record<OrderStatus, string> = {
  pending_approval: 'Pending Approval',
  processing:       'Pending',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  invoice_ready:    'Invoice Ready',
  invoice_blocked:  'Blocked',
  paid:             'Paid',
  deleted:          'Deleted',
}

export default function DeliveryNotesPage() {
  const { profile, isAdmin } = useAuth()
  const { data: orders, isLoading } = useMyOrders(profile?.id, isAdmin)

  const pending   = orders?.filter((o) => o.status === 'processing' || o.status === 'out_for_delivery') ?? []
  const completed = orders?.filter((o) => o.status === 'delivered' || o.status === 'invoice_ready' || o.status === 'invoice_blocked') ?? []

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Delivery Notes</h1>
          <p className="text-muted-foreground text-sm">
            {pending.length} pending · {completed.length} completed
          </p>
        </div>
        {isAdmin && (
          <Link href="/quotes/new">
            <Button className="bg-red-600 hover:bg-red-700">
              <Plus className="h-4 w-4 mr-2" />
              New Delivery Note
            </Button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : orders?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Truck className="h-12 w-12 opacity-20" />
          <p className="font-medium">No delivery notes yet</p>
          {isAdmin && <p className="text-sm">Create one and assign it to a worker</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pending */}
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending</p>
              {pending.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-sm font-medium">{order.order_number}</p>
                      <Badge className={`text-xs ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </Badge>
                    </div>
                    <p className="font-medium mt-0.5 truncate">{order.customer?.company_name}</p>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                      {order.planned_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(order.planned_date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      {isAdmin && order.assigned_user?.name && (
                        <span className="font-medium text-foreground">{order.assigned_user.name}</span>
                      )}
                    </div>
                  </div>
                  <p className="font-semibold shrink-0">XCG {Number(order.total).toFixed(2)}</p>
                </Link>
              ))}
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed</p>
              {completed.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent transition-colors opacity-70"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-sm font-medium">{order.order_number}</p>
                      <Badge className={`text-xs ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </Badge>
                    </div>
                    <p className="font-medium mt-0.5 truncate">{order.customer?.company_name}</p>
                    {isAdmin && order.assigned_user?.name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{order.assigned_user.name}</p>
                    )}
                  </div>
                  <p className="font-semibold shrink-0">XCG {Number(order.total).toFixed(2)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
