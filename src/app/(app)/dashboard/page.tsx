'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, ShoppingBag, Truck, CreditCard, Copy, Check, X, Mail, ChevronDown, ChevronUp, Package, Pencil, UserPlus, Building2, ArrowRight, Droplets, ClipboardList, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/auth-context'
import { useUsers } from '@/hooks/use-users'
import { Order, Task } from '@/types'
import { DEFAULT_TEMPLATES, TEMPLATE_LABELS, fillTemplate, type ReminderTemplate, type TemplateKey } from '@/lib/reminder-templates'

interface Stats {
  orders_out_for_delivery: number
  deliveries_today: number
  deliveries_missing_pod: number
  bottles_this_month: number
  revenue_this_month: number
}

const OPEN_STATUSES = ['pending_approval', 'approved', 'out_for_delivery', 'invoice_ready', 'invoice_blocked']

interface ClientRow {
  customer_id: string
  company_name: string
  last_order_at: string
  open_count: number
}

interface RefillRow {
  customer_id: string
  company_name: string
  next_refill: Date
  daysUntil: number // negative = overdue
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
    <CardContent className="p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-xs text-muted-foreground leading-tight">{title}</p>
        <div className={`p-1.5 rounded-md ${colors[variant]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-7 w-10 mt-1" />
      ) : (
        <p className={`text-2xl font-bold ${colors[variant].split(' ')[0]}`}>
          {value}
        </p>
      )}
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href}>
        <Card className="py-0 hover:bg-accent transition-colors cursor-pointer">{inner}</Card>
      </Link>
    )
  }
  return <Card className="py-0">{inner}</Card>
}

// One delivery in the sales agenda — links to the delivery screen
function DeliveryRow({ o }: { o: any }) {
  return (
    <Link href={`/delivery-notes/${o.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{o.customer?.company_name ?? 'Unknown'}</p>
        <p className="text-xs text-muted-foreground font-mono">{o.order_number}</p>
      </div>
      {o.status === 'out_for_delivery'
        ? <Badge className="bg-blue-600 text-white text-xs px-1.5 shrink-0">On the way</Badge>
        : <Truck className="h-4 w-4 text-muted-foreground shrink-0" />}
    </Link>
  )
}

interface OverdueOrder extends Order {
  daysOverdue: number
  dueDate: Date
}

// ── Bottles + Sales card with settable monthly targets ─────────────────────
interface WorkerBottles { name: string; count: number }

// One compact metric with an inline editable monthly target + progress bar.
// The target lives in the database so every device sees the same value; a
// month without its own target inherits the most recent one.
// Explicit class strings — Tailwind can't see dynamically built class names
const METRIC_COLORS = {
  blue: {
    iconBg: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-600 dark:text-blue-400',
    bar: 'bg-blue-500',
    link: 'text-blue-600',
  },
  green: {
    iconBg: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30',
    text: 'text-green-600 dark:text-green-400',
    bar: 'bg-green-500',
    link: 'text-green-600',
  },
} as const

function MetricProgress({
  icon: Icon, label, value, formatValue, color,
  table, targetColumn, defaultTarget, selectedMonth, isLoading,
}: {
  icon: React.ElementType
  label: string
  value: number
  formatValue: (n: number) => string
  color: keyof typeof METRIC_COLORS
  table: string
  targetColumn: string
  defaultTarget: number
  selectedMonth: string
  isLoading: boolean
}) {
  const c = METRIC_COLORS[color]
  const [target, setTarget] = useState<number>(defaultTarget)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(defaultTarget))

  useEffect(() => {
    let cancelled = false
    createClient()
      .from(table)
      .select(`month, ${targetColumn}`)
      .lte('month', selectedMonth)
      .order('month', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setTarget((data?.[0] as any)?.[targetColumn] ?? defaultTarget)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth])

  async function saveTarget() {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n > 0) {
      setTarget(n)
      const { error } = await createClient()
        .from(table)
        .upsert({ month: selectedMonth, [targetColumn]: n })
      if (error) console.error('Failed to save target:', error.message)
    }
    setEditing(false)
  }

  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-md ${c.iconBg}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="flex items-end gap-2">
        {isLoading ? <Skeleton className="h-7 w-16" /> : (
          <>
            <p className={`text-2xl font-bold ${c.text}`}>{formatValue(value)}</p>
            <p className="text-xs text-muted-foreground mb-0.5">/ {formatValue(target)} · {pct}%</p>
            {editing ? (
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <Input autoFocus type="number" value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveTarget(); if (e.key === 'Escape') setEditing(false) }}
                  className="h-6 w-16 text-xs text-right px-2" />
                <button onClick={saveTarget} className={`text-xs ${c.link} font-medium hover:underline`}>Save</button>
              </div>
            ) : (
              <button onClick={() => { setDraft(String(target)); setEditing(true) }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto shrink-0">
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>
      {!isLoading && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${c.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

function BottlesCard({
  bottles,
  revenue,
  workerBottles,
  isLoading,
  selectedMonth,
  onMonthChange,
}: {
  bottles: number
  revenue: number
  workerBottles: WorkerBottles[]
  isLoading: boolean
  selectedMonth: string
  onMonthChange: (m: string) => void
}) {
  // Build last 12 months as options
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en', { month: 'long', year: 'numeric' })
    return { value, label }
  })

  const fmtMoney = (n: number) => `XCG ${Math.round(n).toLocaleString('en')}`

  return (
    <Card className="py-0">
      <CardContent className="p-3 space-y-2">
        {/* Month picker */}
        <div className="flex justify-end">
          <select
            value={selectedMonth}
            onChange={e => onMonthChange(e.target.value)}
            className="h-6 text-xs rounded-md border border-input bg-background px-1.5 text-muted-foreground"
          >
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Bottles + Sales side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MetricProgress
            icon={Package} label="Bottles Sold" value={bottles} formatValue={n => String(n)}
            color="blue" table="monthly_targets" targetColumn="bottle_target" defaultTarget={500}
            selectedMonth={selectedMonth} isLoading={isLoading}
          />
          <MetricProgress
            icon={CreditCard} label="Sales" value={revenue} formatValue={fmtMoney}
            color="green" table="monthly_revenue_targets" targetColumn="revenue_target" defaultTarget={10000}
            selectedMonth={selectedMonth} isLoading={isLoading}
          />
        </div>

        {/* Per-worker breakdown */}
        {!isLoading && workerBottles.length > 0 && (
          <div className="pt-1 space-y-1.5 border-t">
            {workerBottles.map(w => {
              const workerPct = bottles > 0 ? Math.round((w.count / bottles) * 100) : 0
              return (
                <div key={w.name} className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground w-24 truncate shrink-0">{w.name}</p>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-blue-400/70 transition-all duration-500" style={{ width: `${workerPct}%` }} />
                  </div>
                  <p className="text-xs font-medium w-8 text-right shrink-0">{w.count}</p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Overdue payments collapsible banner ────────────────────────────────────
function OverdueBanner({
  orders,
  onRemind,
}: {
  orders: OverdueOrder[]
  onRemind: (order: OverdueOrder) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (orders.length === 0) return null

  return (
    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-100/40 dark:hover:bg-red-900/20 transition-colors"
      >
        <CreditCard className="h-4 w-4 text-red-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-red-700 dark:text-red-400">
            {orders.length} overdue payment{orders.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-red-600/80 dark:text-red-500">
            {expanded ? 'Click to collapse' : 'Click to view'}
          </p>
        </div>
        <Badge className="bg-red-600 text-white text-sm px-2 shrink-0">{orders.length}</Badge>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-red-500 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-red-500 shrink-0" />
        }
      </button>

      {/* Expandable list */}
      {expanded && (
        <div className="divide-y divide-red-100 dark:divide-red-900 border-t border-red-200 dark:border-red-800">
          {orders.map((order) => (
            <div key={order.id} className="flex items-center justify-between px-3 py-2 gap-3">
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
                  onClick={() => onRemind(order)}
                >
                  <Mail className="h-3 w-3" />
                  Remind
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Refill banner ─────────────────────────────────────────────────────────
function RefillBanner({ rows }: { rows: RefillRow[] }) {
  const [expanded, setExpanded] = useState(false)
  if (rows.length === 0) return null

  return (
    <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-green-100/40 dark:hover:bg-green-900/20 transition-colors"
      >
        <Droplets className="h-4 w-4 text-green-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-green-700 dark:text-green-400">
            {rows.length} bottle refill{rows.length > 1 ? 's' : ''} coming up
          </p>
          <p className="text-xs text-green-600/80 dark:text-green-500">
            {expanded ? 'Click to collapse' : 'Click to view · Added to agenda automatically'}
          </p>
        </div>
        <Badge className="bg-green-600 text-white text-sm px-2 shrink-0">{rows.length}</Badge>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-green-500 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-green-500 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="divide-y divide-green-100 dark:divide-green-900 border-t border-green-200 dark:border-green-800">
          {rows.map(row => {
            const label = row.daysUntil < 0
              ? `${Math.abs(row.daysUntil)}d overdue`
              : row.daysUntil === 0
              ? 'Today'
              : row.daysUntil === 1
              ? 'Tomorrow'
              : `In ${row.daysUntil} days`
            const isOverdue = row.daysUntil < 0

            return (
              <Link
                key={row.customer_id}
                href={`/customers/${row.customer_id}`}
                className="flex items-center justify-between px-3 py-2 gap-3 hover:bg-green-100/40 dark:hover:bg-green-900/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{row.company_name}</p>
                  <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-600' : 'text-green-600/80 dark:text-green-500'}`}>
                    {label} · {row.next_refill.toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 border-green-300 text-green-700 dark:text-green-400">
                  Refill
                </Badge>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function DashboardPage() {
  const supabase = createClient()
  const { isAdmin, profile } = useAuth()
  const { data: users } = useUsers()
  const [myDeliveries, setMyDeliveries] = useState<any[]>([])
  const [myHandover, setMyHandover] = useState<{ sku: string; name: string; qty: number }[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [overdueOrders, setOverdueOrders] = useState<OverdueOrder[]>([])
  const [templateOrder, setTemplateOrder] = useState<OverdueOrder | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<'first' | 'second' | 'final'>('first')
  const [copied, setCopied] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr)
  const [workerBottles, setWorkerBottles] = useState<WorkerBottles[]>([])
  const [byWorker, setByWorker] = useState<Record<string, number>>({})
  const [pendingAccessRequests, setPendingAccessRequests] = useState(0)
  const [toProcess, setToProcess] = useState<any[]>([])
  const [refillRows, setRefillRows] = useState<RefillRow[]>([])
  const [weekTasks, setWeekTasks] = useState<Task[]>([])

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
      .filter((o) => (o as any).payment_type !== 'cash')
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

  async function loadBottlesForMonth(monthStr: string): Promise<{ bottles: number; revenue: number }> {
    // sales_date = invoice_date, else delivery date, else creation date —
    // the invoice date decides which month a sale belongs to. Plain date
    // strings keep the month boundary timezone-proof.
    const [year, month] = monthStr.split('-').map(Number)
    const start = `${monthStr}-01`
    const end = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    const { data } = await supabase
      .from('orders_with_sales_date')
      .select('items, assigned_to, total')
      .in('status', ['delivered', 'invoice_ready', 'invoice_blocked', 'paid'])
      .gte('sales_date', start)
      .lt('sales_date', end)

    const COUNTED_SKUS = ['oil-100ml', 'oil-50ml']
    let total = 0
    let revenue = 0
    const byWorker: Record<string, number> = {}

    for (const order of data ?? []) {
      const items: { sku: string; qty: number }[] = order.items ?? []
      const count = items
        .filter(item => COUNTED_SKUS.includes(item.sku))
        .reduce((sum, item) => sum + (item.qty ?? 0), 0)
      total += count
      revenue += Number((order as any).total ?? 0)
      if (order.assigned_to) {
        byWorker[order.assigned_to] = (byWorker[order.assigned_to] ?? 0) + count
      }
    }

    setByWorker(byWorker)
    return { bottles: total, revenue }
  }

  async function loadAccessRequests() {
    const { count } = await supabase
      .from('access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingAccessRequests(count ?? 0)
  }

  // Orders that still need work: created and assigned, but not yet delivered.
  // Deliberately excludes pending_approval (own banner) and the invoice/payment
  // stages (covered by the overdue-payments banner) so nothing is shown twice.
  async function loadClientOverview() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, status, planned_date, total, customer:customers(company_name)')
      .in('status', ['processing', 'out_for_delivery'])
      .order('planned_date', { ascending: true, nullsFirst: false })
      .limit(20)

    setToProcess((data ?? []) as any[])
  }

  async function loadRefillData() {
    // Fetch customers that have a refill interval set
    const { data: customers } = await supabase
      .from('customers')
      .select('id, company_name, table_bottle_interval_weeks')
      .eq('status', 'active')
      .not('table_bottle_interval_weeks', 'is', null)

    if (!customers || customers.length === 0) return

    const ids = customers.map(c => c.id)

    // Get current user for task created_by
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get last delivered/paid order per customer
    const { data: orders } = await supabase
      .from('orders')
      .select('customer_id, created_at')
      .in('customer_id', ids)
      .in('status', ['delivered', 'invoice_ready', 'invoice_blocked', 'paid'])
      .order('created_at', { ascending: false })

    // Get existing future refill tasks to avoid duplicates
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('customer_id, due_date')
      .in('customer_id', ids)
      .ilike('title', 'Bottle refill%')
      .is('completed_at', null)
      .gte('due_date', new Date().toISOString().split('T')[0])

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const WARN_DAYS = 14

    const upcoming: RefillRow[] = []

    for (const c of customers) {
      const lastOrder = (orders ?? []).find(o => o.customer_id === c.id)
      if (!lastOrder) continue

      const intervalDays = (c.table_bottle_interval_weeks as number) * 7
      const next = new Date(lastOrder.created_at)
      next.setDate(next.getDate() + intervalDays)
      next.setHours(0, 0, 0, 0)

      const daysUntil = Math.floor((next.getTime() - today.getTime()) / 86400000)

      // Only surface if within warning window or overdue
      if (daysUntil > WARN_DAYS) continue

      upcoming.push({
        customer_id: c.id,
        company_name: c.company_name,
        next_refill: next,
        daysUntil,
      })

      // Auto-create agenda task if no future one exists for this customer
      const hasTask = (existingTasks ?? []).some(t => t.customer_id === c.id)
      if (!hasTask) {
        const dueDate = daysUntil < 0 ? today.toISOString().split('T')[0] : next.toISOString().split('T')[0]
        supabase.from('tasks').insert({
          customer_id: c.id,
          title: `Bottle refill — ${c.company_name}`,
          description: `Expected refill based on ${c.table_bottle_interval_weeks}-week interval.`,
          frequency: 'once',
          due_date: dueDate,
          created_by: user.id,
        }).then(() => {})
      }
    }

    setRefillRows(upcoming.sort((a, b) => a.daysUntil - b.daysUntil))
  }

  async function loadWeekTasks() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endOfWeek = new Date(today)
    endOfWeek.setDate(today.getDate() + 7)

    const { data } = await supabase
      .from('tasks')
      .select('*, customer:customers(id, company_name)')
      .is('completed_at', null)
      .gte('due_date', today.toISOString().split('T')[0])
      .lte('due_date', endOfWeek.toISOString().split('T')[0])
      .order('due_date', { ascending: true, nullsFirst: false })

    // Deduplicate: one task per customer+title combination
    const seen = new Set<string>()
    const deduped = ((data ?? []) as Task[]).filter(t => {
      const key = `${t.customer_id ?? 'none'}-${t.title}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    setWeekTasks(deduped)
  }

  // Sales dashboard: my own deliveries to do + bottles I've picked up
  async function loadSalesData() {
    if (!profile?.id) return
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status, planned_date, customer:customers(company_name)')
      .eq('assigned_to', profile.id)
      .in('status', ['processing', 'out_for_delivery'])
      .order('planned_date', { ascending: true, nullsFirst: false })
    setMyDeliveries(orders ?? [])

    const { data: batches } = await supabase
      .from('handover_batches')
      .select('items, signed_at')
      .eq('member_id', profile.id)
      .not('signed_at', 'is', null)
    const totals: Record<string, { sku: string; name: string; qty: number }> = {}
    for (const b of (batches ?? []) as any[]) {
      for (const it of (b.items ?? [])) {
        if (!totals[it.sku]) totals[it.sku] = { sku: it.sku, name: it.name, qty: 0 }
        totals[it.sku].qty += it.qty
      }
    }
    setMyHandover(Object.values(totals))
    setIsLoading(false)
  }

  async function loadStats() {
    await Promise.all([loadPendingOrders(), loadOverdueOrders(), loadAccessRequests(), loadClientOverview(), loadRefillData(), loadWeekTasks()])
    const [kpisRes, monthData] = await Promise.all([
      supabase
        .from('v_dashboard_kpis')
        .select('orders_out_for_delivery, deliveries_today, deliveries_missing_pod')
        .single(),
      loadBottlesForMonth(selectedMonth),
    ])

    const kpis = kpisRes.data

    setStats({
      orders_out_for_delivery: kpis?.orders_out_for_delivery ?? 0,
      deliveries_today:        kpis?.deliveries_today ?? 0,
      deliveries_missing_pod:  kpis?.deliveries_missing_pod ?? 0,
      bottles_this_month:      monthData.bottles,
      revenue_this_month:      monthData.revenue,
    })
    setIsLoading(false)
  }

  useEffect(() => {
    if (!profile) return // wait for auth to resolve so we load the right view
    if (isAdmin) loadStats()
    else loadSalesData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, profile?.id])

  useEffect(() => {
    if (!isAdmin) return
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, loadStats)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  // Reload bottles + revenue when month changes
  useEffect(() => {
    if (!isAdmin) return
    loadBottlesForMonth(selectedMonth).then(d => {
      setStats(prev => prev ? { ...prev, bottles_this_month: d.bottles, revenue_this_month: d.revenue } : prev)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth])

  // Map worker IDs → names whenever byWorker or users changes (decoupled to avoid race condition)
  useEffect(() => {
    const workerList: WorkerBottles[] = Object.entries(byWorker)
      .map(([uid, count]) => ({
        name: users?.find(u => u.id === uid)?.name ?? 'Unknown',
        count,
      }))
      .sort((a, b) => b.count - a.count)
    setWorkerBottles(workerList)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byWorker, users])

  // Group the sales member's open deliveries by planned day (agenda overview)
  const deliveryGroups = (() => {
    const groups: Record<string, any[]> = {}
    for (const o of myDeliveries) {
      const key = o.planned_date || 'none'
      ;(groups[key] ??= []).push(o)
    }
    const dated = Object.keys(groups).filter(k => k !== 'none').sort()
    return { dated: dated.map(d => [d, groups[d]] as const), undated: groups['none'] ?? [] }
  })()

  return (
    <div className="p-3 lg:p-6 space-y-3">
      <div>
        {isAdmin ? (
          <>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground text-xs">Live overview — updates in real time</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">SPika Sales — {profile?.name ?? ''}</h1>
            <p className="text-muted-foreground text-sm">Ready for some sales today? See your tasks below</p>
          </>
        )}
      </div>

      {/* Portal order requests — awaiting approval */}
      {isAdmin && pendingOrders.length > 0 && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-orange-200 dark:border-orange-800">
            <ShoppingBag className="h-4 w-4 text-orange-600 shrink-0" />
            <p className="flex-1 text-sm font-semibold text-orange-700 dark:text-orange-400">
              {pendingOrders.length} new order request{pendingOrders.length > 1 ? 's' : ''} to approve
            </p>
            <Badge className="bg-orange-600 text-white text-xs px-1.5">{pendingOrders.length}</Badge>
          </div>
          <div className="divide-y divide-orange-100 dark:divide-orange-900">
            {pendingOrders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-orange-100/50 dark:hover:bg-orange-900/20 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{(order as any).customer?.company_name ?? 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    New order request · {new Date(order.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-bold text-orange-700 dark:text-orange-400">XCG {Number(order.total).toFixed(2)}</p>
                  <span className="text-xs font-medium text-orange-600 whitespace-nowrap">Review →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pending access requests */}
      {isAdmin && pendingAccessRequests > 0 && (
        <Link href="/portal-management">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100/60 dark:hover:bg-blue-900/20 transition-colors">
            <UserPlus className="h-4 w-4 text-blue-600 shrink-0" />
            <p className="flex-1 text-sm font-semibold text-blue-700 dark:text-blue-400">
              {pendingAccessRequests} reseller request{pendingAccessRequests > 1 ? 's' : ''} awaiting approval
            </p>
            <Badge className="bg-blue-600 text-white text-xs px-1.5">{pendingAccessRequests}</Badge>
          </div>
        </Link>
      )}

      {/* Missing POD alert */}
      {!isLoading && stats && stats.deliveries_missing_pod > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">
            {stats.deliveries_missing_pod} {stats.deliveries_missing_pod === 1 ? 'delivery' : 'deliveries'} missing POD
          </p>
        </div>
      )}

      {/* Overdue payments — collapsible */}
      {isAdmin && (
        <OverdueBanner
          orders={overdueOrders}
          onRemind={(order) => { setTemplateOrder(order); setSelectedTemplate('first'); setCopied(false) }}
        />
      )}

      {/* Upcoming bottle refills */}
      {isAdmin && <RefillBanner rows={refillRows} />}

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

      {/* Bottles this month — admin only */}
      {isAdmin && (
        <BottlesCard
          bottles={stats?.bottles_this_month ?? 0}
          revenue={stats?.revenue_this_month ?? 0}
          workerBottles={workerBottles}
          isLoading={isLoading}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
        />
      )}

      {/* ── Sales view: my deliveries this week + bottles I picked up ── */}
      {!isAdmin && (
        <>
          {/* Bottles I've picked up (handover) */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" /> Bottles you picked up
            </p>
            <Card className="py-0">
              <CardContent className="p-3">
                {myHandover.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No bottles handed over to you yet</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {myHandover.map(h => (
                      <span key={h.sku} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm">
                        <span className="font-bold text-red-700 dark:text-red-400">{h.qty}×</span>
                        <span>{h.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}</span>
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Week agenda — deliveries grouped by planned day */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Your agenda
            </p>

            {isLoading && (
              <Card className="py-0"><CardContent className="p-3 space-y-2">
                {[0,1].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </CardContent></Card>
            )}

            {!isLoading && myDeliveries.length === 0 && (
              <Card className="py-0"><CardContent>
                <p className="text-sm text-muted-foreground text-center py-6">No deliveries assigned to you</p>
              </CardContent></Card>
            )}

            {!isLoading && (
              <div className="space-y-3">
                {deliveryGroups.dated.map(([day, list]) => {
                  const d = new Date(day + 'T12:00:00')
                  const today = new Date(); today.setHours(0,0,0,0)
                  const isToday = d.toDateString() === today.toDateString()
                  const isPast = d < today
                  return (
                    <div key={day}>
                      <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1.5 ${isPast ? 'text-red-600' : isToday ? 'text-red-600' : 'text-foreground'}`}>
                        {d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' })}
                        {isToday && <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0">Today</Badge>}
                        {isPast && <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0">Overdue</Badge>}
                      </p>
                      <Card className="py-0"><CardContent className="p-0 divide-y">
                        {list.map(o => <DeliveryRow key={o.id} o={o} />)}
                      </CardContent></Card>
                    </div>
                  )
                })}

                {deliveryGroups.undated.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">No date yet</p>
                    <Card className="py-0"><CardContent className="p-0 divide-y">
                      {deliveryGroups.undated.map(o => <DeliveryRow key={o.id} o={o} />)}
                    </CardContent></Card>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* Client Overview — orders still to be processed (admin only) */}
      {isAdmin && (
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client Overview · to process</p>
          <Link href="/orders" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            All orders <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <Card className="py-0">
          <CardContent className="p-0 divide-y">
            {isLoading && [0,1,2].map(i => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
            ))}
            {!isLoading && toProcess.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-5">Nothing waiting — all orders are processed</p>
            )}
            {!isLoading && toProcess.map(o => {
              const planned = o.planned_date ? new Date(o.planned_date + 'T12:00:00') : null
              const today = new Date(); today.setHours(0, 0, 0, 0)
              const isLate = planned ? planned < today : false
              return (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{o.customer?.company_name ?? 'Unknown'}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {o.order_number || 'Order'}
                      {planned && ` · ${planned.toLocaleDateString('en', { day: 'numeric', month: 'short' })}`}
                      {!planned && ' · no date'}
                    </p>
                  </div>
                  {o.status === 'out_for_delivery'
                    ? <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0 shrink-0">On the way</Badge>
                    : isLate
                      ? <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0 shrink-0">Late</Badge>
                      : <Badge className="bg-orange-500 text-white text-[10px] px-1.5 py-0 shrink-0">To do</Badge>}
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </section>
      )}

      {/* This week's tasks */}
      {isAdmin && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This week's tasks</p>
            <Link href="/tasks" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              All tasks <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <Card className="py-0">
            <CardContent className="p-0 divide-y">
              {isLoading && [0,1,2].map(i => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                </div>
              ))}
              {!isLoading && weekTasks.length === 0 && (
                <div className="flex items-center gap-2 px-4 py-5 text-muted-foreground">
                  <ClipboardList className="h-4 w-4 opacity-40" />
                  <p className="text-sm">No tasks due this week</p>
                </div>
              )}
              {!isLoading && weekTasks.map(task => {
                const today = new Date(); today.setHours(0,0,0,0)
                const due = task.due_date ? new Date(task.due_date) : null
                const daysUntil = due ? Math.floor((due.getTime() - today.getTime()) / 86400000) : null
                const dueLabel = daysUntil === null ? 'No date'
                  : daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue`
                  : daysUntil === 0 ? 'Today'
                  : daysUntil === 1 ? 'Tomorrow'
                  : due!.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })
                const isOverdue = daysUntil !== null && daysUntil < 0

                return (
                  <Link
                    key={task.id}
                    href="/tasks"
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <ClipboardList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {(task.customer as any)?.company_name && (
                        <p className="text-xs text-muted-foreground truncate">{(task.customer as any).company_name}</p>
                      )}
                    </div>
                    <p className={`text-xs shrink-0 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {dueLabel}
                    </p>
                  </Link>
                )
              })}
            </CardContent>
          </Card>
        </section>
      )}

    </div>
  )
}

// ── Email template modal ───────────────────────────────────────────────────
// Texts live in src/lib/reminder-templates.ts (defaults) and can be
// overridden per template in Settings (email_templates table).

function buildTemplate(
  template: TemplateKey,
  order: OverdueOrder,
  overrides: Partial<Record<TemplateKey, ReminderTemplate>>
): ReminderTemplate {
  const customer = order.customer as any
  return fillTemplate(overrides[template] ?? DEFAULT_TEMPLATES[template], {
    contact: customer?.contact_person || customer?.company_name || 'Sir/Madam',
    company: customer?.company_name ?? '',
    order: order.order_number,
    amount: `XCG ${Number(order.total).toFixed(2)}`,
    due_date: order.dueDate.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }),
    days: String(order.daysOverdue),
  })
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
  // Custom texts set in Settings override the built-in defaults
  const [overrides, setOverrides] = useState<Partial<Record<TemplateKey, ReminderTemplate>>>({})
  useEffect(() => {
    createClient()
      .from('email_templates')
      .select('key, subject, body')
      .then(({ data }) => {
        if (data) {
          setOverrides(Object.fromEntries(
            data.map(t => [t.key as TemplateKey, { subject: t.subject, body: t.body }])
          ))
        }
      })
  }, [])

  const { subject, body } = buildTemplate(selectedTemplate, order, overrides)
  const customer = order.customer as any

  function handleCopy() {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col shadow-xl">
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
