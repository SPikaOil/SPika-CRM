'use client'

import { useEffect, useState } from 'react'
import { Package, Clock, Truck, CheckCircle2, XCircle, Loader2, ChevronRight, AlertCircle, ShoppingBag, FileText } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Order, QuoteItem } from '@/types'

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending_approval: { label: 'Awaiting confirmation', icon: Clock,        color: 'bg-yellow-100 text-yellow-700' },
  processing:       { label: 'Being prepared',        icon: CheckCircle2, color: 'bg-blue-100 text-blue-700' },
  out_for_delivery: { label: 'On its way',            icon: Truck,        color: 'bg-orange-100 text-orange-700' },
  delivered:        { label: 'Delivered',             icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  invoice_ready:    { label: 'Delivered',             icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  invoice_blocked:  { label: 'Issue with order',      icon: XCircle,      color: 'bg-red-100 text-red-700' },
}

const ACTIVE = ['pending_approval', 'processing', 'out_for_delivery']
const DELIVERED = ['delivered', 'invoice_ready']

export default function PortalDashboardPage() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [customer, setCustomer] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!profile?.customer_id) { setIsLoading(false); return }
    loadData()

    const channel = supabase
      .channel('portal-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${profile.customer_id}` }, loadData)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.customer_id])

  async function loadData() {
    if (!profile?.customer_id) return
    const [ordersRes, custRes] = await Promise.all([
      supabase.from('orders').select('*').eq('customer_id', profile.customer_id).order('created_at', { ascending: false }),
      supabase.from('customers').select('*').eq('id', profile.customer_id).single(),
    ])
    setOrders((ordersRes.data ?? []) as Order[])
    setCustomer(custRes.data)
    setIsLoading(false)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-red-600" />
    </div>
  )

  const activeOrders = orders.filter(o => ACTIVE.includes(o.status))
  const deliveredOrders = orders.filter(o => DELIVERED.includes(o.status))
  const onTheWay = orders.filter(o => o.status === 'out_for_delivery')

  // Unpaid invoices — delivered orders where payment not yet marked as paid
  const openInvoices = deliveredOrders.filter(o => o.status === 'invoice_ready')

  // Total open invoice amount
  const openInvoiceTotal = openInvoices.reduce((s, o) => s + Number(o.total), 0)

  const recentOrders = orders.slice(0, 3)

  const paymentTermDays = customer?.payment_term_days ?? 7

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{customer?.company_name ?? ''}</p>
      </div>

      {/* On the way alert */}
      {onTheWay.length > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-xl px-4 py-3">
          <Truck className="h-5 w-5 text-orange-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-orange-700 dark:text-orange-400 text-sm">
              {onTheWay.length === 1 ? 'A delivery is on its way!' : `${onTheWay.length} deliveries on their way!`}
            </p>
            <p className="text-xs text-orange-600/80 dark:text-orange-500 mt-0.5">Make sure someone is available to receive it.</p>
          </div>
          <Link href="/portal/orders">
            <ChevronRight className="h-4 w-4 text-orange-600" />
          </Link>
        </div>
      )}

      {/* Open invoices alert */}
      {openInvoices.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-700 dark:text-red-400 text-sm">
              {openInvoices.length} open invoice{openInvoices.length > 1 ? 's' : ''} — XCG {openInvoiceTotal.toFixed(2)}
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-500 mt-0.5">Payment due within {paymentTermDays} days of delivery.</p>
          </div>
          <Link href="/portal/invoices">
            <ChevronRight className="h-4 w-4 text-red-600" />
          </Link>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-red-600">{activeOrders.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Open orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">{orders.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{openInvoices.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Open invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/portal/new-order">
          <Button className="w-full h-12 bg-red-600 hover:bg-red-700 gap-2">
            <ShoppingBag className="h-4 w-4" />
            New Order
          </Button>
        </Link>
        <Link href="/portal/invoices">
          <Button variant="outline" className="w-full h-12 gap-2">
            <FileText className="h-4 w-4" />
            My Invoices
          </Button>
        </Link>
      </div>

      {/* Active orders */}
      {activeOrders.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Orders</p>
            <Link href="/portal/orders" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {activeOrders.map(order => <MiniOrderCard key={order.id} order={order} />)}
        </section>
      )}

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Orders</p>
            <Link href="/portal/orders" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentOrders.map(order => <MiniOrderCard key={order.id} order={order} />)}
        </section>
      )}

      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
          <Package className="h-12 w-12 opacity-20" />
          <div className="text-center">
            <p className="font-medium">No orders yet</p>
            <p className="text-sm mt-1">Place your first order to get started</p>
          </div>
          <Link href="/portal/new-order">
            <Button className="bg-red-600 hover:bg-red-700">Place First Order</Button>
          </Link>
        </div>
      )}
    </div>
  )
}

function MiniOrderCard({ order }: { order: Order }) {
  const status = statusConfig[order.status] ?? { label: order.status, icon: Package, color: 'bg-gray-100 text-gray-700' }
  const Icon = status.icon
  const items = (order.items as QuoteItem[]).filter(i => i.qty > 0)

  return (
    <Link href={`/portal/orders/${order.id}`}>
      <Card className="hover:border-red-300 transition-colors cursor-pointer">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm font-semibold">{order.order_number}</p>
                <Badge className={`${status.color} flex items-center gap-1 text-xs`}>
                  <Icon className="h-3 w-3" />
                  {status.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {items.map(i => `${i.qty}× ${i.name}`).join(', ')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-red-600 text-sm">XCG {Number(order.total).toFixed(2)}</p>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto mt-0.5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
