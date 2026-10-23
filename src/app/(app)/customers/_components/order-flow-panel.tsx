'use client'

import { TrendingUp, TrendingDown, Minus, CalendarClock, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { OrderFlow, ProductTrend } from '@/lib/order-flow'

/**
 * Order flow for one customer: when they buy, for how much, and what.
 *
 * The rhythm card above this answers "how often". This answers the rest, and
 * every number comes out of `lib/order-flow.ts` — the same file the Order Flow
 * list across all customers uses, so the two can never disagree.
 *
 * It keeps saying what it does not know. Under four buying moments there is no
 * honest trend, and the panel says so instead of drawing a line through two
 * dots.
 */

const fmtDay = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtShort = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })

const fmtMoney = (n: number) =>
  `XCG ${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TREND_STYLE: Record<ProductTrend, { pill: string; label: string }> = {
  up:      { pill: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300', label: 'More' },
  down:    { pill: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', label: 'Less' },
  flat:    { pill: 'bg-muted text-muted-foreground',                                    label: 'Steady' },
  stopped: { pill: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',         label: 'Stopped' },
  new:     { pill: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',     label: 'New' },
}

export function OrderFlowPanel({ flow }: { flow: OrderFlow }) {
  const { rhythm } = flow

  if (rhythm.orderMoments === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <CalendarClock className="h-10 w-10 opacity-20" />
        <p className="font-medium">No orders yet</p>
        <p className="text-sm">There is nothing to measure until this customer has ordered</p>
      </div>
    )
  }

  const due = flow.daysUntilExpected
  const dueColour =
    due == null ? 'text-muted-foreground'
      : due < 0 ? 'text-red-600'
      : due <= 3 ? 'text-amber-600'
      : 'text-green-600'

  const maxAmount = Math.max(1, ...flow.moments.map(m => m.amount))

  const TrendIcon = flow.trend === 'up' ? TrendingUp : flow.trend === 'down' ? TrendingDown : Minus
  const trendColour =
    flow.trend === 'up' ? 'text-green-600' : flow.trend === 'down' ? 'text-red-600' : 'text-muted-foreground'

  return (
    <div className="space-y-2.5">
      {/* ── The three numbers worth knowing ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Card size="sm" className="py-0">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Next order expected</p>
            {flow.nextExpected ? (
              <>
                <p className={`text-lg font-bold leading-tight ${dueColour}`}>{fmtDay(flow.nextExpected)}</p>
                <p className="text-xs text-muted-foreground">
                  {due == null ? '' : due < 0 ? `${Math.abs(due)}d overdue` : due === 0 ? 'today' : `in ${due}d`}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">no rhythm yet</p>
            )}
          </CardContent>
        </Card>

        <Card size="sm" className="py-0">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Average per order</p>
            <p className="text-lg font-bold leading-tight">
              {flow.averageAmount != null ? fmtMoney(flow.averageAmount) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {flow.lastVsAverage != null
                ? `last order ${flow.lastVsAverage > 0 ? '+' : ''}${flow.lastVsAverage}% on that`
                : ''}
            </p>
          </CardContent>
        </Card>

        <Card size="sm" className="py-0">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Everything so far</p>
            <p className="text-lg font-bold leading-tight">{fmtMoney(flow.lifetimeValue)}</p>
            <p className={`text-xs flex items-center gap-1 ${trendColour}`}>
              {flow.trend ? (
                <>
                  <TrendIcon className="h-3 w-3" />
                  {flow.trendPct != null ? `${flow.trendPct > 0 ? '+' : ''}${flow.trendPct}% ` : ''}
                  last 3 against the 3 before
                </>
              ) : (
                <span className="text-muted-foreground">too few orders for a trend</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── What every order was worth ── */}
      <Card size="sm" className="py-0">
        <CardHeader className="pt-3 pb-2">
          <CardTitle className="text-sm">Every order, and what it was worth</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {/* Bars rather than a line: these are separate purchases, not a
              continuous measurement, and a line between two dots months apart
              suggests something happened in between. */}
          <div className="flex items-end gap-1 h-28 overflow-x-auto">
            {flow.moments.map(m => (
              <div key={m.date} className="flex flex-col items-center gap-1 min-w-[34px] flex-1">
                <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                  {Math.round(m.amount)}
                </span>
                <div
                  className="w-full bg-red-500/80 rounded-t"
                  style={{ height: `${Math.max(3, (m.amount / maxAmount) * 76)}px` }}
                  title={`${fmtDay(m.date)} — ${fmtMoney(m.amount)}`}
                />
                <span className="text-[9px] text-muted-foreground whitespace-nowrap">{fmtShort(m.date)}</span>
              </div>
            ))}
          </div>
          {flow.averageAmount != null && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Average {fmtMoney(flow.averageAmount)} over {flow.moments.length} order
              {flow.moments.length === 1 ? '' : 's'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── What they actually buy ── */}
      <Card size="sm" className="py-0">
        <CardHeader className="pt-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" /> What they buy
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-1">
          {flow.products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No product lines on these orders.</p>
          ) : (
            flow.products.map(p => (
              <div key={p.sku} className="flex items-center gap-2 py-1 border-b last:border-b-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {fmtShort(p.firstDate)} — {fmtShort(p.lastDate)}
                  </p>
                </div>
                <p className="text-sm font-semibold shrink-0 w-16 text-right">{p.units}×</p>
                <Badge className={`text-[10px] shrink-0 ${TREND_STYLE[p.trend].pill}`}>
                  {TREND_STYLE[p.trend].label}
                </Badge>
              </div>
            ))
          )}
          {flow.moments.length < 4 && flow.products.length > 0 && (
            <p className="text-[11px] text-muted-foreground pt-1">
              Fewer than four orders, so every product reads Steady — there is not enough history to call
              a direction yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
