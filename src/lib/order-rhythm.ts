// Order rhythm — derives a customer's buying cadence from their order history.
// One shared, pure function so the customer page and the dashboard agree.
//
// Honesty first (see the data analysis): with ~26 customers and few orders
// each, a real median cadence only exists for customers with >=4 order moments.
// Below that we say so instead of inventing precision. "Days since last order"
// is the signal that works for everyone.

export interface RhythmOrder {
  created_at: string
  invoice_date?: string | null
  sales_date?: string | null
  status?: string | null
  delivery?: { delivered_at?: string | null } | null
}

export type RhythmState = 'no_orders' | 'single' | 'indicative' | 'tracked'
export type RhythmFlag = 'on_track' | 'due_soon' | 'overdue'

export interface OrderRhythm {
  orderMoments: number          // distinct calendar days an order was placed
  firstOrderDate: string | null // YYYY-MM-DD
  lastOrderDate: string | null  // YYYY-MM-DD
  daysSinceLast: number | null
  intervals: number[]           // gaps in days, oldest→newest, capped to last 6
  medianInterval: number | null // null when <2 order moments
  reliable: boolean             // >=4 order moments — enough for a real cadence
  ratio: number | null          // daysSinceLast / medianInterval
  state: RhythmState
  flag: RhythmFlag | null        // only when a median exists
  orderDays: string[]           // all distinct order days (YYYY-MM-DD), ascending
}

// Statuses that are not a real placed order
const EXCLUDED = new Set(['deleted', 'pending_approval'])

// When did this order actually happen? Same precedence as the sales_date view:
// invoice date, else delivery date, else creation date.
export function effectiveOrderDate(o: RhythmOrder): string | null {
  return o.sales_date ?? o.invoice_date ?? o.delivery?.delivered_at ?? o.created_at ?? null
}

const dayKey = (d: string) => new Date(d).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function computeOrderRhythm(orders: RhythmOrder[] | undefined | null): OrderRhythm {
  const empty: OrderRhythm = {
    orderMoments: 0, firstOrderDate: null, lastOrderDate: null, daysSinceLast: null,
    intervals: [], medianInterval: null, reliable: false, ratio: null,
    state: 'no_orders', flag: null, orderDays: [],
  }
  if (!orders || orders.length === 0) return empty

  // Distinct order days (two orders on one day = one buying moment, not a 0-day gap)
  const days = new Set<string>()
  for (const o of orders) {
    if (o.status && EXCLUDED.has(o.status)) continue
    const d = effectiveOrderDate(o)
    if (d) days.add(dayKey(d))
  }
  const orderDays = [...days].sort()
  const n = orderDays.length
  if (n === 0) return empty

  const todayKey = new Date().toISOString().slice(0, 10)
  const lastOrderDate = orderDays[n - 1]
  const firstOrderDate = orderDays[0]
  // Guard future-dated orders: never report a negative "days since"
  const daysSinceLast = Math.max(0, daysBetween(lastOrderDate, todayKey))

  const allIntervals: number[] = []
  for (let i = 1; i < n; i++) allIntervals.push(daysBetween(orderDays[i - 1], orderDays[i]))
  // Only the last 6 gaps feed the median — recent behaviour, absorbs seasonality
  const intervals = allIntervals.slice(-6)

  const medianInterval = intervals.length ? median(intervals) : null
  const reliable = n >= 4
  const ratio = medianInterval && medianInterval > 0
    ? +(daysSinceLast / medianInterval).toFixed(2)
    : null

  let flag: RhythmFlag | null = null
  if (ratio != null) flag = ratio < 0.8 ? 'on_track' : ratio <= 1.2 ? 'due_soon' : 'overdue'

  const state: RhythmState = n >= 4 ? 'tracked' : n >= 2 ? 'indicative' : 'single'

  return {
    orderMoments: n, firstOrderDate, lastOrderDate, daysSinceLast,
    intervals, medianInterval, reliable, ratio, state, flag, orderDays,
  }
}

// The cadence we compare "days since last" against. Uses the real median when
// it exists; otherwise a 6-week fallback so customers with too little history
// still surface once they have genuinely gone quiet.
const FALLBACK_QUIET_DAYS = 42

export interface QuietAssessment {
  quiet: boolean
  daysSinceLast: number | null
  expectedDays: number | null // the cadence we measured against, if any
  reason: string
}

// Is this customer overdue to reorder relative to their own rhythm? Kept in the
// lib so the customer page and the dashboard banner judge it identically.
export function assessQuiet(r: OrderRhythm): QuietAssessment {
  if (r.daysSinceLast == null) {
    return { quiet: false, daysSinceLast: null, expectedDays: null, reason: 'No orders yet' }
  }
  if (r.medianInterval != null) {
    const threshold = r.medianInterval * 1.3
    return {
      quiet: r.daysSinceLast > threshold,
      daysSinceLast: r.daysSinceLast,
      expectedDays: r.medianInterval,
      reason: r.reliable
        ? `usually every ~${Math.round(r.medianInterval)}d`
        : `roughly every ~${Math.round(r.medianInterval)}d (few orders)`,
    }
  }
  // Only one order moment — no cadence, fall back to a flat "gone quiet" window
  return {
    quiet: r.daysSinceLast > FALLBACK_QUIET_DAYS,
    daysSinceLast: r.daysSinceLast,
    expectedDays: null,
    reason: 'only one order',
  }
}
