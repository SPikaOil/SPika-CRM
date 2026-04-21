'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShoppingCart, Truck } from 'lucide-react'
import { useOrders } from '@/hooks/use-orders'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OrderStatus } from '@/types'

const statusColors: Record<OrderStatus, string> = {
  processing: 'bg-yellow-100 text-yellow-700',
  out_for_delivery: 'bg-blue-100 text-blue-700',
  delivered: 'bg-purple-100 text-purple-700',
  invoice_ready: 'bg-green-100 text-green-700',
  invoice_blocked: 'bg-red-100 text-red-700',
}

const statusLabels: Record<OrderStatus, string> = {
  processing: 'Processing',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  invoice_ready: 'Invoice Ready',
  invoice_blocked: 'Invoice Blocked',
}

export default function OrdersPage() {
  const [status, setStatus] = useState<string>('all')
  const { data: orders, isLoading } = useOrders(status !== 'all' ? (status as OrderStatus) : undefined)

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">{orders?.length ?? 0} orders</p>
        </div>
      </div>

      {/* Filter */}
      <Select value={status} onValueChange={(v) => setStatus(v ?? 'all')}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {(Object.keys(statusLabels) as OrderStatus[]).map((s) => (
            <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : orders?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <ShoppingCart className="h-12 w-12 opacity-20" />
          <p className="font-medium">No orders found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders?.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block p-4 rounded-xl border bg-card hover:bg-accent transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm font-medium">{order.order_number}</p>
                    <Badge className={`text-xs ${statusColors[order.status]}`}>
                      {statusLabels[order.status]}
                    </Badge>
                  </div>
                  <p className="font-medium mt-0.5">{order.customer?.company_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.assigned_user?.name ?? '—'} ·{' '}
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">€{Number(order.total).toFixed(2)}</p>
                  {order.status === 'processing' && (
                    <Link href={`/delivery/${order.id}`} onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        className="mt-2 h-8 bg-red-600 hover:bg-red-700 text-xs gap-1"
                      >
                        <Truck className="h-3 w-3" />
                        Deliver
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
