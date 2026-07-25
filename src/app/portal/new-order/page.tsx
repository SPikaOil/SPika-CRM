'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, ShoppingBag, CheckCircle2, FileSignature, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
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
import { Customer } from '@/types'

export default function NewOrderPage() {
  return <Suspense><NewOrderPageInner /></Suspense>
}

function NewOrderPageInner() {
  const { profile } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!profile?.customer_id) return
    supabase.from('customers').select('*').eq('id', profile.customer_id).single()
      .then(({ data }) => setCustomer(data as Customer))

    // Pre-fill from a previous order if ?reorder=<id>
    const reorderId = searchParams.get('reorder')
    if (reorderId) {
      supabase.from('orders').select('items').eq('id', reorderId).single().then(({ data }) => {
        if (!data?.items) return
        const qtys: Record<string, number> = {}
        for (const item of data.items as any[]) {
          if (item.sku && item.qty > 0) qtys[item.sku] = item.qty
        }
        setQuantities(qtys)
      })
    }

    // Pre-fill from catalogue cart if ?cart=<json>
    const cartParam = searchParams.get('cart')
    if (cartParam) {
      try {
        const qtys = JSON.parse(decodeURIComponent(cartParam))
        setQuantities(qtys)
      } catch { /* ignore malformed */ }
    }
  }, [profile?.customer_id])

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
    if (activeItems.length === 0) return toast.error('Voeg minimaal één product toe')
    if (!profile?.customer_id) return toast.error(`Geen klantprofiel gekoppeld aan dit account (user id: ${profile?.id})`)

    setSubmitting(true)
    try {
      // This is a REQUEST, not a real order yet — no order number and no
      // delivery date. SPika admin assigns those when they process it.
      const { error } = await supabase.from('orders').insert({
        customer_id: profile.customer_id,
        order_number: null,
        items: activeItems,
        total,
        status: 'pending_approval',
        delivery_notes: notes,
        assigned_to: null,
        planned_date: null,
      })

      if (error) throw error

      // Notify the admin AND acknowledge to the customer (fire-and-forget).
      // customerEmail is what turns this into a receipt for the customer too —
      // without it they heard nothing until an admin approved, possibly a day later.
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order_placed',
          payload: {
            customerName: customer?.company_name ?? 'Unknown',
            customerEmail: customer?.email ?? null,
            billingEmails: customer?.billing_emails ?? [],
            total: `XCG ${total.toFixed(2)}`,
            items: activeItems.map(i => `${i.qty}× ${i.name}`).join(', '),
          },
        }),
      }).catch(() => {})

      setSubmitted(true)
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to submit order')
    } finally {
      setSubmitting(false)
    }
  }

  // Block ordering if OB form is required but not signed
  if (customer && customer.ob_form_required && !customer.ob_form_signed) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 space-y-5 px-4">
        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="h-9 w-9 text-red-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">OB Form Required</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            Before you can place an order, you need to sign the OB Declaratie Formulier 2026.
            This is a one-time legal requirement.
          </p>
        </div>
        <Link href={`/portal/ob-sign`}>
          <Button className="bg-red-600 hover:bg-red-700 gap-2 h-12 px-6">
            <FileSignature className="h-4 w-4" />
            Sign OB Form Now
          </Button>
        </Link>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 space-y-4">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Order aangevraagd!</h2>
          <p className="text-muted-foreground mt-1 text-sm">We bevestigen je bestelling zo snel mogelijk.</p>
        </div>
        <Button
          className="mt-4 bg-red-600 hover:bg-red-700"
          onClick={() => router.push('/portal')}
        >
          Terug naar mijn orders
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">New Order</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Select your products and we'll confirm your order shortly.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Products</CardTitle></CardHeader>
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
          <Label>Notes (optional)</Label>
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
          {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : 'Submit Order Request'}
        </Button>
      </form>
    </div>
  )
}
