'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, FileText, ShoppingBag, Truck, Users } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/auth-context'
import { useUsers } from '@/hooks/use-users'
import { useOrders } from '@/hooks/use-orders'
import { Order } from '@/types'

interface Stats {
  // Delivery notes (quotes) by status
  notes_draft: number
  notes_sent: number
  notes_accepted: number
  // Deliveries
  orders_out_for_delivery: number
  deliveries_today: number
  deliveries_missing_pod: number
}

function StatCard({
  title,
  value,
  icon: Icon,
  variant = 'default',
  isLoading,
  href,
}: {
  title: string
  value: number
  icon: React.ElementType
  variant?: 'default' | 'warning' | 'danger' | 'success'
  isLoading?: boolean
  href?: string
}) {
  const colors = {
    default: 'text-foreground bg-muted',
    warning: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30',
    danger: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
    success: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30',
  }

  const inner = (
    <CardContent className="pt-5 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {isLoading ? (
            <Skeleton className="h-9 w-14 mt-1" />
          ) : (
            <p className={`text-4xl font-bold mt-1 ${colors[variant].split(' ')[0]}`}>
              {value}
            </p>
          )}
        </div>
        <div className={`p-2 rounded-lg ${colors[variant]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href}>
        <Card className="hover:bg-accent transition-colors cursor-pointer">{inner}</Card>
      </Link>
    )
  }
  return <Card>{inner}</Card>
}

export default function DashboardPage() {
  const supabase = createClient()
  const { isAdmin } = useAuth()
  const { data: users } = useUsers()
  const { data: allOrders } = useOrders()
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])

  async function loadPendingOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, customer:customers(company_name)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
    setPendingOrders((data ?? []) as Order[])
  }

  async function loadStats() {
    await loadPendingOrders()
    const [quotesRes, kpisRes] = await Promise.all([
      supabase
        .from('quotes')
        .select('status'),
      supabase
        .from('v_dashboard_kpis')
        .select('orders_out_for_delivery, deliveries_today, deliveries_missing_pod')
        .single(),
    ])

    const quotes = quotesRes.data ?? []
    const kpis = kpisRes.data

    setStats({
      notes_draft:    quotes.filter((q) => q.status === 'draft').length,
      notes_sent:     quotes.filter((q) => q.status === 'sent').length,
      notes_accepted: quotes.filter((q) => q.status === 'accepted').length,
      orders_out_for_delivery: kpis?.orders_out_for_delivery ?? 0,
      deliveries_today:        kpis?.deliveries_today ?? 0,
      deliveries_missing_pod:  kpis?.deliveries_missing_pod ?? 0,
    })
    setIsLoading(false)
  }

  useEffect(() => {
    loadStats()

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, loadStats)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Live overview — updates in real time</p>
      </div>

      {/* Customer order approval alert */}
      {isAdmin && pendingOrders.length > 0 && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-orange-200 dark:border-orange-800">
            <ShoppingBag className="h-5 w-5 text-orange-600 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-orange-700 dark:text-orange-400">
                {pendingOrders.length} customer order{pendingOrders.length > 1 ? 's' : ''} waiting for approval
              </p>
              <p className="text-xs text-orange-600/80 dark:text-orange-500">Review and assign to a worker</p>
            </div>
            <Badge className="bg-orange-600 text-white text-sm px-2">{pendingOrders.length}</Badge>
          </div>
          <div className="divide-y divide-orange-100 dark:divide-orange-900">
            {pendingOrders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-orange-100/50 dark:hover:bg-orange-900/20 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{(order as any).customer?.company_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{order.order_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-orange-700 dark:text-orange-400">XCG {Number(order.total).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Missing POD alert */}
      {!isLoading && stats && stats.deliveries_missing_pod > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">
              {stats.deliveries_missing_pod} {stats.deliveries_missing_pod === 1 ? 'delivery' : 'deliveries'} missing Proof of Delivery
            </p>
            <p className="text-sm text-red-600/80">Open the delivery to upload a signature or photo</p>
          </div>
        </div>
      )}

      {/* Delivery Notes */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Delivery Notes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            title="Draft"
            value={stats?.notes_draft ?? 0}
            icon={FileText}
            isLoading={isLoading}
            href="/quotations?status=draft"
          />
          <StatCard
            title="Sent to Customer"
            value={stats?.notes_sent ?? 0}
            icon={Clock}
            variant="warning"
            isLoading={isLoading}
            href="/quotations?status=sent"
          />
          <StatCard
            title="Accepted"
            value={stats?.notes_accepted ?? 0}
            icon={CheckCircle}
            variant="success"
            isLoading={isLoading}
            href="/quotations?status=accepted"
          />
        </div>
      </section>

      {/* Deliveries */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Deliveries</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            title="Out for Delivery"
            value={stats?.orders_out_for_delivery ?? 0}
            icon={Truck}
            variant="warning"
            isLoading={isLoading}
            href="/orders?status=out_for_delivery"
          />
          <StatCard
            title="Delivered Today"
            value={stats?.deliveries_today ?? 0}
            icon={CheckCircle}
            variant="success"
            isLoading={isLoading}
            href="/orders?status=delivered"
          />
          <StatCard
            title="Missing POD"
            value={stats?.deliveries_missing_pod ?? 0}
            icon={AlertCircle}
            variant={stats?.deliveries_missing_pod ? 'danger' : 'default'}
            isLoading={isLoading}
            href="/orders?status=delivered"
          />
        </div>
      </section>

      {/* Worker Overview — admin only */}
      {isAdmin && users && users.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Team Overview</h2>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Workers
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {users.map((user) => {
                const assigned = allOrders?.filter((o) => o.assigned_to === user.id) ?? []
                const pending   = assigned.filter((o) => o.status === 'processing' || o.status === 'out_for_delivery')
                const delivered = assigned.filter((o) => o.status === 'delivered' || o.status === 'invoice_ready')
                return (
                  <div key={user.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">{user.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <Link href={`/orders?assigned=${user.id}&status=active`} className="text-center hover:opacity-70 transition-opacity">
                        <p className="font-bold text-yellow-600">{pending.length}</p>
                        <p className="text-xs text-muted-foreground">Pending</p>
                      </Link>
                      <Link href={`/orders?assigned=${user.id}&status=delivered`} className="text-center hover:opacity-70 transition-opacity">
                        <p className="font-bold text-green-600">{delivered.length}</p>
                        <p className="text-xs text-muted-foreground">Done</p>
                      </Link>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
