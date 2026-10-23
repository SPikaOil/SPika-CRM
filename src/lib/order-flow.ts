/**
 * Order flow — what a customer buys, how much of it, and whether that is
 * growing or shrinking.
 *
 * The rhythm (how OFTEN they order) already lives in `order-rhythm.ts` and this
 * does not repeat it: it takes that answer and adds the rest of the picture.
 * One shared file again, so the tab on a customer and the list across all
 * customers can never disagree.
 *
 * Everything here is derived from the orders that are already in the database.
 * No new table, no new column, nothing to migrate.
 *
 * Honesty, same as the rhythm: with 28 customers who have ordered at all, only
 * 11 have the four order moments a real cadence needs. A screen built on this
 * has to be able to say "too little history" rather than draw a confident line
 * through two dots.
 */
import { computeOrderRhythm, effectiveOrderDate, type OrderRhythm, type RhythmOrder } from './order-rhythm'

/** An order as this file needs it. Supersets `RhythmOrder`. */
export interface FlowOrder extends RhythmOrder {
  id?: string
  total?: number | string | null
  /** XCG per unit of `currency`. The dashboard converts the same way. */
  fx_rate?: number | string | null
  currency?: string | null
  order_type?: string | null
  items?: { sku?: string | null; name?: string | null; qty?: number | null }[] | null
}

/** One buying moment: a calendar day on which this customer ordered. */
export interface FlowMoment {
  date: string
  /** In XCG — every order is converted with its own rate, like the dashboard. */
  amount: number
  /** How many orders were placed that day. Usually one. */
  orders: number
}

export type ProductTrend = 'up' | 'down' | 'flat' | 'stopped' | 'new'

/** One product, across this customer's whole history. */
export interface ProductFlow {
  sku: string
  name: string
  /** Units over every moment. */
  units: number
  /** Units per moment, in the same order as `moments`. */
  perMoment: number[]
  firstDate: string
  lastDate: string
  trend: ProductTrend
}

export type FlowTrend = 'up' | 'down' | 'flat'

export interface OrderFlow {
  rhythm: OrderRhythm
  moments: FlowMoment[]
  /** Last order plus the usual gap. Null when there is no usual gap yet. */
  nextExpected: string | null
  /** Days until `nextExpected`; negative when it has passed. */
  daysUntilExpected: number | null
  /** Average value of a buying moment, in XCG. */
  averageAmount: number | null
  lastAmount: number | null
  /** Last moment against the average, as a percentage. +12 means 12% above. */
  lastVsAverage: number | null
  /** The three most recent moments against the three before them. */
  trend: FlowTrend | null
  trendPct: number | null
  /** Everything they have ever ordered, biggest first. */
  products: ProductFlow[]
  /** Total value of everything, in XCG. */
  lifetimeValue: number
}

// Same exclusions as the rhythm: a deleted order never happened, and one
// waiting for approval has not happened yet.
const EXCLUDED = new Set(['deleted', 'pending_approval'])

const dayKey = (d: string) => new Date(d).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)

/** An order's value in XCG, whatever it was invoiced in. */
export function orderValueXcg(o: FlowOrder): number {
  return Number(o.total ?? 0) * (Number(o.fx_rate) || 1)
}

function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Up or down, over the three most recent moments against the three before.
 *
 * Three and not two because one big order should not flip a customer to
 * "shrinking", and not more than three because the point is what they are doing
 * NOW. Under four moments there is nothing to compare and it returns null —
 * saying nothing beats saying something made up.
 */
function compare(values: number[]): { trend: FlowTrend | null; pct: number | null } {
  if (values.length < 4) return { trend: null, pct: null }
  const recent = values.slice(-3)
  const before = values.slice(-6, -3)
  if (before.length === 0) return { trend: null, pct: null }
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
  const a = avg(before)
  const b = avg(recent)
  if (a === 0) return { trend: b > 0 ? 'up' : 'flat', pct: null }
  const pct = +(((b - a) / a) * 100).toFixed(0)
  // Inside ten percent is noise, not a direction.
  return { trend: pct > 10 ? 'up' : pct < -10 ? 'down' : 'flat', pct }
}

export function computeOrderFlow(orders: FlowOrder[] | undefined | null): OrderFlow {
  const rhythm = computeOrderRhythm(orders as RhythmOrder[])

  const live = (orders ?? []).filter(o => !(o.status && EXCLUDED.has(o.status)))

  // Group by buying day, exactly as the rhythm counts them.
  const byDay = new Map<string, { amount: number; orders: number }>()
  for (const o of live) {
    const raw = effectiveOrderDate(o)
    if (!raw) continue
    const day = dayKey(raw)
    const cur = byDay.get(day) ?? { amount: 0, orders: 0 }
    cur.amount += orderValueXcg(o)
    cur.orders += 1
    byDay.set(day, cur)
  }
  const moments: FlowMoment[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, amount: +v.amount.toFixed(2), orders: v.orders }))

  const amounts = moments.map(m => m.amount)
  const lifetimeValue = +amounts.reduce((s, v) => s + v, 0).toFixed(2)
  const averageAmount = amounts.length ? +(lifetimeValue / amounts.length).toFixed(2) : null
  const lastAmount = amounts.length ? amounts[amounts.length - 1] : null
  const lastVsAverage =
    averageAmount && averageAmount > 0 && lastAmount != null
      ? +(((lastAmount - averageAmount) / averageAmount) * 100).toFixed(0)
      : null

  const { trend, pct: trendPct } = compare(amounts)

  // Next expected: the last order plus the gap they usually leave.
  const today = new Date().toISOString().slice(0, 10)
  const nextExpected =
    rhythm.lastOrderDate && rhythm.medianInterval != null
      ? addDays(rhythm.lastOrderDate, Math.round(rhythm.medianInterval))
      : null
  const daysUntilExpected = nextExpected ? daysBetween(today, nextExpected) : null

  // ── What they buy ──
  const dayIndex = new Map(moments.map((m, i) => [m.date, i]))
  const perSku = new Map<string, { name: string; perMoment: number[]; first: string; last: string }>()
  for (const o of live) {
    const raw = effectiveOrderDate(o)
    if (!raw) continue
    const idx = dayIndex.get(dayKey(raw))
    if (idx == null) continue
    for (const line of o.items ?? []) {
      const sku = (line.sku ?? '').trim()
      if (!sku) continue
      const qty = Number(line.qty ?? 0)
      if (!qty) continue
      const row = perSku.get(sku) ?? {
        name: line.name ?? sku,
        perMoment: new Array(moments.length).fill(0),
        first: moments[idx].date,
        last: moments[idx].date,
      }
      row.perMoment[idx] += qty
      if (moments[idx].date < row.first) row.first = moments[idx].date
      if (moments[idx].date > row.last) row.last = moments[idx].date
      perSku.set(sku, row)
    }
  }

  const products: ProductFlow[] = [...perSku.entries()]
    .map(([sku, row]) => {
      const units = row.perMoment.reduce((s, v) => s + v, 0)
      const recent = row.perMoment.slice(-3).reduce((s, v) => s + v, 0)
      const before = row.perMoment.slice(-6, -3).reduce((s, v) => s + v, 0)
      let t: ProductTrend
      if (moments.length < 4) t = 'flat'
      else if (recent === 0 && before > 0) t = 'stopped'
      else if (before === 0 && recent > 0) t = 'new'
      else if (before === 0) t = 'flat'
      else {
        const change = ((recent - before) / before) * 100
        t = change > 10 ? 'up' : change < -10 ? 'down' : 'flat'
      }
      return { sku, name: row.name, units, perMoment: row.perMoment, firstDate: row.first, lastDate: row.last, trend: t }
    })
    .sort((a, b) => b.units - a.units)

  return {
    rhythm,
    moments,
    nextExpected,
    daysUntilExpected,
    averageAmount,
    lastAmount,
    lastVsAverage,
    trend,
    trendPct,
    products,
    lifetimeValue,
  }
}
