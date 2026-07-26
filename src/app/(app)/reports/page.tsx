'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart2, Download, Loader2 } from 'lucide-react'
import { downloadCsv, csvMoney } from '@/lib/csv-export'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { formatCurrency } from '@/lib/utils'

// SKUs that count as "bottles" + their real volume (ml) is fetched from DB
const BOTTLE_SKUS = ['oil-100ml', 'oil-50ml', 'oil-30ml-table', 'spika2go-5ml', 'spika2go-3ml']

interface RawOrder {
  id: string
  order_number: string
  status: string
  total: number
  created_at: string
  planned_date: string | null
  sales_date: string
  items: { sku: string; qty: number; unit_price: number; line_total: number }[]
  customer: { id: string; company_name: string } | null
}

// Timezone-proof local date string (YYYY-MM-DD) for comparing against sales_date
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface ProductVolume {
  sku: string
  real_volume_ml: number | null
}

function getDateRange(preset: string, from: string, to: string): [Date, Date] {
  const now = new Date()
  if (preset === 'this_month') {
    return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)]
  }
  if (preset === 'last_month') {
    return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)]
  }
  if (preset === 'this_year') {
    return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31, 23, 59, 59)]
  }
  if (preset === 'last_year') {
    return [new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)]
  }
  // custom
  return [from ? new Date(from + 'T00:00:00') : new Date(2020, 0, 1), to ? new Date(to + 'T23:59:59') : new Date()]
}

const DELIVERED_STATUSES = ['delivered', 'invoice_ready', 'invoice_blocked', 'paid']

export default function ReportsPage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [preset, setPreset] = useState('this_month')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<RawOrder[]>([])
  const [productVolumes, setProductVolumes] = useState<Record<string, number | null>>({})
  const [oilStock, setOilStock] = useState<{ month: string; litres: number; note: string }[]>([])

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, authLoading])

  useEffect(() => {
    // fetch real volumes from products table
    supabase.from('products').select('sku, real_volume_ml').then(({ data }) => {
      if (!data) return
      const map: Record<string, number | null> = {}
      for (const p of data as ProductVolume[]) map[p.sku] = p.real_volume_ml
      setProductVolumes(map)
    })
    // fetch monthly oil stock (last 12 months)
    supabase.from('oil_stock').select('month, litres, note').order('month', { ascending: false }).limit(12)
      .then(({ data }) => setOilStock((data as any) ?? []))
  }, [])

  async function fetchData() {
    setLoading(true)
    const [startDate, endDate] = getDateRange(preset, fromDate, toDate)
    // sales_date (invoice date, else delivery date, else creation date) decides
    // which period a sale belongs to
    const { data, error } = await supabase
      .from('orders_with_sales_date')
      .select('id, order_number, status, total, created_at, planned_date, sales_date, items, customer:customers(id, company_name)')
      .in('status', DELIVERED_STATUSES)
      .gte('sales_date', toDateStr(startDate))
      .lte('sales_date', toDateStr(endDate))
      .order('sales_date', { ascending: false })
    // Supabase types a to-one FK join as an array, but it returns an object at runtime
    if (!error && data) setOrders(data as unknown as RawOrder[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [preset, fromDate, toDate])

  // ── Computed data ───────────────────────────────────────────────────────────

  const totalRevenue = useMemo(() => orders.reduce((s, o) => s + Number(o.total), 0), [orders])

  // Sales per customer
  const perCustomer = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; orderCount: number }> = {}
    for (const o of orders) {
      const id = o.customer?.id ?? 'unknown'
      const name = o.customer?.company_name ?? 'Unknown'
      if (!map[id]) map[id] = { name, revenue: 0, orderCount: 0 }
      map[id].revenue += Number(o.total)
      map[id].orderCount++
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [orders])

  // Sales per product
  const perProduct = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {}
    for (const o of orders) {
      for (const item of (o.items ?? [])) {
        if (!map[item.sku]) {
          const p = SPIKA_PRODUCTS.find(p => p.sku === item.sku)
          map[item.sku] = { name: p?.name ?? item.sku, qty: 0, revenue: 0 }
        }
        map[item.sku].qty += item.qty
        map[item.sku].revenue += item.line_total
      }
    }
    return Object.entries(map)
      .map(([sku, v]) => ({ sku, ...v }))
      .filter(v => v.qty > 0)
      .sort((a, b) => b.revenue - a.revenue)
  }, [orders])

  // Bottle totals
  const bottleTotals = useMemo(() => {
    let totalBottles = 0
    let totalRealMl = 0
    for (const o of orders) {
      for (const item of (o.items ?? [])) {
        if (BOTTLE_SKUS.includes(item.sku) && item.qty > 0) {
          totalBottles += item.qty
          const vol = productVolumes[item.sku]
          if (vol != null) totalRealMl += item.qty * vol
        }
      }
    }
    return { totalBottles, totalRealMl }
  }, [orders, productVolumes])

  // Sales flow per customer (order timeline)
  const customerFlow = useMemo(() => {
    const map: Record<string, { name: string; orders: { date: string; total: number; num: string }[] }> = {}
    for (const o of orders) {
      const id = o.customer?.id ?? 'unknown'
      const name = o.customer?.company_name ?? 'Unknown'
      if (!map[id]) map[id] = { name, orders: [] }
      map[id].orders.push({ date: o.sales_date, total: Number(o.total), num: o.order_number })
    }
    return Object.values(map).sort((a, b) => b.orders.reduce((s, o) => s + o.total, 0) - a.orders.reduce((s, o) => s + o.total, 0))
  }, [orders])

  // ── CSV export ──────────────────────────────────────────────────────────────
  function exportCSV() {
    // Uses the shared helper so values are escaped — company names contain
    // commas, which silently corrupted the columns before.
    downloadCsv(
      `report-${preset}`,
      ['Order #', 'Customer', 'Date', 'Total (XCG)', 'Status'],
      orders.map(o => [
        o.order_number,
        o.customer?.company_name ?? '',
        o.sales_date,
        csvMoney(o.total),
        o.status,
      ])
    )
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })

  if (authLoading) return null

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6" /> Reports
          </h1>
          <p className="text-muted-foreground text-sm">Sales reports by period</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={orders.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Period picker */}
      <Card className="py-0">
        <CardContent className="pt-2.5 pb-2.5 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: 'this_month', label: 'This month' },
              { value: 'last_month', label: 'Last month' },
              { value: 'this_year',  label: 'This year' },
              { value: 'last_year',  label: 'Last year' },
              { value: 'custom',     label: 'Custom' },
            ].map(p => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  preset === p.value ? 'bg-red-600 text-white border-red-600' : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 w-40" />
              </div>
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
          { label: 'Orders', value: String(orders.length) },
          { label: 'Total Bottles', value: String(bottleTotals.totalBottles) },
          { label: 'Real Volume', value: bottleTotals.totalRealMl > 0 ? `${(bottleTotals.totalRealMl / 1000).toFixed(1)} L` : '—' },
        ].map(k => (
          <Card key={k.label} className="py-0">
            <CardContent className="pt-2 pb-2 text-center">
              <p className="text-xs text-muted-foreground truncate">{k.label}</p>
              <p className="text-lg font-bold leading-tight mt-0.5">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sales per customer */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="text-sm">Sales per Customer</CardTitle>
        </CardHeader>
        <CardContent>
          {perCustomer.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <div className="space-y-1.5">
              {perCustomer.map((c, i) => (
                <div key={i}>
                  {i > 0 && <Separator className="my-1.5" />}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.orderCount} order{c.orderCount !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">{formatCurrency(c.revenue)}</p>
                  </div>
                  {/* Bar */}
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: `${(c.revenue / (perCustomer[0]?.revenue || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales per product */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="text-sm">Sales per Product</CardTitle>
        </CardHeader>
        <CardContent>
          {perProduct.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 font-medium">Product</th>
                    <th className="text-right py-2 font-medium">Qty</th>
                    <th className="text-right py-2 font-medium">Revenue</th>
                    <th className="text-right py-2 font-medium">Real Vol.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {perProduct.map(p => {
                    const vol = productVolumes[p.sku]
                    const totalMl = vol != null && p.qty > 0 ? p.qty * vol : null
                    return (
                      <tr key={p.sku} className="hover:bg-muted/30">
                        <td className="py-1.5 font-medium">{p.name}</td>
                        <td className="py-1.5 text-right">{p.qty}</td>
                        <td className="py-1.5 text-right">{formatCurrency(p.revenue)}</td>
                        <td className="py-1.5 text-right text-muted-foreground">
                          {totalMl != null ? `${(totalMl / 1000).toFixed(2)} L` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales flow per customer */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="text-sm">Sales Flow per Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {customerFlow.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            customerFlow.map((c, i) => (
              <div key={i}>
                {i > 0 && <Separator />}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.orders.length} order{c.orders.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {c.orders.slice().reverse().map((o, j) => (
                      <div key={j} className="bg-muted rounded-lg px-2.5 py-1.5 text-xs space-y-0.5">
                        <p className="font-mono font-medium">{o.num}</p>
                        <p className="text-muted-foreground">{fmtDate(o.date)}</p>
                        <p className="font-semibold text-red-600">{formatCurrency(o.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Oil stock per month */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="text-sm">SPika Oil Stock per Month</CardTitle>
        </CardHeader>
        <CardContent>
          {oilStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock recorded yet. Record it in Stock & Production.</p>
          ) : (
            <div className="space-y-1.5">
              {oilStock.map((s, i) => {
                const [y, m] = s.month.split('-').map(Number)
                const label = new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })
                return (
                  <div key={s.month}>
                    {i > 0 && <Separator className="my-1.5" />}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                        {s.note && <p className="text-xs text-muted-foreground truncate">{s.note}</p>}
                      </div>
                      <p className="text-sm font-semibold shrink-0">{Number(s.litres).toFixed(1)} L</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
