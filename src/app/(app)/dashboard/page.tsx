'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, FileText, Loader2, ShoppingCart, Target, Truck, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface KPIs {
  leads_new: number
  leads_contacted: number
  leads_quoted: number
  leads_won: number
  leads_lost: number
  quotes_sent_this_week: number
  orders_processing: number
  orders_out_for_delivery: number
  deliveries_today: number
  deliveries_missing_pod: number
  orders_invoice_ready: number
  orders_invoice_blocked: number
}

function KpiCard({
  title,
  value,
  icon: Icon,
  variant = 'default',
  isLoading,
}: {
  title: string
  value: number
  icon: React.ElementType
  variant?: 'default' | 'warning' | 'danger' | 'success'
  isLoading?: boolean
}) {
  const variantClasses = {
    default: 'text-foreground',
    warning: 'text-yellow-600 dark:text-yellow-400',
    danger: 'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-12 mt-1" />
            ) : (
              <p className={`text-3xl font-bold mt-1 ${variantClasses[variant]}`}>
                {value}
              </p>
            )}
          </div>
          <div className={`p-2 rounded-lg bg-muted ${variantClasses[variant]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const supabase = createClient()
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function loadKpis() {
    const { data, error } = await supabase
      .from('v_dashboard_kpis')
      .select('*')
      .single()
    if (!error && data) setKpis(data)
    setIsLoading(false)
  }

  useEffect(() => {
    loadKpis()

    // Realtime subscription to key tables
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadKpis)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, loadKpis)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, loadKpis)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Live overview — updates in real time</p>
      </div>

      {/* Priority alerts */}
      {!isLoading && kpis && kpis.deliveries_missing_pod > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">
              {kpis.deliveries_missing_pod} deliveries missing POD
            </p>
            <p className="text-sm text-red-600/80">Check delivered orders without proof of delivery</p>
          </div>
        </div>
      )}

      {/* Leads Pipeline */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Lead Pipeline</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'New', key: 'leads_new', color: 'bg-blue-100 text-blue-700' },
            { label: 'Contacted', key: 'leads_contacted', color: 'bg-yellow-100 text-yellow-700' },
            { label: 'Quoted', key: 'leads_quoted', color: 'bg-purple-100 text-purple-700' },
            { label: 'Won', key: 'leads_won', color: 'bg-green-100 text-green-700' },
            { label: 'Lost', key: 'leads_lost', color: 'bg-red-100 text-red-700' },
          ].map(({ label, key, color }) => (
            <div key={key} className="flex flex-col items-center p-4 rounded-xl border bg-card gap-1">
              <Badge className={`${color} text-xs`}>{label}</Badge>
              {isLoading ? (
                <Skeleton className="h-8 w-10 mt-1" />
              ) : (
                <p className="text-3xl font-bold">{(kpis as any)?.[key] ?? 0}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Operations KPIs */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Operations</h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            title="Quotes This Week"
            value={kpis?.quotes_sent_this_week ?? 0}
            icon={FileText}
            isLoading={isLoading}
          />
          <KpiCard
            title="Processing"
            value={kpis?.orders_processing ?? 0}
            icon={Clock}
            variant="warning"
            isLoading={isLoading}
          />
          <KpiCard
            title="Out for Delivery"
            value={kpis?.orders_out_for_delivery ?? 0}
            icon={Truck}
            isLoading={isLoading}
          />
          <KpiCard
            title="Delivered Today"
            value={kpis?.deliveries_today ?? 0}
            icon={CheckCircle}
            variant="success"
            isLoading={isLoading}
          />
        </div>
      </section>

      {/* Invoicing KPIs */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Invoicing</h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            title="Invoice Ready"
            value={kpis?.orders_invoice_ready ?? 0}
            icon={ShoppingCart}
            variant="success"
            isLoading={isLoading}
          />
          <KpiCard
            title="Invoice Blocked"
            value={kpis?.orders_invoice_blocked ?? 0}
            icon={AlertCircle}
            variant="danger"
            isLoading={isLoading}
          />
          <KpiCard
            title="Missing POD"
            value={kpis?.deliveries_missing_pod ?? 0}
            icon={AlertCircle}
            variant={kpis?.deliveries_missing_pod ? 'danger' : 'default'}
            isLoading={isLoading}
          />
        </div>
      </section>
    </div>
  )
}
