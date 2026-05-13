'use client'

import { useEffect, useState } from 'react'
import { Package, Clock, Truck, CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Order, QuoteItem } from '@/types'

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending_approval: { label: 'Waiting for approval', icon: Clock,        color: 'bg-yellow-100 text-yellow-700' },
  processing:       { label: 'Order confirmed',      icon: CheckCircle2, color: 'bg-blue-100 text-blue-700' },
  out_for_delivery: { label: 'On its way! 🚚',       icon: Truck,        color: 'bg-orange-100 text-orange-700' },
  delivered:        { label: 'Delivered',             icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  invoice_ready:    { label: 'Delivered',             icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  invoice_blocked:  { label: 'Issue with order',      icon: XCircle,      color: 'bg-red-100 text-red-700' },
}

export default function PortalOrdersPage() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!profile?.customer_id) { setIsLoading(false); return }
    loadOrders()

    // Realtime updates
    const channel = supabase
      .channel('portal-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${profile.customer_id}` }, loadOrders)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.customer_id])

  async function loadOrders() {
    if (!profile?.customer_id) return
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', profile.customer_id)
      .order('created_at', { ascending: false })
    setOrders((data ?? []) as Order[])
    setIsLoading(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
        <Package className="h-12 w-12 opacity-20" />
        <p className="font-medium">No orders yet</p>
        <p className="text-sm">Place your first order using the button below</p>
      </div>
    )
  }

  const pending = orders.filter(o => o.status === 'pending_approval' || o.status === 'processing' || o.status === 'out_for_delivery')
  const past    = orders.filter(o => o.status === 'delivered' || o.status === 'invoice_ready' || o.status === 'invoice_blocked')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Orders</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{orders.length} total orders</p>
      </div>

      {pending.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active</p>
          {pending.map(order => <OrderCard key={order.id} order={order} />)}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Past Orders</p>
          {past.map(order => <OrderCard key={order.id} order={order} dimmed />)}
        </section>
      )}
    </div>
  )
}

function OrderCard({ order, dimmed }: { order: Order; dimmed?: boolean }) {
  const status = statusConfig[order.status] ?? { label: order.status, icon: Package, color: 'bg-gray-100 text-gray-700' }
  const Icon = status.icon
  const items = (order.items as QuoteItem[]).filter(i => i.qty > 0)

  return (
    <Link href={`/portal/orders/${order.id}`}>
    <Card className={`${dimmed ? 'opacity-70' : ''} hover:border-red-300 transition-colors cursor-pointer`}>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-sm font-medium flex items-center gap-1">{order.order_number || 'Order'} <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(order.created_at).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <Badge className={`${status.color} flex items-center gap-1 text-xs`}>
            <Icon className="h-3 w-3" />
            {status.label}
          </Badge>
        </div>

        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.qty}× {item.name}</span>
              <span className="font-medium">XCG {item.line_total.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-1 border-t">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-bold text-red-600">XCG {Number(order.total).toFixed(2)}</span>
        </div>

        {order.planned_date && (order.status === 'processing' || order.status === 'out_for_delivery') && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Truck className="h-3.5 w-3.5" />
            Planned delivery: {new Date(order.planned_date + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        )}
      </CardContent>
    </Card>
    </Link>
  )
}
