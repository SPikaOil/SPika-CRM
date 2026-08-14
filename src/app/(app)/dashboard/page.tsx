'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, ShoppingBag, Truck, CreditCard, Copy, Check, X, Mail, ChevronDown, ChevronUp, ChevronRight, Package, Pencil, UserPlus, Building2, ArrowRight, Droplets, ClipboardList, CalendarDays, PhoneCall, Sprout, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/auth-context'
import { useUsers } from '@/hooks/use-users'
import { Order, Task, OrderCurrency } from '@/types'
import { DEFAULT_TEMPLATES, TEMPLATE_LABELS, fillTemplate, type ReminderTemplate, type TemplateKey } from '@/lib/reminder-templates'
import { computeOrderRhythm, assessQuiet } from '@/lib/order-rhythm'

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

interface QuietRow {
  customer_id: string
  company_name: string
  daysSinceLast: number
  reason: string
}

interface LeadRow {
  customer_id: string
  company_name: string
  contact_person: string | null
  daysSinceContact: number | null // null = never contacted
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
        <Card size="sm" className="py-0 hover:bg-accent transition-colors cursor-pointer">{inner}</Card>
      </Link>
    )
  }
  return <Card size="sm" className="py-0">{inner}</Card>
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
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <div className={`p-1 rounded-md ${c.iconBg}`}>
          <Icon className="h-3 w-3" />
        </div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="flex items-end gap-2 leading-none">
        {isLoading ? <Skeleton className="h-7 w-16" /> : (
          <>
            {/* nowrap: "XCG 7,148" broke across two lines at tablet widths once
                the two metrics sat side by side */}
            <p className={`text-lg sm:text-2xl font-bold whitespace-nowrap ${c.text}`}>{formatValue(value)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 truncate min-w-0">/ {formatValue(target)} · {pct}%</p>
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
    <Card size="sm" className="py-0 gap-0">
      <CardContent className="p-2.5 space-y-1.5">
        {/* The month picker lives in the page header — see the header row */}

        {/* Bottles + Sales side by side, on phones too — stacking them cost a
            full extra block of height for two numbers */}
        <div className="grid grid-cols-2 gap-2.5">
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

// Two different rules, deliberately:
//
//   toXcg   — what STAFF see. Every amount on this dashboard is in guilders so
//             a mixed-currency list can be read and added up at a glance. It is
//             converted with the rate frozen on the order's invoice date (051),
//             never with today's rate, so yesterday's figures never move.
//   ownCur  — what a CUSTOMER sees. They owe what their invoice says, in the
//             currency their invoice says it in. Never converted.
//
// Printing `XCG {order.total}` is wrong on both counts: it labels a euro amount
// as guilders without touching the number.
const toXcg = (o: any) => Number(o?.total ?? 0) * (Number(o?.fx_rate) || 1)
const fmtXcg = (n: number) => `XCG ${n.toFixed(2)}`
const ownCur = (o: any) => `${o?.currency ?? 'XCG'} ${Number(o?.total ?? 0).toFixed(2)}`

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
        className="w-full flex items-center gap-3 px-3 py-0.5 leading-tight hover:bg-red-100/40 dark:hover:bg-red-900/20 transition-colors"
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
            <div key={order.id} className="flex items-center justify-between px-3 py-0.5 gap-3 leading-tight">
              <Link href={`/orders/${order.id}`} className="flex-1 min-w-0 hover:opacity-70 transition-opacity">
                <p className="text-sm font-medium">{(order.customer as any)?.company_name}</p>
                <p className="text-xs text-muted-foreground font-mono">{order.order_number}</p>
                <p className="text-xs text-red-600 mt-0.5">
                  Due {order.dueDate.toLocaleDateString('en', { day: 'numeric', month: 'short' })} · {order.daysOverdue}d overdue
                </p>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <p className="text-sm font-bold text-red-700 dark:text-red-400">{fmtXcg(toXcg(order))}</p>
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
        className="w-full flex items-center gap-3 px-3 py-0.5 leading-tight hover:bg-green-100/40 dark:hover:bg-green-900/20 transition-colors"
      >
        <Droplets className="h-4 w-4 text-green-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-green-700 dark:text-green-400">
            {rows.length} bottle refill{rows.length > 1 ? 's' : ''} coming up
          </p>
          <p className="text-xs text-green-600/80 dark:text-green-500">
            {expanded ? 'Click to collapse' : (
              <>
                Click to view
                {/* Kept off mobile so the header stays one line (40px) */}
                <span className="hidden sm:inline"> · Added to agenda automatically</span>
              </>
            )}
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
                className="flex items-center justify-between px-3 py-0.5 gap-3 leading-tight hover:bg-green-100/40 dark:hover:bg-green-900/20 transition-colors"
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

// ── Consignment orders collapsible banner ──────────────────────────────────
// Same pattern as OverdueBanner/RefillBanner. Lists consignment orders that are
// still out (not yet settled). Clicking a row opens the order, where the admin
// marks it paid once the customer has sold + settled — then it drops off here.
function ConsignmentBanner({ orders }: { orders: Order[] }) {
  const [expanded, setExpanded] = useState(false)
  if (orders.length === 0) return null

  const totalValue = orders.reduce((s, o) => s + toXcg(o), 0)

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-0.5 leading-tight hover:bg-blue-100/40 dark:hover:bg-blue-900/20 transition-colors"
      >
        <Package className="h-4 w-4 text-blue-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-blue-700 dark:text-blue-400">
            {orders.length} consignment order{orders.length > 1 ? 's' : ''} out
          </p>
          <p className="text-xs text-blue-600/80 dark:text-blue-500">
            {expanded ? 'Click to collapse' : `${fmtXcg(totalValue)} awaiting settlement`}
          </p>
        </div>
        <Badge className="bg-blue-600 text-white text-sm px-2 shrink-0">{orders.length}</Badge>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-blue-500 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-blue-500 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="divide-y divide-blue-100 dark:divide-blue-900 border-t border-blue-200 dark:border-blue-800">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center justify-between px-3 py-0.5 gap-3 leading-tight hover:bg-blue-100/40 dark:hover:bg-blue-900/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{(order.customer as any)?.company_name ?? 'Unknown'}</p>
                <p className="text-xs text-muted-foreground font-mono">{order.order_number}</p>
                <p className="text-xs text-blue-600 mt-0.5 capitalize">
                  {order.status?.replace(/_/g, ' ')} · {new Date(order.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <p className="text-sm font-bold text-blue-700 dark:text-blue-400 shrink-0">{fmtXcg(toXcg(order))}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Quiet customers collapsible banner ─────────────────────────────────────
// Customers overdue to reorder relative to their own rhythm (or 6 weeks silent
// when they have too little history). This is the "call these people today"
// list — the reorder-driver the whole rhythm feature is for.
function QuietCustomersBanner({ rows }: { rows: QuietRow[] }) {
  const [expanded, setExpanded] = useState(false)
  if (rows.length === 0) return null

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-0.5 leading-tight hover:bg-violet-100/40 dark:hover:bg-violet-900/20 transition-colors"
      >
        <PhoneCall className="h-4 w-4 text-violet-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-violet-700 dark:text-violet-400">
            {rows.length} customer{rows.length > 1 ? 's' : ''} due to reorder
          </p>
          <p className="text-xs text-violet-600/80 dark:text-violet-500">
            {expanded ? 'Click to collapse' : 'Gone quiet — nudge them to order'}
          </p>
        </div>
        <Badge className="bg-violet-600 text-white text-sm px-2 shrink-0">{rows.length}</Badge>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-violet-500 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-violet-500 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="divide-y divide-violet-100 dark:divide-violet-900 border-t border-violet-200 dark:border-violet-800">
          {rows.map((row) => (
            <Link
              key={row.customer_id}
              href={`/customers/${row.customer_id}`}
              className="flex items-center justify-between px-3 py-0.5 gap-3 leading-tight hover:bg-violet-100/40 dark:hover:bg-violet-900/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{row.company_name}</p>
                <p className="text-xs text-muted-foreground">{row.reason}</p>
              </div>
              <span className="text-sm font-bold text-violet-700 dark:text-violet-400 shrink-0">{row.daysSinceLast}d</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Open leads collapsible banner ──────────────────────────────────────────
// Potential customers not yet converted. Nudges you to keep chasing prospects,
// with the neglected ones (never contacted / longest silence) at the top.
function LeadsBanner({ rows }: { rows: LeadRow[] }) {
  const [expanded, setExpanded] = useState(false)
  if (rows.length === 0) return null

  return (
    <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/20 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-0.5 leading-tight hover:bg-teal-100/40 dark:hover:bg-teal-900/20 transition-colors"
      >
        <Sprout className="h-4 w-4 text-teal-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-teal-700 dark:text-teal-400">
            {rows.length} open lead{rows.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-teal-600/80 dark:text-teal-500">
            {expanded ? 'Click to collapse' : 'Potential customers — follow up'}
          </p>
        </div>
        <Badge className="bg-teal-600 text-white text-sm px-2 shrink-0">{rows.length}</Badge>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-teal-500 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-teal-500 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="divide-y divide-teal-100 dark:divide-teal-900 border-t border-teal-200 dark:border-teal-800">
          {rows.map((row) => (
            <Link
              key={row.customer_id}
              href={`/customers/${row.customer_id}`}
              className="flex items-center justify-between px-3 py-0.5 gap-3 leading-tight hover:bg-teal-100/40 dark:hover:bg-teal-900/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{row.company_name}</p>
                {row.contact_person && <p className="text-xs text-muted-foreground">{row.contact_person}</p>}
              </div>
              <span className={`text-xs font-medium shrink-0 ${row.daysSinceContact == null ? 'text-amber-600' : 'text-teal-700 dark:text-teal-400'}`}>
                {row.daysSinceContact == null
                  ? 'no contact yet'
                  : row.daysSinceContact === 0 ? 'contacted today' : `${row.daysSinceContact}d ago`}
              </span>
            </Link>
          ))}
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
  const [consignmentOrders, setConsignmentOrders] = useState<Order[]>([])
  const [quietCustomers, setQuietCustomers] = useState<QuietRow[]>([])
  const [openLeads, setOpenLeads] = useState<LeadRow[]>([])

  async function loadPendingOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, customer:customers(company_name)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
    setPendingOrders((data ?? []) as Order[])
  }

  async function loadOverdueOrders() {
    // Payment terms run from the INVOICE date, which by house rule is the
    // delivery date — sales_date carries it. This used to count from
    // created_at, so the dashboard chased orders days before the date printed
    // on the invoice, and the reminder mails quoted that wrong due date.
    const { data } = await supabase
      .from('orders_with_sales_date')
      .select('*, customer:customers(company_name, contact_person, email, payment_term_days)')
      .in('status', ['invoice_ready', 'invoice_blocked'])
      .order('created_at', { ascending: true })

    // The view is frozen at migration 048's column list and has no currency or
    // fx_rate, so those come from the orders table and are merged back on. Only
    // the non-guilder orders are fetched — the rest are rate 1 by definition.
    const { data: fxRows } = await supabase
      .from('orders')
      .select('id, currency, fx_rate')
      .neq('currency', 'XCG')
    const fxById = new Map<string, { currency: OrderCurrency; fx_rate: number }>(
      (fxRows ?? []).map(r => [r.id as string, { currency: r.currency as OrderCurrency, fx_rate: Number(r.fx_rate) || 1 }])
    )

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const overdue: OverdueOrder[] = ((data ?? []) as Order[])
      .filter((o) => (o as any).payment_type !== 'cash')
      // Consignment orders aren't chased for payment — the customer only pays
      // once they've sold the goods, settled manually by admin. They still count
      // as revenue elsewhere; here they're just kept out of the overdue chase.
      .filter((o) => !(o as any).is_consignment)
      .map((o) => {
        const termDays = (o.customer as any)?.payment_term_days ?? 7
        // sales_date is a plain YYYY-MM-DD; midday keeps the day stable across
        // timezones. Falls back to created_at only if the view ever yields null.
        const salesDate = (o as any).sales_date as string | null
        const due = salesDate ? new Date(salesDate + 'T12:00:00') : new Date(o.created_at)
        due.setDate(due.getDate() + termDays)
        due.setHours(0, 0, 0, 0)
        const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
        const fx = fxById.get(o.id)
        return { ...o, currency: fx?.currency ?? 'XCG', fx_rate: fx?.fx_rate ?? 1, dueDate: due, daysOverdue }
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
      .select('id, items, assigned_to, total')
      .in('status', ['delivered', 'invoice_ready', 'invoice_blocked', 'paid'])
      .gte('sales_date', start)
      .lt('sales_date', end)

    // A consignment invoice settles a period of a consignment note that was
    // already counted in full. Counting it here as well books the same bottles
    // twice — once as stock placed, once as stock sold.
    //
    // Read from the orders TABLE, not the view: orders_with_sales_date was
    // created with `o.*` in migration 048 and is frozen at that column list, so
    // order_type (added in 052) is not in it. Filtering on it there returns 400
    // and silently zeroes this figure — the same trap as fx_rate below.
    const { data: settlementRows } = await supabase
      .from('orders')
      .select('id')
      .eq('order_type', 'consignment_invoice')
    const settlementIds = new Set((settlementRows ?? []).map(r => r.id as string))

    // Exchange rates come from the orders TABLE, not the view: the view was
    // frozen with `o.*` in migration 048 and therefore has no fx_rate column.
    // Only non-XCG orders are fetched — everything else is rate 1 by definition,
    // so this is an empty round trip until the first foreign-currency order.
    const { data: fxRows } = await supabase
      .from('orders')
      .select('id, fx_rate')
      .neq('currency', 'XCG')
    const fxById = new Map<string, number>((fxRows ?? []).map(r => [r.id as string, Number(r.fx_rate) || 1]))

    const COUNTED_SKUS = ['oil-100ml', 'oil-50ml']
    let total = 0
    let revenue = 0
    const byWorker: Record<string, number> = {}

    for (const order of data ?? []) {
      if (settlementIds.has(order.id as string)) continue
      const items: { sku: string; qty: number }[] = order.items ?? []
      const count = items
        .filter(item => COUNTED_SKUS.includes(item.sku))
        .reduce((sum, item) => sum + (item.qty ?? 0), 0)
      total += count
      // Converted with the rate frozen on the order's invoice date (051), so a
      // month of mixed-currency orders adds up to one honest XCG figure and
      // never moves again when the euro does. XCG orders have rate 1.
      revenue += Number((order as any).total ?? 0) * (fxById.get((order as any).id) ?? 1)
      if (order.assigned_to) {
        byWorker[order.assigned_to] = (byWorker[order.assigned_to] ?? 0) + count
      }
    }

    setByWorker(byWorker)
    return { bottles: total, revenue }
  }

  // Consignment orders that are still out (delivered/awaiting settlement).
  // They're deliberately kept out of the overdue chase, so this banner is the
  // one place they surface — the admin settles them (marks paid) once the
  // customer has sold the goods. Drops off automatically at status 'paid'.
  async function loadConsignmentOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, customer:customers(company_name)')
      .eq('is_consignment', true)
      .in('status', ['processing', 'out_for_delivery', 'delivered', 'invoice_ready', 'invoice_blocked'])
      .order('created_at', { ascending: true })
    setConsignmentOrders((data ?? []) as Order[])
  }

  // Customers who have gone quiet relative to their own buying rhythm — the
  // "call these people" list. Uses the shared order-rhythm logic so it matches
  // the per-customer card exactly. Purely derived, no schema.
  async function loadQuietCustomers() {
    const { data } = await supabase
      .from('orders')
      .select('customer_id, created_at, invoice_date, status, order_type, customer:customers(company_name, status), delivery:deliveries(delivered_at)')
      // A credit note is not a purchase. Counting one as a buying moment would
      // make a customer who returned goods look like a customer who ordered.
      .neq('order_type', 'credit_note')

    const byCustomer = new Map<string, { name: string; active: boolean; orders: any[] }>()
    for (const o of (data ?? []) as any[]) {
      if (!o.customer_id) continue
      const cust = Array.isArray(o.customer) ? o.customer[0] : o.customer
      if (!byCustomer.has(o.customer_id)) {
        byCustomer.set(o.customer_id, {
          name: cust?.company_name ?? 'Unknown',
          active: cust?.status !== 'inactive',
          orders: [],
        })
      }
      byCustomer.get(o.customer_id)!.orders.push(o)
    }

    const rows: QuietRow[] = []
    for (const [customer_id, c] of byCustomer) {
      if (!c.active) continue
      const rhythm = computeOrderRhythm(c.orders)
      const q = assessQuiet(rhythm)
      if (q.quiet && q.daysSinceLast != null) {
        rows.push({ customer_id, company_name: c.name, daysSinceLast: q.daysSinceLast, reason: q.reason })
      }
    }
    rows.sort((a, b) => b.daysSinceLast - a.daysSinceLast)
    setQuietCustomers(rows)
  }

  // Open leads (potential customers not yet converted). Sorted so the ones
  // needing attention float up: never-contacted first, then longest since last
  // contact. The nudge to actually chase prospects.
  async function loadOpenLeads() {
    const { data } = await supabase
      .from('customers')
      .select('id, company_name, contact_person, contact_log')
      .eq('is_lead', true)
      .order('company_name')

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const rows: LeadRow[] = ((data ?? []) as any[]).map((c) => {
      const log = (c.contact_log ?? []) as { contacted_at?: string }[]
      const last = log.length
        ? [...log].sort((a, b) => (b.contacted_at ?? '').localeCompare(a.contacted_at ?? ''))[0]?.contacted_at
        : null
      const daysSinceContact = last
        ? Math.max(0, Math.floor((today.getTime() - new Date(last + 'T00:00:00').getTime()) / 86400000))
        : null
      return { customer_id: c.id, company_name: c.company_name, contact_person: c.contact_person ?? null, daysSinceContact }
    })
    // never-contacted first, then oldest contact first
    rows.sort((a, b) => {
      if (a.daysSinceContact == null && b.daysSinceContact == null) return 0
      if (a.daysSinceContact == null) return -1
      if (b.daysSinceContact == null) return 1
      return b.daysSinceContact - a.daysSinceContact
    })
    setOpenLeads(rows)
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
    await Promise.all([loadPendingOrders(), loadOverdueOrders(), loadAccessRequests(), loadClientOverview(), loadRefillData(), loadWeekTasks(), loadConsignmentOrders(), loadQuietCustomers(), loadOpenLeads()])
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
    <div className="p-3 lg:p-4 space-y-2">
      {/* Title and month picker share one row — the picker used to sit on a
          line of its own inside the metrics card, costing a full row of height */}
      <div className="flex items-center justify-between gap-3">
        {isAdmin ? (
          <h1 className="text-xl font-bold leading-none">Dashboard</h1>
        ) : (
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight truncate">SPika Sales — {profile?.name ?? ''}</h1>
            <p className="text-muted-foreground text-xs">Ready for some sales today?</p>
          </div>
        )}
        {isAdmin && (
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="h-7 text-xs rounded-md border border-input bg-background px-1.5 text-muted-foreground shrink-0"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
              return {
                value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
                label: d.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
              }
            }).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
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
                  <p className="text-sm font-bold text-orange-700 dark:text-orange-400">{fmtXcg(toXcg(order))}</p>
                  <span className="text-xs font-medium text-orange-600 whitespace-nowrap">Review →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pending access requests — same header shape as the collapsible banners
          below it (title + hint line, text-sm badge, chevron) so the whole
          alert stack lines up at one height. */}
      {isAdmin && pendingAccessRequests > 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 overflow-hidden">
          <Link
            href="/portal-management"
            className="w-full flex items-center gap-3 px-3 py-0.5 leading-tight hover:bg-blue-100/40 dark:hover:bg-blue-900/20 transition-colors"
          >
            <UserPlus className="h-4 w-4 text-blue-600 shrink-0" />
            <div className="flex-1 text-left">
              <p className="font-semibold text-blue-700 dark:text-blue-400">
                {pendingAccessRequests} reseller request{pendingAccessRequests > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-blue-600/80 dark:text-blue-500">
                Awaiting approval
                {/* Kept off mobile so the header stays one line (40px) */}
                <span className="hidden sm:inline"> · Click to review</span>
              </p>
            </div>
            <Badge className="bg-blue-600 text-white text-sm px-2 shrink-0">{pendingAccessRequests}</Badge>
            <ChevronRight className="h-4 w-4 text-blue-500 shrink-0" />
          </Link>
        </div>
      )}

      {/* Missing POD alert */}
      {!isLoading && stats && stats.deliveries_missing_pod > 0 && (
        <div className="flex items-center gap-2 px-3 py-0.5 leading-tight rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
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

      {/* Consignment orders out — awaiting settlement */}
      {isAdmin && <ConsignmentBanner orders={consignmentOrders} />}

      {/* Customers who have gone quiet — call them to reorder */}
      {isAdmin && <QuietCustomersBanner rows={quietCustomers} />}

      {/* Open leads — potential customers to follow up */}
      {isAdmin && <LeadsBanner rows={openLeads} />}

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
            <Card size="sm" className="py-0">
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
              <Card size="sm" className="py-0"><CardContent className="p-3 space-y-2">
                {[0,1].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </CardContent></Card>
            )}

            {!isLoading && myDeliveries.length === 0 && (
              <Card size="sm" className="py-0"><CardContent>
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
                      <Card size="sm" className="py-0"><CardContent className="p-0 divide-y">
                        {list.map(o => <DeliveryRow key={o.id} o={o} />)}
                      </CardContent></Card>
                    </div>
                  )
                })}

                {deliveryGroups.undated.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">No date yet</p>
                    <Card size="sm" className="py-0"><CardContent className="p-0 divide-y">
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
        <Card size="sm" className="py-0">
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
                  className="flex items-center gap-2.5 px-3 py-0.5 leading-tight hover:bg-muted/50 transition-colors"
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
          <Card size="sm" className="py-0">
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
                    className="flex items-center gap-3 px-3 py-0.5 leading-tight hover:bg-muted/50 transition-colors"
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
    // Goes to the CUSTOMER: they owe what their invoice says, in the currency
    // their invoice says it in. Converting to guilders here would demand an
    // amount that appears nowhere on their paperwork.
    amount: ownCur(order),
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

        {/* The customer's "preferred contact" was stored and shown but never
            acted on. It now decides which button leads: WhatsApp customers get
            WhatsApp first, the rest get mail. */}
        {(() => {
          const prefersWhatsapp = (customer as any)?.preferred_communication === 'whatsapp'
          const waNumber = ((customer as any)?.whatsapp || (customer as any)?.phone || '').replace(/\D/g, '')
          const waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(`${subject}\n\n${body}`)}`
          const mailHref = `mailto:${customer?.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

          const whatsappBtn = waNumber ? (
            <a key="wa" href={waHref} target="_blank" rel="noopener noreferrer" className="flex-1">
              <Button variant={prefersWhatsapp ? 'default' : 'outline'}
                className={`w-full gap-2 text-sm ${prefersWhatsapp ? 'bg-green-600 hover:bg-green-700' : ''}`}>
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            </a>
          ) : null

          const mailBtn = customer?.email ? (
            <a key="mail" href={mailHref} className="flex-1">
              <Button variant={prefersWhatsapp ? 'outline' : 'default'}
                className={`w-full gap-2 text-sm ${prefersWhatsapp ? '' : 'bg-red-600 hover:bg-red-700'}`}>
                <Mail className="h-4 w-4" />
                Email
              </Button>
            </a>
          ) : null

          return (
            <div className="px-5 py-3 border-t space-y-2 shrink-0">
              {customer && (
                <p className="text-[11px] text-muted-foreground">
                  Prefers <span className="font-medium text-foreground">{(customer as any).preferred_communication ?? 'email'}</span>
                </p>
              )}
              <div className="flex gap-2">
                {prefersWhatsapp ? <>{whatsappBtn}{mailBtn}</> : <>{mailBtn}{whatsappBtn}</>}
                <Button variant="outline" className="gap-2 text-sm shrink-0" onClick={handleCopy} title="Copy the message">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
