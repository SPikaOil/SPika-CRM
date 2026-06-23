'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, ShoppingBag, Truck, CreditCard, Copy, Check, X, Mail, ChevronDown, ChevronUp, Package, Pencil, UserPlus, Building2, ArrowRight, Droplets, ClipboardList } from 'lucide-react'
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

interface Stats {
  orders_out_for_delivery: number
  deliveries_today: number
  deliveries_missing_pod: number
  bottles_this_month: number
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

// ── Bottles card with settable monthly target ──────────────────────────────
const TARGET_KEY = 'dashboard_bottle_target'

interface WorkerBottles { name: string; count: number }

function BottlesCard({
  bottles,
  workerBottles,
  isLoading,
  selectedMonth,
  onMonthChange,
}: {
  bottles: number
  workerBottles: WorkerBottles[]
  isLoading: boolean
  selectedMonth: string
  onMonthChange: (m: string) => void
}) {
  const [target, setTarget] = useState<number>(() => {
    if (typeof window === 'undefined') return 500
    return parseInt(localStorage.getItem(TARGET_KEY) ?? '500', 10)
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(target))

  function saveTarget() {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n > 0) {
      setTarget(n)
      localStorage.setItem(TARGET_KEY, String(n))
    }
    setEditing(false)
  }

  const pct = target > 0 ? Math.min(100, Math.round((bottles / target) * 100)) : 0

  // Build last 12 months as options
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en', { month: 'long', year: 'numeric' })
    return { value, label }
  })

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
              <Package className="h-3.5 w-3.5" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Bottles Sold</p>
          </div>
          {/* Month picker */}
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

        {/* Total + progress */}
        <div className="flex items-end gap-2">
          {isLoading ? <Skeleton className="h-7 w-16" /> : (
            <>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{bottles}</p>
              <p className="text-xs text-muted-foreground mb-0.5">/ {target} · {pct}%</p>
              {editing ? (
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  <Input autoFocus type="number" value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTarget(); if (e.key === 'Escape') setEditing(false) }}
                    className="h-6 w-14 text-xs text-right px-2" />
                  <button onClick={saveTarget} className="text-xs text-blue-600 font-medium hover:underline">Save</button>
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
            <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        )}

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
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-100/40 dark:hover:bg-red-900/20 transition-colors"
      >
        <CreditCard className="h-5 w-5 text-red-600 shrink-0" />
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
            <div key={order.id} className="flex items-center justify-between px-4 py-3 gap-3">
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
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-100/40 dark:hover:bg-green-900/20 transition-colors"
      >
        <Droplets className="h-5 w-5 text-green-600 shrink-0" />
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
                className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-green-100/40 dark:hover:bg-green-900/20 transition-colors"
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
  const { isAdmin } = useAuth()
  const { data: users } = useUsers()
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
  const [clientRows, setClientRows] = useState<ClientRow[]>([])
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

  async function loadBottlesForMonth(monthStr: string): Promise<number> {
    const [year, month] = monthStr.split('-').map(Number)
    const start = new Date(year, month - 1, 1).toISOString()
    const end = new Date(year, month, 1).toISOString()

    const { data } = await supabase
      .from('orders')
      .select('items, assigned_to')
      .in('status', ['delivered', 'invoice_ready', 'invoice_blocked', 'paid'])
      .gte('created_at', start)
      .lt('created_at', end)

    const COUNTED_SKUS = ['oil-100ml', 'oil-50ml']
    let total = 0
    const byWorker: Record<string, number> = {}

    for (const order of data ?? []) {
      const items: { sku: string; qty: number }[] = order.items ?? []
      const count = items
        .filter(item => COUNTED_SKUS.includes(item.sku))
        .reduce((sum, item) => sum + (item.qty ?? 0), 0)
      total += count
      if (order.assigned_to) {
        byWorker[order.assigned_to] = (byWorker[order.assigned_to] ?? 0) + count
      }
    }

    setByWorker(byWorker)
    return total
  }

  async function loadAccessRequests() {
    const { count } = await supabase
      .from('access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingAccessRequests(count ?? 0)
  }

  async function loadClientOverview() {
    const { data } = await supabase
      .from('orders')
      .select('customer_id, created_at, status, customer:customers(company_name)')
      .order('created_at', { ascending: false })
      .limit(500)

    if (!data) return

    const map = new Map<string, ClientRow>()
    for (const o of data) {
      const cid = o.customer_id
      if (!cid) continue
      const name = (o.customer as any)?.company_name ?? 'Unknown'
      if (!map.has(cid)) {
        map.set(cid, { customer_id: cid, company_name: name, last_order_at: o.created_at, open_count: 0 })
      }
      if (OPEN_STATUSES.includes(o.status)) {
        map.get(cid)!.open_count++
      }
    }

    const rows = Array.from(map.values())
      .sort((a, b) => new Date(b.last_order_at).getTime() - new Date(a.last_order_at).getTime())
      .slice(0, 8)

    setClientRows(rows)
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

  async function loadStats() {
    await Promise.all([loadPendingOrders(), loadOverdueOrders(), loadAccessRequests(), loadClientOverview(), loadRefillData(), loadWeekTasks()])
    const [kpisRes, bottlesCount] = await Promise.all([
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
      bottles_this_month:      bottlesCount,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload bottles when month changes
  useEffect(() => {
    if (!isAdmin) return
    loadBottlesForMonth(selectedMonth).then(count => {
      setStats(prev => prev ? { ...prev, bottles_this_month: count } : prev)
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

  return (
    <div className="p-3 lg:p-6 space-y-3">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-xs">Live overview — updates in real time</p>
      </div>

      {/* Pending orders alert */}
      {isAdmin && pendingOrders.length > 0 && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-orange-200 dark:border-orange-800">
            <ShoppingBag className="h-4 w-4 text-orange-600 shrink-0" />
            <p className="flex-1 text-sm font-semibold text-orange-700 dark:text-orange-400">
              {pendingOrders.length} order{pendingOrders.length > 1 ? 's' : ''} waiting for approval
            </p>
            <Badge className="bg-orange-600 text-white text-xs px-1.5">{pendingOrders.length}</Badge>
          </div>
          <div className="divide-y divide-orange-100 dark:divide-orange-900">
            {pendingOrders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between px-3 py-2 hover:bg-orange-100/50 dark:hover:bg-orange-900/20 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{(order as any).customer?.company_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{order.order_number}</p>
                </div>
                <p className="text-sm font-bold text-orange-700 dark:text-orange-400">XCG {Number(order.total).toFixed(2)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pending access requests */}
      {isAdmin && pendingAccessRequests > 0 && (
        <Link href="/portal-management">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100/60 dark:hover:bg-blue-900/20 transition-colors">
            <UserPlus className="h-5 w-5 text-blue-600 shrink-0" />
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
          workerBottles={workerBottles}
          isLoading={isLoading}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
        />
      )}

      {/* Client Overview */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client Overview</p>
          <Link href="/customers" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            All clients <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <Card>
          <CardContent className="p-0 divide-y">
            {isLoading && [0,1,2,3].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
            ))}
            {!isLoading && clientRows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No orders yet</p>
            )}
            {!isLoading && clientRows.map(row => {
              const lastOrder = new Date(row.last_order_at)
              const today = new Date()
              const daysDiff = Math.floor((today.getTime() - lastOrder.getTime()) / 86400000)
              const lastLabel = daysDiff === 0 ? 'Today' : daysDiff === 1 ? 'Yesterday' : `${daysDiff}d ago`

              return (
                <Link
                  key={row.customer_id}
                  href={`/customers/${row.customer_id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors group"
                >
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium flex-1 truncate">{row.company_name}</p>
                  {row.open_count > 0 && (
                    <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0 shrink-0">
                      {row.open_count} open
                    </Badge>
                  )}
                  <p className="text-xs text-muted-foreground shrink-0">{lastLabel}</p>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </section>

      {/* This week's tasks */}
      {isAdmin && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This week's tasks</p>
            <Link href="/tasks" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              All tasks <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <Card>
            <CardContent className="p-0 divide-y">
              {isLoading && [0,1,2].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
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
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
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
SPika Team`,
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
SPika Team`,
    }
  }

  return {
    subject: `FINAL NOTICE – Overdue Payment – Order ${orderNum}`,
    body: `Dear ${contactName},

Despite our previous reminders, payment for order ${orderNum} (${company}) in the amount of ${amount}, which was due on ${dueStr}, remains outstanding for ${days} days.

This is our final notice. If payment is not received within 7 days of this message, we may be required to suspend services and/or refer this matter to a collection agency.

Please contact us immediately to resolve this matter.

SPika Team`,
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
