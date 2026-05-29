'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, FileText, ShoppingBag, Truck, Users, CreditCard, Copy, Check, X, Mail } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

interface OverdueOrder extends Order {
  daysOverdue: number
  dueDate: Date
}

export default function DashboardPage() {
  const supabase = createClient()
  const { isAdmin } = useAuth()
  const { data: users } = useUsers()
  const { data: allOrders } = useOrders()
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [overdueOrders, setOverdueOrders] = useState<OverdueOrder[]>([])
  const [templateOrder, setTemplateOrder] = useState<OverdueOrder | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<'first' | 'second' | 'final'>('first')
  const [copied, setCopied] = useState(false)

  async function loadPendingOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, customer:customers(company_name)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
    setPendingOrders((data ?? []) as Order[])
  }

  async function loadOverdueOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, customer:customers(company_name, contact_person, email, payment_term_days)')
      .in('status', ['invoice_ready', 'invoice_blocked'])
      .order('created_at', { ascending: true })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const overdue: OverdueOrder[] = ((data ?? []) as Order[])
      .filter((o) => (o as any).payment_type !== 'cash') // cash orders are paid on delivery
      .map((o) => {
        const termDays = (o.customer as any)?.payment_term_days ?? 7
        const due = new Date(o.created_at)
        due.setDate(due.getDate() + termDays)
        due.setHours(0, 0, 0, 0)
        const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
        return { ...o, dueDate: due, daysOverdue }
      })
      .filter((o) => o.daysOverdue > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue)

    setOverdueOrders(overdue)
  }

  async function loadStats() {
    await Promise.all([loadPendingOrders(), loadOverdueOrders()])
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

      {/* Overdue Payments */}
      {isAdmin && overdueOrders.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-red-200 dark:border-red-800">
            <CreditCard className="h-5 w-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-700 dark:text-red-400">
                {overdueOrders.length} overdue payment{overdueOrders.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-500">Send a reminder to collect outstanding balances</p>
            </div>
            <Badge className="bg-red-600 text-white text-sm px-2">{overdueOrders.length}</Badge>
          </div>
          <div className="divide-y divide-red-100 dark:divide-red-900">
            {overdueOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between px-4 py-3 gap-3"
              >
                <Link href={`/orders/${order.id}`} className="flex-1 min-w-0 hover:opacity-70 transition-opacity">
                  <p className="text-sm font-medium">{(order.customer as any)?.company_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{order.order_number}</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Due {order.dueDate.toLocaleDateString('en', { day: 'numeric', month: 'short' })} · {order.daysOverdue}d overdue
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">XCG {Number(order.total).toFixed(2)}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1"
                    onClick={() => { setTemplateOrder(order); setSelectedTemplate('first'); setCopied(false) }}
                  >
                    <Mail className="h-3 w-3" />
                    Remind
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email template modal */}
      {templateOrder && (
        <EmailTemplateModal
          order={templateOrder}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          copied={copied}
          setCopied={setCopied}
          onClose={() => setTemplateOrder(null)}
        />
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

type TemplateKey = 'first' | 'second' | 'final'

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  first: 'First Reminder',
  second: 'Second Reminder',
  final: 'Final Notice',
}

function buildTemplate(template: TemplateKey, order: OverdueOrder): { subject: string; body: string } {
  const customer = order.customer as any
  const contactName = customer?.contact_person || customer?.company_name || 'Sir/Madam'
  const company = customer?.company_name ?? ''
  const amount = `XCG ${Number(order.total).toFixed(2)}`
  const dueStr = order.dueDate.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
  const days = order.daysOverdue
  const orderNum = order.order_number

  if (template === 'first') {
    return {
      subject: `Payment Reminder – Order ${orderNum}`,
      body: `Dear ${contactName},

We hope this message finds you well.

This is a friendly reminder that payment for order ${orderNum} in the amount of ${amount} was due on ${dueStr}.

If you have already arranged payment, please disregard this message. Otherwise, we kindly ask that you process the outstanding balance at your earliest convenience.

Should you have any questions regarding your invoice, please do not hesitate to reach out.

Thank you for your continued business.

Best regards,
SPika Drinks`,
    }
  }

  if (template === 'second') {
    return {
      subject: `Second Payment Reminder – Order ${orderNum} (${days} Days Overdue)`,
      body: `Dear ${contactName},

We are following up on our earlier reminder regarding order ${orderNum} for ${company}.

The outstanding balance of ${amount} was due on ${dueStr} and is now ${days} days overdue. We kindly request that you arrange payment as soon as possible.

If you are experiencing any difficulties, please contact us so we can discuss a suitable payment arrangement.

Best regards,
SPika Drinks`,
    }
  }

  return {
    subject: `FINAL NOTICE – Overdue Payment – Order ${orderNum}`,
    body: `Dear ${contactName},

Despite our previous reminders, payment for order ${orderNum} (${company}) in the amount of ${amount}, which was due on ${dueStr}, remains outstanding for ${days} days.

This is our final notice. If payment is not received within 7 days of this message, we may be required to suspend services and/or refer this matter to a collection agency.

Please contact us immediately to resolve this matter.

SPika Drinks`,
  }
}

function EmailTemplateModal({
  order,
  selectedTemplate,
  setSelectedTemplate,
  copied,
  setCopied,
  onClose,
}: {
  order: OverdueOrder
  selectedTemplate: TemplateKey
  setSelectedTemplate: (t: TemplateKey) => void
  copied: boolean
  setCopied: (v: boolean) => void
  onClose: () => void
}) {
  const { subject, body } = buildTemplate(selectedTemplate, order)
  const customer = order.customer as any

  function handleCopy() {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <p className="font-semibold">Payment Reminder</p>
            <p className="text-xs text-muted-foreground">
              {order.order_number} · {customer?.company_name} · {order.daysOverdue}d overdue
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Template selector */}
        <div className="flex gap-2 px-5 pt-4 shrink-0">
          {(['first', 'second', 'final'] as TemplateKey[]).map((t) => (
            <button
              key={t}
              onClick={() => { setSelectedTemplate(t); setCopied(false) }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                selectedTemplate === t
                  ? 'bg-red-600 text-white border-red-600'
                  : 'border-border text-muted-foreground hover:border-red-300 hover:text-foreground'
              }`}
            >
              {TEMPLATE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Email preview */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">To</p>
            <p className="text-sm">{customer?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Subject</p>
            <p className="text-sm font-medium">{subject}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Body</p>
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed bg-muted/50 rounded-lg p-3">{body}</pre>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t flex gap-2 shrink-0">
          {customer?.email && (
            <a
              href={`mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
              className="flex-1"
            >
              <Button variant="outline" className="w-full gap-2 text-sm">
                <Mail className="h-4 w-4" />
                Open in Mail
              </Button>
            </a>
          )}
          <Button className="flex-1 bg-red-600 hover:bg-red-700 gap-2 text-sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy Email'}
          </Button>
        </div>
      </div>
    </div>
  )
}
