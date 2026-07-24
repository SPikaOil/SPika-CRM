'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, ShoppingBag, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QtyInput } from '@/components/ui/qty-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Order, Customer, QuoteItem } from '@/types'

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [order, setOrder] = useState<Order | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!profile?.customer_id) return
    loadOrder()
  }, [id, profile?.customer_id])

  async function loadOrder() {
    const [orderRes, customerRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single(),
      supabase
        .from('customers')
        .select('*')
        .eq('id', profile!.customer_id!)
        .single(),
    ])

    if (orderRes.data && orderRes.data.customer_id === profile?.customer_id) {
      const o = orderRes.data as Order
      setOrder(o)
      setNotes(o.delivery_notes ?? '')

      // Pre-fill quantities from existing order items
      const qtys: Record<string, number> = {}
      for (const item of (o.items as QuoteItem[])) {
        if (item.sku && item.qty > 0) qtys[item.sku] = item.qty
      }
      setQuantities(qtys)
    }

    if (customerRes.data) {
      setCustomer(customerRes.data as Customer)
    }

    setIsLoading(false)
  }

  function getPrice(sku: string) {
    if (!customer) return SPIKA_PRODUCTS.find(p => p.sku === sku)?.default_price ?? 0
    return customer.product_prices?.[sku] ?? SPIKA_PRODUCTS.find(p => p.sku === sku)?.default_price ?? 0
  }

  const activeItems = SPIKA_PRODUCTS
    .filter(p => (quantities[p.sku] ?? 0) > 0)
    .map(p => {
      const qty = quantities[p.sku] ?? 0
      const unit_price = getPrice(p.sku)
      return { sku: p.sku, name: p.name, qty, unit_price, line_total: qty * unit_price }
    })

  const isB2C = customer?.customer_category === 'b2c'
  const subtotal = activeItems.reduce((s, i) => s + i.line_total, 0)
  const tax = subtotal * (isB2C ? 0.06 : 0)
  const total = subtotal + tax

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (activeItems.length === 0) return toast.error('Add at least one product')
    if (!order) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/portal/orders/${id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: activeItems, total, delivery_notes: notes }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update order')
      }

      toast.success("Order updated — we'll confirm your changes shortly")
      router.replace(`/portal/orders/${id}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update order')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-red-600" />
    </div>
  )

  if (!order) return (
    <div className="space-y-4">
      <Link href={`/portal/orders/${id}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to order
      </Link>
      <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
        <CardContent className="pt-6 pb-6 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-red-600 mx-auto" />
          <p className="font-medium text-red-700">Order not found.</p>
        </CardContent>
      </Card>
    </div>
  )

  const canEdit = order.status === 'pending_approval' || order.status === 'processing'

  if (!canEdit) return (
    <div className="space-y-4">
      <Link href={`/portal/orders/${id}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to order
      </Link>
      <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
        <CardContent className="pt-6 pb-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-red-600 mx-auto" />
          <div>
            <p className="font-medium text-red-700">This order can no longer be edited.</p>
            <p className="text-sm text-red-600/80 mt-1">Orders can only be edited before they are out for delivery.</p>
          </div>
          <Link href={`/portal/orders/${id}`} className="inline-block text-sm text-red-600 hover:underline font-medium">
            Back to order
          </Link>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Back */}
      <Link href={`/portal/orders/${id}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to order
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Edit Order</h1>
        <p className="text-muted-foreground text-sm mt-0.5 font-mono">{order.order_number}</p>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-amber-700">Changing your order will require re-approval from our team.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> Products
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            {SPIKA_PRODUCTS.filter(p => p.default_price > 0).map((product) => {
              const qty = quantities[product.sku] ?? 0
              const price = getPrice(product.sku)
              return (
                <div key={product.sku} className="py-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium text-sm truncate ${qty === 0 ? 'text-muted-foreground' : ''}`}>{product.name}</p>
                      <p className="text-xs text-muted-foreground">XCG {price.toFixed(2)} each</p>
                    </div>
                    {qty > 0 && (
                      <p className="text-sm font-semibold text-red-600 shrink-0">
                        XCG {(qty * price).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantities(q => ({ ...q, [product.sku]: Math.max(0, (q[product.sku] ?? 0) - 1) }))}
                      className="h-8 w-8 rounded-lg border flex items-center justify-center text-lg font-bold hover:bg-accent transition-colors"
                    >−</button>
                    <QtyInput
                      value={qty}
                      onChange={v => setQuantities(q => ({ ...q, [product.sku]: Math.max(0, v) }))}
                      className="h-8 w-16 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantities(q => ({ ...q, [product.sku]: (q[product.sku] ?? 0) + 1 }))}
                      className="h-8 w-8 rounded-lg border flex items-center justify-center text-lg font-bold hover:bg-accent transition-colors"
                    >+</button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {activeItems.length > 0 && (
          <Card>
            <CardContent className="pt-4 space-y-2">
              <p className="text-sm font-semibold">Order Summary</p>
              <Separator />
              {activeItems.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.qty}× {item.name}</span>
                  <span>XCG {item.line_total.toFixed(2)}</span>
                </div>
              ))}
              <Separator />
              {isB2C && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VAT (6%)</span>
                  <span>XCG {tax.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span className="text-red-600">XCG {total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-1.5">
          <Label>Delivery notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any special requests or delivery instructions..."
            rows={3}
          />
        </div>

        <Button
          type="submit"
          className="w-full h-12 bg-red-600 hover:bg-red-700 text-base"
          disabled={submitting || activeItems.length === 0}
        >
          {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving changes…</> : 'Save Changes'}
        </Button>
      </form>
    </div>
  )
}
