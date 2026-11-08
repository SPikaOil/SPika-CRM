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
 *
 * Laid out on her instruction of 2026-11-08, word for word: six boxes — Last
 * order, Next expected order, Average per order Value, Average per order
 * Bottles, Everything so far Value, Everything so far Bottles. One number per
 * box. Money and bottles never share a line, because "XCG 649 · 50" reads as
 * one figure cut in half.
 *
 * And it says "bottles", never "fl". Her remark the same day: "wat is FL?
 * flessen? ...fl zou ik eerder denken dat het een valuta is".
 */

const fmtDay = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtShort = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })

const fmtMoney = (n: number) =>
  `XCG ${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Rounded, for a box that has to hold the figure on one line. */
const fmtMoneyShort = (n: number) => `XCG ${Math.round(n).toLocaleString('en')}`

const TREND_STYLE: Record<ProductTrend, { pill: string; label: string }> = {
  up:      { pill: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300', label: 'More' },
  down:    { pill: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', label: 'Less' },
  flat:    { pill: 'bg-muted text-muted-foreground',                                    label: 'Steady' },
  stopped: { pill: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',         label: 'Stopped' },
  new:     { pill: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',     label: 'New' },
}

/** One of the six boxes: a label, one number, and at most one line under it. */
function Box({
  label, value, sub, tone = '',
}: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card px-2.5 py-1.5 min-w-0">
      <p className="text-[10px] text-muted-foreground leading-tight truncate">{label}</p>
      <p className={`text-sm font-bold leading-tight truncate ${tone}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight truncate">{sub ?? ' '}</p>
    </div>
  )
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


  const TrendIcon = flow.trend === 'up' ? TrendingUp : flow.trend === 'down' ? TrendingDown : Minus
  const trendColour =
    flow.trend === 'up' ? 'text-green-600' : flow.trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
  const trendText = flow.trend
    ? `${flow.trendPct != null ? `${flow.trendPct > 0 ? '+' : ''}${flow.trendPct}% ` : ''}last 3 vs the 3 before`
    : 'too few orders for a trend'

  const sinceLast = rhythm.daysSinceLast
  // Newest first: the order you placed yesterday is the one you are looking for.
  const newestFirst = [...flow.moments].reverse()

  return (
    <div className="space-y-2">
      {/* ── Six boxes, one number each ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Box
          label="Last order"
          value={rhythm.lastOrderDate ? fmtDay(rhythm.lastOrderDate) : '—'}
          sub={sinceLast == null ? undefined : sinceLast === 0 ? 'today' : `${sinceLast} days ago`}
        />
        <Box
          label="Next expected order"
          value={flow.nextExpected ? fmtDay(flow.nextExpected) : 'no rhythm yet'}
          tone={flow.nextExpected ? dueColour : 'text-muted-foreground'}
          sub={
            !flow.nextExpected || due == null
              ? undefined
              : due < 0 ? `${Math.abs(due)} days overdue` : due === 0 ? 'today' : `in ${due} days`
          }
        />
        <Box
          label="Average per order value"
          value={flow.averageAmount != null ? fmtMoneyShort(flow.averageAmount) : '—'}
          sub={
            flow.lastVsAverage != null
              ? `last order ${flow.lastVsAverage > 0 ? '+' : ''}${flow.lastVsAverage}% on that`
              : undefined
          }
        />
        <Box
          label="Average per order bottles"
          value={flow.averageBottles != null ? `${flow.averageBottles} bottles` : '—'}
          sub={`over ${flow.moments.length} order${flow.moments.length === 1 ? '' : 's'}`}
        />
        <Box
          label="Everything so far, value"
          value={fmtMoneyShort(flow.lifetimeValue)}
          sub={trendText}
          tone=""
        />
        <Box
          label="Everything so far, bottles"
          value={`${flow.lifetimeBottles} bottles`}
          sub="sold, samples not counted"
        />
      </div>

      {/* The trend arrow belongs with the money it describes, but it will not
          fit inside the box, so it sits right under the row. */}
      {flow.trend && (
        <p className={`text-[11px] flex items-center gap-1 ${trendColour}`}>
          <TrendIcon className="h-3 w-3 shrink-0" />
          Spending {flow.trend === 'up' ? 'is going up' : flow.trend === 'down' ? 'is going down' : 'is holding steady'}
          {flow.trendPct != null ? ` (${flow.trendPct > 0 ? '+' : ''}${flow.trendPct}% over the last 3 orders)` : ''}
        </p>
      )}

      {/* ── Every order ──
          Bars across the bottom of the screen were the wrong shape for this:
          thirteen orders of almost the same size became thirteen identical
          blocks with 9px numbers over them, and the bottles had to be squeezed
          in underneath. Her verdict of 2026-11-08: "dit is echt slecht".

          So it is a list, like every other list in this app: one line per
          order, newest at the top, value and bottles each in their own column
          that you can read straight down. The bar is only a shade behind the
          value, to show size without pretending to be a chart. */}
      <Card size="sm" className="py-0">
        <CardHeader className="pt-2 pb-1">
          <CardTitle className="text-sm">Every order</CardTitle>
        </CardHeader>
        <CardContent className="pb-2.5">
          <div className="flex items-center gap-2 px-1 pb-1 text-[10px] text-muted-foreground border-b">
            <span className="flex-1">Date</span>
            <span className="w-24 text-right">Value</span>
            <span className="w-20 text-right">Bottles</span>
          </div>
          {/* Eight rows fit without scrolling; a long history scrolls inside
              this box rather than pushing the rest of the tab off screen. */}
          <div className="max-h-52 overflow-y-auto">
            {newestFirst.map(m => (
              <div
                key={m.date}
                className="flex items-center gap-2 px-1 py-0.5 leading-tight border-b last:border-b-0"
              >
                <span className="flex-1 text-xs text-muted-foreground truncate">
                  {fmtDay(m.date)}
                  {m.orders > 1 && <span className="ml-1">({m.orders} orders)</span>}
                </span>
                <span className="w-24 text-right text-sm font-medium tabular-nums">
                  {fmtMoneyShort(m.amount)}
                </span>
                <span className="w-20 text-right text-sm tabular-nums">{m.bottles}</span>
              </div>
            ))}
          </div>
          {flow.averageAmount != null && (
            <p className="text-[11px] text-muted-foreground pt-1.5">
              Average {fmtMoney(flow.averageAmount)}
              {flow.averageBottles != null ? ` and ${flow.averageBottles} bottles` : ''} over{' '}
              {flow.moments.length} order{flow.moments.length === 1 ? '' : 's'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── What they actually buy ── */}
      <Card size="sm" className="py-0">
        <CardHeader className="pt-2 pb-1">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" /> What they buy
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2.5">
          {flow.products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No product lines on these orders.</p>
          ) : (
            flow.products.map(p => (
              <div key={p.sku} className="flex items-center gap-2 py-0.5 leading-tight border-b last:border-b-0">
                {/* Desktop puts the date range on the same line, which is what
                    saves the height. A phone has no room for that, so there it
                    stays underneath — the row is two lines either way. */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate sm:hidden">
                    {fmtShort(p.firstDate)} — {fmtShort(p.lastDate)}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground shrink-0 hidden sm:block">
                  {fmtShort(p.firstDate)} — {fmtShort(p.lastDate)}
                </p>
                <p className="text-sm font-semibold shrink-0 w-14 text-right">{p.units}×</p>
                <Badge className={`text-[10px] shrink-0 w-16 justify-center ${TREND_STYLE[p.trend].pill}`}>
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
