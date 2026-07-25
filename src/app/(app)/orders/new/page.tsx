'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateOrder } from '@/hooks/use-orders'
import { useCustomers } from '@/hooks/use-customers'
import { useUsers } from '@/hooks/use-users'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { QtyInput } from '@/components/ui/qty-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { QuoteItem } from '@/types'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { getNextOrderNumber, getNextFreeBottleOrderNumber } from '@/lib/order-number'

const B2C_TAX_RATE = 0.06
const B2B_TAX_RATE = 0

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

function NewDeliveryNoteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createOrder = useCreateOrder()
  const { data: customers } = useCustomers()
  const { data: users } = useUsers()
  const { profile, can } = useAuth()
  const isAdmin = can('prices.view')   // price fields follow the permission, not the role

  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '')
  const [assignedTo, setAssignedTo] = useState('')
  const [plannedDate, setPlannedDate] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [orderType, setOrderType] = useState<'normal' | 'free_bottle_service'>('normal')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pre-fill order number with next auto-number
  useEffect(() => {
    getNextOrderNumber().then(setOrderNumber)
  }, [])

  // When order type changes, regenerate the order number
  async function handleOrderTypeChange(type: 'normal' | 'free_bottle_service') {
    setOrderType(type)
    if (type === 'free_bottle_service') {
      const num = await getNextFreeBottleOrderNumber()
      setOrderNumber(num)
      // Free bottle service: only 30ml table version, all prices 0
      const customer = customers?.find(c => c.id === customerId)
      const tableProduct = SPIKA_PRODUCTS.find(p => p.sku === 'oil-30ml-table')!
      setItems([{
        sku: tableProduct.sku,
        name: tableProduct.name,
        qty: 0,
        unit_price: 0,
        discount: 0,
        line_total: 0,
      }])
    } else {
      const num = await getNextOrderNumber()
      setOrderNumber(num)
      // Restore prices from customer profile
      const customer = customers?.find(c => c.id === customerId)
      if (customer) {
        setItems(buildItemsForCustomer(customer.product_prices ?? {}, customer.product_discounts ?? {}, customer.free_products ?? [], customer.active_products ?? []))
      }
    }
  }

  const selectedCustomer = customers?.find((c) => c.id === customerId)

  function handleCustomerChange(id: string) {
    setCustomerId(id)
    if (orderType === 'free_bottle_service') return // keep the single table-product item
    const customer = customers?.find((c) => c.id === id)
    setItems(buildItemsForCustomer(customer?.product_prices ?? {}, customer?.product_discounts ?? {}, customer?.free_products ?? [], customer?.active_products ?? []))
  }

  useEffect(() => {
    if (customerId && customers) {
      const customer = customers.find((c) => c.id === customerId)
      if (customer) setItems(buildItemsForCustomer(customer.product_prices ?? {}, customer.product_discounts ?? {}, customer.free_products ?? [], customer.active_products ?? []))
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

  const taxRate = selectedCustomer?.customer_category === 'b2c' ? B2C_TAX_RATE : B2B_TAX_RATE
  const taxLabel = selectedCustomer?.customer_category === 'b2c' ? 'VAT (6%)' : 'VAT (0% — B2B exempt)'

  const activeItems = items.filter((i) => i.qty > 0)
  const subtotal = activeItems.reduce((sum, i) => sum + i.line_total, 0)
  const tax = subtotal * taxRate
  const total = subtotal + tax

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) return toast.error('Select a customer')
    if (!assignedTo) return toast.error('Assign a worker')
    if (activeItems.length === 0) return toast.error('Set a quantity for at least one product')

    setIsSubmitting(true)
    try {
      const finalOrderNumber = orderNumber || (
        orderType === 'free_bottle_service'
          ? await getNextFreeBottleOrderNumber()
          : await getNextOrderNumber()
      )
      const order = await createOrder.mutateAsync({
        customer_id: customerId,
        items: activeItems,
        total,
        status: 'processing',
        assigned_to: assignedTo,
        planned_date: plannedDate || null,
        delivery_notes: '',
        order_number: finalOrderNumber,
        order_type: orderType,
        po_number: poNumber.trim() || null,
      } as any)
      toast.success('Delivery note created and assigned!')
      router.push(`/orders/${order.id}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">New Delivery Note</h1>

      {/* Order type toggle */}
      <div className="flex rounded-xl border overflow-hidden">
        <button
          type="button"
          onClick={() => handleOrderTypeChange('normal')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            orderType === 'normal'
              ? 'bg-red-600 text-white'
              : 'bg-card text-muted-foreground hover:bg-accent'
          }`}
        >
          Normal Order
        </button>
        <button
          type="button"
          onClick={() => handleOrderTypeChange('free_bottle_service')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors border-l ${
            orderType === 'free_bottle_service'
              ? 'bg-emerald-600 text-white'
              : 'bg-card text-muted-foreground hover:bg-accent'
          }`}
        >
          🎁 Free Bottle Service
        </button>
      </div>

      {orderType === 'free_bottle_service' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400">
          <span className="text-base">🎁</span>
          <div>
            <p className="font-semibold">Free Bottle Service</p>
            <p className="text-xs opacity-80">Uses F-YYYY-XXXX order numbers. All prices set to XCG 0.00.</p>
          </div>
        </div>
      )}

      {selectedCustomer?.ob_form_required && !selectedCustomer?.ob_form_signed && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-300 rounded-xl p-4">
          <span className="text-2xl shrink-0">⚠️</span>
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">OB Form Missing — {selectedCustomer.company_name}</p>
            <p className="text-sm text-red-600/80 mt-0.5">
              This customer has not signed the OB Declaratie Formulier 2026.{' '}
              <a href={`/customers/${selectedCustomer.id}/ob-sign`} className="underline font-medium">Sign now →</a>
            </p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">

        {/* Setup */}
        <Card>
          <CardHeader><CardTitle className="text-base">Delivery Note Setup</CardTitle></CardHeader>
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
                  {selectedCustomer.customer_category === 'b2c' ? '6% VAT applies' : 'Tax-exempt B2B — 0% VAT'}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Order Number</Label>
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Auto-generated"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Auto-filled with the next number — change it if needed</p>
            </div>

            <div className="space-y-1.5">
              <Label>PO Number <span className="text-muted-foreground text-xs font-normal">(optional — customer's purchase order reference)</span></Label>
              <Input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. PO-12345"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Assign to Worker *</Label>
              <Select value={assignedTo} onValueChange={(v) => v && setAssignedTo(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select worker">
                    {assignedTo
                      ? (() => { const u = users?.find(u => u.id === assignedTo); return u ? `${u.name}${u.role === 'admin' ? ' (Admin)' : ''}` : 'Select worker' })()
                      : 'Select worker'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {users?.filter(u => u.is_active !== false).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} {u.role === 'admin' ? '(Admin)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Planned Delivery Date</Label>
              <Input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-muted-foreground">Appears in the worker's Agenda</p>
            </div>
          </CardContent>
        </Card>

        {/* Products */}
        {items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Products</CardTitle>
              <p className="text-xs text-muted-foreground">
                Set the quantity for each product. Products with qty 0 are excluded.
                {isAdmin && ' Prices can be overridden as admin.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-0 divide-y">
              {items.map((item, i) => (
                <div key={item.sku} className="py-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className={`font-medium text-sm ${item.qty === 0 ? 'text-muted-foreground' : ''}`}>{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.sku}</p>
                    </div>
                    <p className="text-sm font-semibold whitespace-nowrap">
                      XCG {item.line_total.toFixed(2)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <QtyInput
                        value={item.qty}
                        onChange={(v) => updateQty(i, v)}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Price (XCG)</Label>
                      <PriceInput
                        value={item.unit_price}
                        onChange={(v) => updatePrice(i, v)}
                        className="h-8"
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Discount (XCG)</Label>
                      <PriceInput
                        value={item.discount}
                        onChange={(v) => updateDiscount(i, v)}
                        className="h-8"
                        disabled={!isAdmin}
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
                <div className="flex justify-between font-bold text-base">
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
          disabled={isSubmitting || activeItems.length === 0 || !assignedTo}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create & Assign Delivery Note
        </Button>
      </form>
    </div>
  )
}

export default function NewDeliveryNotePage() {
  return (
    <Suspense>
      <NewDeliveryNoteInner />
    </Suspense>
  )
}
