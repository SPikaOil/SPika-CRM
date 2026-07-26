'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Droplets, Loader2, Package, Shield, Factory, FileSpreadsheet } from 'lucide-react'
import { downloadCsv } from '@/lib/csv-export'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { OIL_SKUS, bottlesFromLitres, litresFromBottles, type RealVolumes } from '@/lib/oil-stock'

function monthOptions() {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
    }
  })
}

function prevMonth(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1, 1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(monthStr: string): [string, string] {
  const [y, m] = monthStr.split('-').map(Number)
  const start = `${monthStr}-01`
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return [start, end]
}

const productName = (sku: string) => SPIKA_PRODUCTS.find(p => p.sku === sku)?.name ?? sku

export default function StockPage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [month, setMonth] = useState(monthOptions()[0].value)
  const [loading, setLoading] = useState(true)
  const [realVolumes, setRealVolumes] = useState<RealVolumes>({})
  const [litres, setLitres] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [safetyMonths, setSafetyMonths] = useState('6')
  const [safetyDraft, setSafetyDraft] = useState('6')
  const [savingSafety, setSavingSafety] = useState(false)
  const [prevMonthLitres, setPrevMonthLitres] = useState(0) // oil used by last month's sales

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, authLoading, router])

  // Load real volumes + safety setting once
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('sku, real_volume_ml'),
      supabase.from('app_settings').select('value').eq('key', 'safety_stock_months').single(),
    ]).then(([prod, setting]) => {
      const map: RealVolumes = {}
      for (const p of prod.data ?? []) map[p.sku] = p.real_volume_ml
      setRealVolumes(map)
      const s = (setting.data as any)?.value ?? '6'
      setSafetyMonths(s); setSafetyDraft(s)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load this month's stock snapshot + previous month's sales-in-litres
  useEffect(() => {
    setLoading(true)
    const [pStart, pEnd] = monthRange(prevMonth(month))
    Promise.all([
      supabase.from('oil_stock').select('litres, note').eq('month', month).maybeSingle(),
      supabase.from('orders_with_sales_date').select('items')
        .in('status', ['delivered', 'invoice_ready', 'invoice_blocked', 'paid'])
        .gte('sales_date', pStart).lt('sales_date', pEnd),
    ]).then(([stockRes, salesRes]) => {
      setLitres(stockRes.data ? String(stockRes.data.litres) : '')
      setNote(stockRes.data?.note ?? '')
      const bySku: Record<string, number> = {}
      for (const o of salesRes.data ?? []) {
        for (const it of (o.items ?? []) as { sku: string; qty: number }[]) {
          if (OIL_SKUS.includes(it.sku)) bySku[it.sku] = (bySku[it.sku] ?? 0) + (it.qty ?? 0)
        }
      }
      setLoading(false)
      setPrevMonthLitres(0) // set after realVolumes ready below
      setPrevBySku(bySku)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const [prevBySku, setPrevBySku] = useState<Record<string, number>>({})
  useEffect(() => {
    setPrevMonthLitres(litresFromBottles(prevBySku, realVolumes))
  }, [prevBySku, realVolumes])

  async function saveStock() {
    const n = parseFloat(litres)
    if (isNaN(n) || n < 0) { toast.error('Enter a valid number of litres'); return }
    setSaving(true)
    const { error } = await supabase.from('oil_stock').upsert({ month, litres: n, note })
    setSaving(false)
    if (error) toast.error(`Could not save: ${error.message}`)
    else toast.success('Oil stock saved')
  }

  // Export the full month-by-month stock history, not just the month on screen
  async function exportCsv() {
    const { data, error } = await supabase
      .from('oil_stock')
      .select('month, litres, note, updated_at')
      .order('month', { ascending: false })
    if (error) { toast.error(`Could not export: ${error.message}`); return }
    if (!data?.length) { toast.error('No stock data to export yet'); return }
    downloadCsv(
      'oil-stock',
      ['Month', 'Litres in stock', 'Note', 'Last updated'],
      data.map((r: any) => [r.month, r.litres, r.note, r.updated_at ? String(r.updated_at).split('T')[0] : ''])
    )
  }

  async function saveSafety() {
    const n = parseInt(safetyDraft, 10)
    if (isNaN(n) || n < 1) { toast.error('Enter a valid number of months'); return }
    setSavingSafety(true)
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'safety_stock_months', value: String(n), updated_at: new Date().toISOString() })
    setSavingSafety(false)
    if (error) toast.error(`Could not save: ${error.message}`)
    else { setSafetyMonths(String(n)); toast.success('Safety stock updated') }
  }

  const currentLitres = parseFloat(litres) || 0
  const bottleEquivalents = bottlesFromLitres(currentLitres, realVolumes)
  const requiredLitres = prevMonthLitres * (parseInt(safetyMonths, 10) || 0)
  const toProduce = Math.max(0, requiredLitres - currentLitres)
  const anyRealVolumeMissing = OIL_SKUS.some(sku => !realVolumes[sku])

  if (authLoading || !isAdmin) return null

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-2xl mx-auto w-full">
      {/* Stacked on phones: beside the export button and month picker the longer
          name either wrapped mid-word or ran underneath them. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 whitespace-nowrap">
            <Droplets className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 shrink-0" /> Stock &amp; Production
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">Ready-to-bottle oil stock per month</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" title="Export CSV" onClick={exportCsv}>
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="h-8 text-sm rounded-md border border-input bg-background px-2">
            {monthOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {anyRealVolumeMissing && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 px-3 py-2 text-sm text-orange-700 dark:text-orange-400">
          Some products have no &ldquo;real volume&rdquo; set yet. Set it per product in Products for accurate bottle counts.
        </div>
      )}

      {/* Current oil stock */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Droplets className="h-4 w-4" /> Ready-to-bottle Oil — {monthOptions().find(o => o.value === month)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Total litres in stock now</Label>
              <Input type="number" inputMode="decimal" value={litres} placeholder="e.g. 125"
                onChange={e => setLitres(e.target.value)} className="h-9 w-32" />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Note (optional)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} className="h-9" />
            </div>
            <Button className="bg-red-600 hover:bg-red-700 h-9" onClick={saveStock} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>

          {loading ? <Skeleton className="h-16" /> : currentLitres > 0 && (
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Package className="h-3.5 w-3.5" /> Could fill (to be bottled):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {bottleEquivalents.map(b => (
                  <div key={b.sku} className="text-sm">
                    <p className="font-bold">
                      {b.bottles != null ? b.bottles.toLocaleString('en') : '—'}
                      <span className="text-xs font-normal text-muted-foreground"> btls</span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {productName(b.sku)}{b.realVolumeMl ? ` · ${b.realVolumeMl}ml` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Safety stock (IJzeren Voorraad) */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4" /> Safety Stock (IJzeren Voorraad)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Months of cover required</Label>
              <Input type="number" value={safetyDraft} onChange={e => setSafetyDraft(e.target.value)}
                className="h-9 w-24" />
            </div>
            <Button variant="outline" className="h-9" onClick={saveSafety} disabled={savingSafety}>
              {savingSafety ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>

          <div className="rounded-lg border divide-y text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Last month&rsquo;s sales (real oil)</span>
              <span className="font-medium">{prevMonthLitres.toFixed(1)} L</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Required for {safetyMonths} month{safetyMonths === '1' ? '' : 's'}</span>
              <span className="font-medium">{requiredLitres.toFixed(1)} L</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Currently in stock</span>
              <span className="font-medium">{currentLitres.toFixed(1)} L</span>
            </div>
            <div className="flex justify-between px-3 py-2.5 bg-muted/40">
              <span className="font-semibold flex items-center gap-1.5">
                <Factory className="h-4 w-4 text-red-600" /> Still to produce
              </span>
              <span className={`font-bold ${toProduce > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {toProduce.toFixed(1)} L
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Formula: last month&rsquo;s sold bottles → real oil volume × {safetyMonths} months − current stock.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
