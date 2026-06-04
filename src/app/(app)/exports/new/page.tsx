'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useCreateExport, useCarriers } from '@/hooks/use-exports'
import { useCustomers } from '@/hooks/use-customers'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { QuoteItem } from '@/types'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { getNextExportNumber } from '@/lib/order-number'
import { getTaxIdInfo } from '@/lib/tax-id'

function buildItems(
  productPrices: Record<string, number>,
  productDiscounts: Record<string, number> = {},
  freeProducts: string[] = []
): QuoteItem[] {
  return SPIKA_PRODUCTS.map(p => {
    const isFree = freeProducts.includes(p.sku)
    return {
      sku: p.sku,
      name: p.name,
      qty: 0,
      unit_price: isFree ? 0 : (productPrices[p.sku] ?? p.default_price),
      discount: isFree ? 0 : (productDiscounts[p.sku] ?? 0),
      line_total: 0,
    }
  })
}

function NewExportInner() {
  const router = useRouter()
  const createExport = useCreateExport()
  const { data: carriers } = useCarriers()
  const { data: allCustomers } = useCustomers()
  const { profile, isAdmin } = useAuth()

  const [customerId, setCustomerId] = useState('')
  const [carrierId, setCarrierId] = useState('')
  const [destination, setDestination] = useState('')
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [thtDate, setThtDate] = useState('')
  const [currency, setCurrency] = useState('XCG')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Only export-category customers
  const internationalCustomers = (allCustomers ?? []).filter(c => c.customer_category === 'export')

  const selectedCustomer = internationalCustomers.find(c => c.id === customerId)

  // When customer changes, pre-fill items with their prices
  function handleCustomerChange(id: string) {
    setCustomerId(id)
    const customer = internationalCustomers.find(c => c.id === id)
    if (customer) {
      setItems(buildItems(
        customer.product_prices ?? {},
        customer.product_discounts ?? {},
        customer.free_products ?? []
      ))
    }
  }

  // When carrier changes, pre-fill destination
  useEffect(() => {
    const carrier = carriers?.find(c => c.id === carrierId)
    if (carrier?.route) {
      const dest = carrier.route.split('→').pop()?.trim() ?? ''
      setDestination(dest)
    }
  }, [carrierId, carriers])

  function updateQty(index: number, qty: number) {
    setItems(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, qty, line_total: qty * (item.unit_price - (item.discount ?? 0)) } : item
      )
    )
  }

  function updateTht(index: number, tht_date: string) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, tht_date } : item))
  }

  const activeItems = items.filter(i => i.qty > 0)
  const subtotal = activeItems.reduce((sum, i) => sum + i.line_total, 0)
  const missingTht = activeItems.some(i => !i.tht_date)

  // Live export number preview
  const billingCountryPreview = (selectedCustomer?.billing_address as any)?.country ?? ''
  const taxInfoPreview = getTaxIdInfo(billingCountryPreview)
  const isoPreview = taxInfoPreview.prefix || billingCountryPreview.slice(0, 2).toUpperCase() || '??'
  const datePreview = exportDate ? new Date(exportDate) : new Date()
  const yearPreview = datePreview.getFullYear()
  const monthPreview = String(datePreview.getMonth() + 1).padStart(2, '0')
  const exportNumberPreview = customerId ? `${isoPreview}${yearPreview}${monthPreview}NN` : null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) return
    if (activeItems.length === 0) return
    setIsSubmitting(true)
    try {
      // Derive country ISO from customer billing address
      const billingCountry = (selectedCustomer?.billing_address as any)?.country ?? ''
      const taxInfo = getTaxIdInfo(billingCountry)
      const countryIso = taxInfo.prefix || billingCountry.slice(0, 2).toUpperCase() || 'XX'

      // Generate export number: e.g. NL20260501
      const exportDate_ = exportDate ? new Date(exportDate) : new Date()
      const exportNumber = await getNextExportNumber(countryIso, exportDate_)

      const exp = await createExport.mutateAsync({
        export_number: exportNumber,
        customer_id: customerId,
        order_id: null,
        carrier_id: carrierId || null,
        destination,
        export_date: exportDate || null,
        tht_date: thtDate || null,
        notes,
        currency,
        items: activeItems,
        status: 'draft',
        created_by: profile?.id ?? '',
      } as any)
      router.push(`/exports/${exp.id}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20">
        <p className="font-medium">Access restricted</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">New Export</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Export Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={(v) => v && handleCustomerChange(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select international customer">
                    {selectedCustomer?.company_name ?? 'Select international customer'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {internationalCustomers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No export customers — set a customer's category to "Export" first
                    </div>
                  ) : (
                    internationalCustomers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only customers with category "Export" are shown
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Carrier</Label>
              <Select value={carrierId} onValueChange={(v) => v && setCarrierId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier">
                    {carrierId
                      ? (() => { const c = carriers?.find(c => c.id === carrierId); return c ? `${c.name}${c.route ? ` — ${c.route}` : ''}` : 'Select carrier' })()
                      : 'Select carrier'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {carriers?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.route ? ` — ${c.route}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Input
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="e.g. Bonaire"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Export Date</Label>
                <Input
                  type="date"
                  value={exportDate}
                  onChange={e => setExportDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                THT Date{' '}
                <span className="text-muted-foreground text-xs">(Tenminste Houdbaar Tot — best before)</span>
              </Label>
              <Input
                type="date"
                value={thtDate}
                onChange={e => setThtDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="XCG">XCG — Caribbean Guilder</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="ANG">ANG — Netherlands Antillean Guilder</SelectItem>
                  <SelectItem value="AWG">AWG — Aruban Florin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {exportNumberPreview && (
              <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Export number:</span>
                <span className="font-mono font-semibold text-sm tracking-wide">
                  {exportNumberPreview.replace('NN', '??')}
                </span>
                <span className="text-xs text-muted-foreground">(assigned on create)</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">(internal)</span></Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any notes about this export..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Products — only shown after customer selected */}
        {items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Products</CardTitle>
              <p className="text-xs text-muted-foreground">Set the quantity for each product to include in this export.</p>
            </CardHeader>
            <CardContent className="space-y-0 divide-y">
              {items.map((item, i) => (
                <div key={item.sku} className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${item.qty === 0 ? 'text-muted-foreground' : ''}`}>
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currency} {item.unit_price.toFixed(2)} / bottle
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Label className={`text-xs whitespace-nowrap ${item.qty > 0 && !item.tht_date ? 'text-red-500' : 'text-muted-foreground'}`}>
                          THT{item.qty > 0 ? ' *' : ''}:
                        </Label>
                        <Input
                          type="date"
                          value={item.tht_date ?? ''}
                          onChange={e => updateTht(i, e.target.value)}
                          className={`h-6 text-xs px-2 w-36 ${item.qty > 0 && !item.tht_date ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        type="number"
                        min="0"
                        value={item.qty}
                        onChange={e => updateQty(i, Number(e.target.value))}
                        className="h-8 w-20 text-right"
                      />
                      <span className="text-xs text-muted-foreground w-20 text-right font-medium">
                        {item.qty > 0 ? `${currency} ${item.line_total.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-3 text-sm flex justify-between font-bold">
                <span>Total Value</span>
                <span>{currency} {subtotal.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {missingTht && activeItems.length > 0 && (
          <p className="text-sm text-red-500 text-center -mb-1">
            THT date is required for all products with a quantity
          </p>
        )}
        <Button
          type="submit"
          className="w-full bg-red-600 hover:bg-red-700 h-12"
          disabled={isSubmitting || !customerId || activeItems.length === 0 || missingTht}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Export
        </Button>
      </form>
    </div>
  )
}

export default function NewExportPage() {
  return (
    <Suspense>
      <NewExportInner />
    </Suspense>
  )
}
