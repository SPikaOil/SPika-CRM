'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Truck, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { useOrder } from '@/hooks/use-orders'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { OrderStatus, QuoteItem } from '@/types'

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

const TIMELINE: OrderStatus[] = [
  'processing',
  'out_for_delivery',
  'delivered',
  'invoice_ready',
]

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: order, isLoading } = useOrder(id)
  const router = useRouter()

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center py-20 gap-3">
        <p className="font-medium">Order not found</p>
        <Link href="/orders"><Button variant="outline">Back</Button></Link>
      </div>
    )
  }

  const currentStepIndex = TIMELINE.indexOf(order.status as any)
  const items = order.items as QuoteItem[]

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold font-mono">{order.order_number}</h1>
            <Badge className={`text-xs ${statusColors[order.status]}`}>
              {statusLabels[order.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{order.customer?.company_name}</p>
        </div>
      </div>

      {/* Status Timeline */}
      {order.status !== 'invoice_blocked' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Status Timeline</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {TIMELINE.map((step, i) => {
                const done = i <= currentStepIndex
                const current = i === currentStepIndex
                return (
                  <div key={step} className="flex items-center flex-1">
                    <div className={`flex flex-col items-center gap-1 flex-1 ${i > 0 ? '' : ''}`}>
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          done
                            ? 'bg-green-500 text-white'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {done ? <CheckCircle className="h-4 w-4" /> : i + 1}
                      </div>
                      <span className={`text-[10px] text-center leading-tight ${current ? 'font-semibold' : 'text-muted-foreground'}`}>
                        {statusLabels[step].split(' ')[0]}
                      </span>
                    </div>
                    {i < TIMELINE.length - 1 && (
                      <div className={`h-0.5 flex-1 ${i < currentStepIndex ? 'bg-green-500' : 'bg-muted'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {order.status === 'invoice_blocked' && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-red-700 dark:text-red-400">Invoice Blocked</p>
              <p className="text-sm text-red-600/80">This order has been flagged and cannot be invoiced.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Start Delivery CTA */}
      {order.status === 'processing' && (
        <Link href={`/delivery/${order.id}`}>
          <Button className="w-full h-14 text-lg bg-red-600 hover:bg-red-700 gap-2">
            <Truck className="h-6 w-6" />
            Start Delivery
          </Button>
        </Link>
      )}

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Order Items</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((item, i) => (
            <div key={i}>
              {i > 0 && <Separator className="my-2" />}
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.sku} · €{item.unit_price.toFixed(2)} × {item.qty}</p>
                </div>
                <p className="font-semibold text-sm shrink-0">€{item.line_total.toFixed(2)}</p>
              </div>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>€{Number(order.total).toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Assigned To" value={order.assigned_user?.name ?? '—'} />
          <Row label="Created" value={new Date(order.created_at).toLocaleString()} />
          {order.delivery_notes && <Row label="Notes" value={order.delivery_notes} />}
          {order.delivery?.delivered_at && (
            <Row label="Delivered At" value={new Date(order.delivery.delivered_at).toLocaleString()} />
          )}
          {order.delivery?.pod_type && (
            <Row label="POD Type" value={order.delivery.pod_type} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right capitalize">{value}</span>
    </div>
  )
}
