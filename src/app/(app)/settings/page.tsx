'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Settings, Users, FileText, Download, Building2, Loader2, Tag, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react'
import { PriceInput } from '@/components/ui/price-input'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { useAuth } from '@/contexts/auth-context'
import { useQuoteTemplates } from '@/hooks/use-quotes'
import { useOrders } from '@/hooks/use-orders'
import { usePricePresets, useUpdatePricePreset } from '@/hooks/use-price-presets'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { data: templates } = useQuoteTemplates()
  const { data: invoiceReadyOrders } = useOrders('invoice_ready')
  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/dashboard')
    }
  }, [isAdmin, authLoading, router])

  const [reportGenerating, setReportGenerating] = useState(false)

  async function generateMonthlyReport(year?: number, month?: number) {
    setReportGenerating(true)
    try {
      const res = await fetch('/api/report/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(year && month ? { year, month } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Report generated — ${data.label} · XCG ${Number(data.totalRevenue).toFixed(2)} revenue · ${data.totalOrders} orders`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setReportGenerating(false)
    }
  }

  async function exportQuickBooksCSV() {
    if (!invoiceReadyOrders?.length) {
      toast.error('No invoice-ready orders to export')
      return
    }

    const headers = ['OrderNumber', 'CustomerName', 'QuickBooksID', 'Total', 'Date']
    const rows = invoiceReadyOrders.map((o) => [
      o.order_number,
      o.customer?.company_name ?? '',
      o.customer?.quickbooks_customer_id ?? '',
      Number(o.total).toFixed(2),
      new Date(o.created_at).toLocaleDateString(),
    ])

    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spika-invoice-ready-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    toast.success('CSV exported')
  }

  if (authLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-muted-foreground text-sm">Admin-only configuration</p>
      </div>

      {/* QuickBooks Export */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Download className="h-4 w-4" />
            QuickBooks Export
          </CardTitle>
          <CardDescription>
            Export invoice-ready orders as CSV for QuickBooks import
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {invoiceReadyOrders?.length ?? 0} orders ready for invoicing
          </p>
          <Button
            className="gap-2 bg-green-600 hover:bg-green-700"
            onClick={exportQuickBooksCSV}
            disabled={!invoiceReadyOrders?.length}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </CardContent>
      </Card>

      {/* Monthly Report */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart2 className="h-4 w-4" />
            Monthly Report
          </CardTitle>
          <CardDescription>
            Generate a sales report and save it automatically to Sales Documents → Monthly Reports.
            Runs automatically on the last day of each month.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Includes: revenue, bottles sold, top customers, new customers, and portal requests.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              className="gap-2 bg-red-600 hover:bg-red-700"
              onClick={() => generateMonthlyReport()}
              disabled={reportGenerating}
            >
              {reportGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart2 className="h-4 w-4" />}
              Generate Last Month's Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quote Templates */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4" />
            Quote Templates
          </CardTitle>
          <CardDescription>
            Manage product catalogs and pricing per category
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {templates?.map((t) => (
            <div key={t.id}>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {t.category} · {(t.items as any[]).length} items
                  </p>
                </div>
                <Button variant="outline" size="sm">Edit</Button>
              </div>
              <Separator />
            </div>
          ))}
          <Button variant="outline" className="w-full">
            + Add Template
          </Button>
        </CardContent>
      </Card>

      {/* Product Codes */}
      <ProductCodesCard />

      {/* Company Info */}
      <CompanySettingsCard />

      {/* Exchange Rates */}
      <ExchangeRatesCard />

      {/* User Management */}
      <Card className="py-3 gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" />
            User Management
          </CardTitle>
          <CardDescription>Invite team members and manage roles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <InviteUserForm />
        </CardContent>
      </Card>
    </div>
  )
}

const COMPANY_ID = '00000000-0000-0000-0000-000000000001'

function CompanySettingsCard() {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState({
    name: '',
    address_line1: '',
    address_line2: '',
    email: '',
    phone: '',
    crib_number: '',
    coc_number: '',
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.from('company_settings').select('*').eq('id', COMPANY_ID).single()
      .then(({ data }) => {
        if (data) setFields({
          name: data.name ?? '',
          address_line1: data.address_line1 ?? '',
          address_line2: data.address_line2 ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
          crib_number: data.crib_number ?? '',
          coc_number: data.coc_number ?? '',
        })
        setLoaded(true)
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('company_settings')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', COMPANY_ID)
    if (error) toast.error(error.message)
    else toast.success('Company info saved!')
    setSaving(false)
  }

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(f => ({ ...f, [key]: e.target.value }))

  if (!loaded) return <Skeleton className="h-64 rounded-xl" />

  return (
    <Card className="py-3 gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4" />
          Company Info
        </CardTitle>
        <CardDescription>Shown on delivery notes as the sender</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Company Name</Label>
            <Input value={fields.name} onChange={set('name')} placeholder="Mils Inc." />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Address Line 1</Label>
            <Input value={fields.address_line1} onChange={set('address_line1')} placeholder="Kaya Kiwa 31-a" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Address Line 2</Label>
            <Input value={fields.address_line2} onChange={set('address_line2')} placeholder="Willemstad Curacao CW" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={fields.email} onChange={set('email')} placeholder="info@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={fields.phone} onChange={set('phone')} placeholder="+5999-000-0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Crib #</Label>
            <Input value={fields.crib_number} onChange={set('crib_number')} placeholder="102471812" />
          </div>
          <div className="space-y-1.5">
            <Label>CoC #</Label>
            <Input value={fields.coc_number} onChange={set('coc_number')} placeholder="145141" />
          </div>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 gap-2" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  )
}

function ExchangeRatesCard() {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [rateUsd, setRateUsd] = useState('')
  const [rateEur, setRateEur] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.from('company_settings').select('rate_usd,rate_eur').eq('id', COMPANY_ID).single()
      .then(({ data }) => {
        if (data) {
          setRateUsd(String(data.rate_usd ?? 1.79))
          setRateEur(String(data.rate_eur ?? 2.00))
        }
        setLoaded(true)
      })
  }, [])

  async function handleSave() {
    const usd = parseFloat(rateUsd)
    const eur = parseFloat(rateEur)
    if (isNaN(usd) || isNaN(eur) || usd <= 0 || eur <= 0) {
      toast.error('Enter valid positive rates')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('company_settings')
      .update({ rate_usd: usd, rate_eur: eur })
      .eq('id', COMPANY_ID)
    if (error) toast.error(error.message)
    else toast.success('Exchange rates saved!')
    setSaving(false)
  }

  if (!loaded) return <Skeleton className="h-40 rounded-xl" />

  return (
    <Card className="py-3 gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Tag className="h-4 w-4" />
          Exchange Rates
        </CardTitle>
        <CardDescription>
          Set how many XCG equals 1 unit of each currency. Used for automatic price conversion on orders.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>1 USD = ? XCG</Label>
            <Input
              type="number"
              step="0.0001"
              min="0.0001"
              value={rateUsd}
              onChange={e => setRateUsd(e.target.value)}
              placeholder="1.79"
            />
          </div>
          <div className="space-y-1.5">
            <Label>1 EUR = ? XCG</Label>
            <Input
              type="number"
              step="0.0001"
              min="0.0001"
              value={rateEur}
              onChange={e => setRateEur(e.target.value)}
              placeholder="2.00"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Example: if 1 EUR = 2 XCG, then an order worth XCG 10 will show as EUR 5 when you switch the currency.
        </p>
        <Button className="bg-red-600 hover:bg-red-700 gap-2" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Rates
        </Button>
      </CardContent>
    </Card>
  )
}

function PricePresetsCard() {
  const { data: presets, isLoading } = usePricePresets()
  const { mutateAsync: updatePreset } = useUpdatePricePreset()
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [localPrices, setLocalPrices] = useState<Record<string, Record<string, number>>>({})
  const [localDiscounts, setLocalDiscounts] = useState<Record<string, Record<string, number>>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!presets) return
    const initPrices: Record<string, Record<string, number>> = {}
    const initDiscounts: Record<string, Record<string, number>> = {}
    for (const p of presets) {
      initPrices[p.category] = { ...p.prices }
      initDiscounts[p.category] = { ...(p.discounts ?? {}) }
    }
    setLocalPrices(initPrices)
    setLocalDiscounts(initDiscounts)
  }, [presets])

  function setPrice(category: string, sku: string, raw: string) {
    const val = raw === '' ? undefined : parseFloat(raw)
    setLocalPrices(prev => {
      const next = { ...prev[category] }
      if (val === undefined) delete next[sku]
      else next[sku] = val
      return { ...prev, [category]: next }
    })
  }

  function setDiscount(category: string, sku: string, raw: string) {
    const val = raw === '' ? undefined : parseFloat(raw)
    setLocalDiscounts(prev => {
      const next = { ...prev[category] }
      if (val === undefined) delete next[sku]
      else next[sku] = val
      return { ...prev, [category]: next }
    })
  }

  async function handleSave(category: string, id: string) {
    setSaving(category)
    try {
      const preset = presets?.find(p => p.category === category)
      await updatePreset({ id, prices: localPrices[category] ?? {}, discounts: localDiscounts[category] ?? {}, products: preset?.products ?? [] })
      toast.success('Price preset saved!')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(null)
    }
  }

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />

  return (
    <Card className="py-3 gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Tag className="h-4 w-4" />
          Price Presets
        </CardTitle>
        <CardDescription>
          Default prices &amp; discounts per customer category. Applied automatically when creating a customer — still editable per customer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-0 sm:p-6 sm:pt-0">
        {(presets ?? []).map(preset => {
          const isOpen = openCategory === preset.category
          const prices = localPrices[preset.category] ?? {}
          const discounts = localDiscounts[preset.category] ?? {}
          const customCount = Object.keys(preset.prices).length + Object.keys(preset.discounts ?? {}).length
          return (
            <div key={preset.category} className="border rounded-lg overflow-hidden mx-4 sm:mx-0 mb-2">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-left"
                onClick={() => setOpenCategory(isOpen ? null : preset.category)}
              >
                <div>
                  <p className="text-sm font-medium">{preset.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {customCount > 0 ? `${customCount} custom values set` : 'Using product defaults'}
                  </p>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {isOpen && (
                <div className="border-t pb-4 pt-3 space-y-3">
                  <div className="border-t border-b divide-y mx-0">
                    {SPIKA_PRODUCTS.map(product => (
                      <div key={product.sku} className="px-4 py-2.5 space-y-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">default XCG {product.default_price.toFixed(2)}</p>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1 space-y-1">
                            <p className="text-xs text-muted-foreground">Price (XCG)</p>
                            <PriceInput
                              value={prices[product.sku] ?? 0}
                              onChange={v => setPrice(preset.category, product.sku, v === 0 ? '' : String(v))}
                              placeholder={product.default_price.toFixed(2)}
                              className="h-8"
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-xs text-muted-foreground">Discount</p>
                            <PriceInput
                              value={discounts[product.sku] ?? 0}
                              onChange={v => setDiscount(preset.category, product.sku, v === 0 ? '' : String(v))}
                              placeholder="0.00"
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground px-4">Leave blank to use product defaults. Discount is a per-unit deduction from the price.</p>
                  <div className="px-4">
                    <Button
                      className="bg-red-600 hover:bg-red-700 gap-2"
                      onClick={() => handleSave(preset.category, preset.id)}
                      disabled={saving === preset.category}
                    >
                      {saving === preset.category && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save {preset.label} Preset
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function ProductCodesCard() {
  const supabase = createClient()
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('company_settings').select('product_codes').eq('id', COMPANY_ID).single()
      .then(({ data }) => {
        if (data?.product_codes) setCodes(data.product_codes as Record<string, string>)
        setLoaded(true)
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('company_settings')
      .update({ product_codes: codes })
      .eq('id', COMPANY_ID)
    if (error) toast.error(error.message)
    else toast.success('Product codes saved!')
    setSaving(false)
  }

  if (!loaded) return <Skeleton className="h-48 rounded-xl" />

  return (
    <Card className="py-3 gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Tag className="h-4 w-4" />
          Product Codes
        </CardTitle>
        <CardDescription>Internal product codes for CRM use only — not shown on invoices or delivery notes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="rounded-lg border divide-y">
          {SPIKA_PRODUCTS.map((product) => (
            <div key={product.sku} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{product.name}</p>
                <p className="text-xs text-muted-foreground">{product.sku}</p>
              </div>
              <Input
                className="w-32 h-8 font-mono"
                placeholder="e.g. SP-001"
                value={codes[product.sku] ?? ''}
                onChange={e => setCodes(c => ({ ...c, [product.sku]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <Button className="bg-red-600 hover:bg-red-700 gap-2" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Codes
        </Button>
      </CardContent>
    </Card>
  )
}

function InviteUserForm() {
  const supabase = createClient()
  const [email, setEmail] = useState('')

  return (
    <div className="flex gap-2">
      <Input
        type="email"
        placeholder="team@spika.com"
        className="flex-1"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button
        size="sm"
        onClick={async () => {
          if (!email) return
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: true },
          })
          if (error) toast.error(error.message)
          else toast.success(`Invite sent to ${email}`)
          setEmail('')
        }}
      >
        Invite
      </Button>
    </div>
  )
}
