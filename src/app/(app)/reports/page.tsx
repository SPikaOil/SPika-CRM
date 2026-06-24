'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart2, Download, Loader2 } from 'lucide-react'
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
  items: { sku: string; qty: number; unit_price: number; line_total: number }[]
  customer: { id: string; company_name: string } | null
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
  }, [])

  async function fetchData() {
    setLoading(true)
    const [startDate, endDate] = getDateRange(preset, fromDate, toDate)
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, total, created_at, planned_date, items, customer:customers(id, company_name)')
      .in('status', DELIVERED_STATUSES)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false })
    if (!error && data) setOrders(data as RawOrder[])
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
      map[id].orders.push({ date: o.created_at, total: Number(o.total), num: o.order_number })
    }
    return Object.values(map).sort((a, b) => b.orders.reduce((s, o) => s + o.total, 0) - a.orders.reduce((s, o) => s + o.total, 0))
  }, [orders])

  // ── CSV export ──────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Order #', 'Customer', 'Date', 'Total (XCG)', 'Status'],
      ...orders.map(o => [
        o.order_number,
        o.customer?.company_name ?? '',
        new Date(o.created_at).toLocaleDateString('en'),
        Number(o.total).toFixed(2),
        o.status,
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spika-report-${preset}.csv`
    a.click()
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })

  if (authLoading) return null

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
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
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
          { label: 'Orders', value: String(orders.length) },
          { label: 'Total Bottles', value: String(bottleTotals.totalBottles) },
          { label: 'Real Volume', value: bottleTotals.totalRealMl > 0 ? `${(bottleTotals.totalRealMl / 1000).toFixed(1)} L` : '—' },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold mt-1">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sales per customer */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sales per Customer</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {perCustomer.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <div className="space-y-2">
              {perCustomer.map((c, i) => (
                <div key={i}>
                  {i > 0 && <Separator className="my-2" />}
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sales per Product</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
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
                        <td className="py-2 font-medium">{p.name}</td>
                        <td className="py-2 text-right">{p.qty}</td>
                        <td className="py-2 text-right">{formatCurrency(p.revenue)}</td>
                        <td className="py-2 text-right text-muted-foreground">
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sales Flow per Customer</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-4">
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
    </div>
  )
}
