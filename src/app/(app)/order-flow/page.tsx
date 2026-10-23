'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, TrendingUp, TrendingDown, CalendarClock } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useCustomerFlows, type CustomerFlow } from '@/hooks/use-order-flow'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

/**
 * Order Flow — every customer that orders, worst first: how far past their own
 * rhythm they are, what one order is worth, and whether that is rising.
 *
 * This is the THIRD go at the layout and the lesson is in the first two. I
 * built a wall of grey text, then I built the opposite — coloured tiles, group
 * headings, a bar in every row, rows twice the height of every other list in
 * the app. Her verdict, 2026-10-22: "nog erger... waarom hou je je niet aan de
 * max vakjes grootte die we allang hadden afgesproken?"
 *
 * So this screen is a list like every other list here: the same row, the same
 * `px-3 py-0.5 leading-tight` density she set on 2026-07-25, two lines on a
 * phone and the same height for all of them. A screen is clear because it looks
 * like the screen next to it, not because it has more colour than that one.
 *
 * Nothing is stored. Every number comes out of `lib/order-flow.ts`, the same
 * file the tab on a customer uses, so the two can never disagree.
 */

type Bucket = 'overdue' | 'due_soon' | 'on_track' | 'no_rhythm'
type Filter = Bucket | 'all'

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  on_track: 'On track',
  no_rhythm: 'Too little history',
}

const BUCKET_PILL: Record<Bucket, string> = {
  overdue:   'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  due_soon:  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  on_track:  'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  no_rhythm: 'bg-muted text-muted-foreground',
}

const BUCKET_TONE: Record<Bucket, string> = {
  overdue:   'text-red-600',
  due_soon:  'text-amber-600',
  on_track:  'text-green-600',
  no_rhythm: 'text-muted-foreground',
}

const FILTERS: Filter[] = ['all', 'overdue', 'due_soon', 'on_track', 'no_rhythm']

const fmtDay = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '—'

const money = (n: number) => `XCG ${Math.round(n).toLocaleString('en')}`

function bucketOf(f: CustomerFlow): Bucket {
  const { rhythm } = f.flow
  if (rhythm.medianInterval == null) return 'no_rhythm'
  if (rhythm.flag === 'overdue') return 'overdue'
  if (rhythm.flag === 'due_soon') return 'due_soon'
  return 'on_track'
}

/**
 * The one number the row is about. The word follows the GROUP, not the sign:
 * a few days past a median is "over", not "late", or the row contradicts its
 * own badge.
 */
function headline(f: CustomerFlow): { value: string; sub: string } {
  const { rhythm } = f.flow
  const due = f.flow.daysUntilExpected
  if (rhythm.medianInterval == null || due == null) {
    return { value: `${rhythm.daysSinceLast ?? 0}d`, sub: 'quiet' }
  }
  if (due < 0) return { value: `${Math.abs(due)}d`, sub: bucketOf(f) === 'overdue' ? 'late' : 'over' }
  if (due === 0) return { value: 'now', sub: 'due' }
  return { value: `${due}d`, sub: 'to go' }
}

export default function OrderFlowPage() {
  const { can, isAdmin, isLoading: authLoading } = useAuth()
  const allowed = isAdmin || can('orderflow.view')
  const { data, isLoading } = useCustomerFlows()

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const { rows, counts } = useMemo(() => {
    const live = (data ?? []).filter(f => f.flow.rhythm.orderMoments > 0)
    const c: Record<Filter, number> = { all: live.length, overdue: 0, due_soon: 0, on_track: 0, no_rhythm: 0 }
    for (const f of live) c[bucketOf(f)]++

    const needle = q.trim().toLowerCase()
    const searched = needle ? live.filter(f => f.companyName.toLowerCase().includes(needle)) : live
    const picked = filter === 'all' ? searched : searched.filter(f => bucketOf(f) === filter)

    /**
     * Overdue first, then due soon, then on track — and INSIDE each of those,
     * the most days late at the top.
     *
     * It used to sort on how far past their own rhythm they were, which is a
     * defensible number and an invisible one: the screen shows days, so a list
     * reading 42, 92, 46, 6 looked shuffled. Her remark of 2026-10-22: "waarom
     * is er dan geen volgorde van dagen te laat". The column you can see is the
     * column it sorts on.
     *
     * Customers with no rhythm sit at the bottom on plain days since their last
     * order, because days late means nothing without a gap to be late against.
     */
    const ORDER: Record<Bucket, number> = { overdue: 0, due_soon: 1, on_track: 2, no_rhythm: 3 }
    const sorted = [...picked].sort((a, b) => {
      const ba = ORDER[bucketOf(a)]
      const bb = ORDER[bucketOf(b)]
      if (ba !== bb) return ba - bb
      const da = a.flow.daysUntilExpected
      const db = b.flow.daysUntilExpected
      if (da != null && db != null) return da - db
      return (b.flow.rhythm.daysSinceLast ?? 0) - (a.flow.rhythm.daysSinceLast ?? 0)
    })
    return { rows: sorted, counts: c }
  }, [data, q, filter])

  if (authLoading) return null
  if (!allowed) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20">
        <p className="font-medium">Access restricted</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto w-full space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Order Flow</h1>
        <p className="text-sm text-muted-foreground">
          {counts.all} customers who order · {counts.overdue} overdue
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by customer name..."
          className="pl-9"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === k ? 'bg-red-600 text-white border-red-600' : 'bg-card hover:bg-accent'
            }`}
          >
            {k === 'all' ? 'All' : BUCKET_LABEL[k]}{' '}
            <span className="opacity-70">{counts[k]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <CalendarClock className="h-10 w-10 opacity-20" />
          <p className="font-medium">Nothing here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(f => <Row key={f.customerId} f={f} />)}
        </div>
      )}
    </div>
  )
}

function Row({ f }: { f: CustomerFlow }) {
  const { rhythm } = f.flow
  const b = bucketOf(f)
  const h = headline(f)

  const meta = [
    rhythm.medianInterval != null ? `every ~${Math.round(rhythm.medianInterval)}d` : 'no rhythm yet',
    `${rhythm.orderMoments} order${rhythm.orderMoments === 1 ? '' : 's'}`,
    `last ${fmtDay(rhythm.lastOrderDate)}`,
    f.flow.nextExpected ? `due ${fmtDay(f.flow.nextExpected)}` : null,
  ].filter(Boolean).join(' · ')

  const perOrder = f.flow.averageAmount != null ? money(f.flow.averageAmount) : '—'
  const TrendIcon = f.flow.trend === 'up' ? TrendingUp : TrendingDown
  const trendColour = f.flow.trend === 'up' ? 'text-green-600' : 'text-red-600'

  return (
    <Link
      href={`/customers/${f.customerId}?tab=flow`}
      className="block px-3 py-0.5 leading-tight rounded-xl border bg-card hover:bg-accent transition-colors"
    >
      {/* Phone: two lines, every row the same height. Nothing wraps — the name
          and the meta line shorten instead. */}
      <div className="sm:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-medium text-sm truncate flex-1 min-w-0">{f.companyName}</p>
          <p className={`text-sm font-bold shrink-0 ${BUCKET_TONE[b]}`}>{h.value} {h.sub}</p>
        </div>
        <div className="flex items-center gap-2 min-w-0 min-h-7">
          <Badge className={`text-xs shrink-0 ${BUCKET_PILL[b]}`}>{BUCKET_LABEL[b]}</Badge>
          <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">{meta}</p>
          <p className="text-xs font-medium shrink-0">{perOrder}</p>
        </div>
      </div>

      {/* Desktop: the same row every other list in this app uses. */}
      <div className="hidden sm:flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{f.companyName}</p>
            <Badge className={`text-xs ${BUCKET_PILL[b]}`}>{BUCKET_LABEL[b]}</Badge>
            {f.flow.trend && f.flow.trend !== 'flat' && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${trendColour}`}>
                <TrendIcon className="h-3 w-3" />
                {f.flow.trendPct != null ? `${f.flow.trendPct > 0 ? '+' : ''}${f.flow.trendPct}%` : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{meta}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-sm font-semibold">{perOrder}</p>
            <p className="text-[10px] text-muted-foreground -mt-0.5">per order</p>
          </div>
          <div className="text-right w-16">
            <p className={`text-sm font-bold ${BUCKET_TONE[b]}`}>{h.value}</p>
            <p className="text-[10px] text-muted-foreground -mt-0.5">{h.sub}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}
