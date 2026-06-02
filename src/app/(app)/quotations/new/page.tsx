'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateQuote } from '@/hooks/use-quotes'
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
import { getNextQuoteNumber } from '@/lib/order-number'

const B2C_TAX_RATE = 0.06

function buildItemsForCustomer(
  productPrices: Record<string, number>,
  productDiscounts: Record<string, number> = {},
  freeProducts: string[] = [],
  activeProducts: string[] = []
): QuoteItem[] {
  const products = activeProducts.length > 0
    ? SPIKA_PRODUCTS.filter(p => activeProducts.includes(p.sku))
    : SPIKA_PRODUCTS
  return products.map((p) => {
    const isFree = freeProducts.includes(p.sku)
    return {
      sku: p.sku,
      name: isFree ? `${p.name} — [Free of Charge]` : p.name,
      qty: 0,
      unit_price: isFree ? 0 : (productPrices[p.sku] ?? p.default_price),
      discount: isFree ? 0 : (productDiscounts[p.sku] ?? 0),
      line_total: 0,
    }
  })
}

// Default valid_until = 14 days from today
function defaultValidUntil() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

function NewQuotationInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createQuote = useCreateQuote()
  const { data: customers } = useCustomers()
  const { profile, isAdmin } = useAuth()

  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '')
  const [validUntil, setValidUntil] = useState(defaultValidUntil())
  const [quoteNumber, setQuoteNumber] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    getNextQuoteNumber().then(setQuoteNumber)
  }, [])

  const selectedCustomer = customers?.find((c) => c.id === customerId)

  function handleCustomerChange(id: string) {
    setCustomerId(id)
    const customer = customers?.find((c) => c.id === id)
    if (customer) {
      setItems(buildItemsForCustomer(
        customer.product_prices ?? {},
        customer.product_discounts ?? {},
        customer.free_products ?? [],
        customer.active_products ?? []
      ))
    }
  }

  useEffect(() => {
    if (customerId && customers) {
      const customer = customers.find((c) => c.id === customerId)
      if (customer) {
        setItems(buildItemsForCustomer(
          customer.product_prices ?? {},
          customer.product_discounts ?? {},
          customer.free_products ?? [],
          customer.active_products ?? []
        ))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers])

  function updateQty(index: number, qty: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, qty, line_total: qty * (item.unit_price - item.discount) } : item
      )
    )
  }

  function updatePrice(index: number, price: number) {
    if (!isAdmin) return
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, unit_price: price, line_total: item.qty * (price - item.discount) } : item
      )
    )
  }

  function updateDiscount(index: number, discount: number) {
    if (!isAdmin) return
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, discount, line_total: item.qty * (item.unit_price - discount) } : item
      )
    )
  }

  const taxRate = selectedCustomer?.customer_category === 'b2c' ? B2C_TAX_RATE : 0
  const taxLabel = selectedCustomer?.customer_category === 'b2c' ? 'VAT (6%)' : 'VAT (0% — B2B exempt)'

  const activeItems = items.filter((i) => i.qty > 0)
  const subtotal = activeItems.reduce((sum, i) => sum + i.line_total, 0)
  const tax = subtotal * taxRate
  const total = subtotal + tax

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) return toast.error('Select a customer')
    if (activeItems.length === 0) return toast.error('Set a quantity for at least one product')

    setIsSubmitting(true)
    try {
      const quote = await createQuote.mutateAsync({
        customer_id: customerId,
        quote_number: quoteNumber || await getNextQuoteNumber(),
        po_number: poNumber || null,
        items: activeItems,
        subtotal,
        tax,
        total,
        status: 'draft',
        valid_until: validUntil,
        template_used: notes || '',
        created_by: profile?.id ?? '',
      } as any)
      toast.success('Quotation created!')
      router.push(`/quotations/${quote.id}`)
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
      <h1 className="text-2xl font-bold">New Quotation</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Setup */}
        <Card>
          <CardHeader><CardTitle className="text-base">Quotation Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={(v) => v && handleCustomerChange(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer">
                    {selectedCustomer?.company_name ?? 'Select customer'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCustomer && (
                <p className="text-xs text-muted-foreground">
                  {selectedCustomer.customer_category === 'b2c' ? '6% VAT applies (B2C)' : 'Tax-exempt B2B — 0% VAT'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Quote Number</Label>
                <Input
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                  placeholder="Auto-generated"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valid Until *</Label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>PO Number <span className="text-muted-foreground text-xs font-normal">(optional — customer's purchase order reference)</span></Label>
                <Input
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-2026-001"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Internal Notes <span className="text-muted-foreground text-xs">(not shown on quotation)</span></Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any internal notes about this quotation..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Products */}
        {items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Products</CardTitle>
              <p className="text-xs text-muted-foreground">
                Set the quantity for each product. Products with qty 0 are excluded from the quotation.
              </p>
            </CardHeader>
            <CardContent className="space-y-0 divide-y">
              {items.map((item, i) => (
                <div key={item.sku} className="py-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className={`font-medium text-sm ${item.qty === 0 ? 'text-muted-foreground' : ''}`}>
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.sku}</p>
                    </div>
                    <p className="text-sm font-semibold whitespace-nowrap">
                      XCG {item.line_total.toFixed(2)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        value={item.qty}
                        onChange={(e) => updateQty(i, Number(e.target.value))}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Price (XCG)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updatePrice(i, Number(e.target.value))}
                        className="h-8"
                        readOnly={!isAdmin}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Discount (XCG)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.discount}
                        onChange={(e) => updateDiscount(i, Number(e.target.value))}
                        className="h-8"
                        readOnly={!isAdmin}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>XCG {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{taxLabel}</span>
                  <span>XCG {tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t pt-1">
                  <span>Total</span>
                  <span>XCG {total.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          type="submit"
          className="w-full bg-red-600 hover:bg-red-700 h-12"
          disabled={isSubmitting || activeItems.length === 0 || !customerId}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Quotation
        </Button>
      </form>
    </div>
  )
}

export default function NewQuotationPage() {
  return (
    <Suspense>
      <NewQuotationInner />
    </Suspense>
  )
}
