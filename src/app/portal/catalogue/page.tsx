'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag, Loader2, Plus, Minus, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Customer } from '@/types'

// Product metadata — packaging & description per SKU
const PRODUCT_META: Record<string, { description: string; packaging: string; available: boolean }> = {
  'oil-100ml':             { description: 'Full-size SPika Oil bottle, ideal for retail and hospitality.', packaging: '12 bottles / carton', available: true },
  'oil-50ml':              { description: 'Mid-size SPika Oil bottle. Popular for restaurants and cafés.', packaging: '24 bottles / carton', available: true },
  'oil-30ml-table':        { description: 'Compact table version designed for on-table placement.', packaging: '48 bottles / carton', available: true },
  'spika2go-5ml':          { description: 'Pocket-size SPika2Go for on-the-go use. Great for retail.', packaging: '50 units / box', available: true },
  'spika2go-3ml':          { description: 'Mini SPika2Go format. Ideal for sampling and promotions.', packaging: '100 units / box', available: true },
  'spika2go-5ml-sample':   { description: 'Free sample version of SPika2Go 5ml.', packaging: '50 units / box', available: true },
  'oil-30ml-table-sample': { description: 'Free sample table bottle for customer trials.', packaging: '48 bottles / carton', available: true },
}

const ORDERABLE_SKUS = ['oil-100ml', 'oil-50ml', 'oil-30ml-table', 'spika2go-5ml', 'spika2go-3ml']

export default function PortalCataloguePage() {
  const { profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!profile?.customer_id) { setIsLoading(false); return }
    const load = () => supabase.from('customers').select('*').eq('id', profile.customer_id!).single()
      .then(({ data }) => { setCustomer(data as Customer); setIsLoading(false) })
    load()
    // Live-update if SPika admin changes this customer's products/prices
    const channel = supabase
      .channel('portal-catalogue')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers', filter: `id=eq.${profile.customer_id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.customer_id])

  function getPrice(sku: string): number {
    if (!customer) return SPIKA_PRODUCTS.find(p => p.sku === sku)?.default_price ?? 0
    return customer.product_prices?.[sku] ?? SPIKA_PRODUCTS.find(p => p.sku === sku)?.default_price ?? 0
  }

  function setQty(sku: string, val: number) {
    setQuantities(q => ({ ...q, [sku]: Math.max(0, val) }))
  }

  const cartItems = ORDERABLE_SKUS
    .filter(sku => (quantities[sku] ?? 0) > 0)
    .map(sku => ({ sku, qty: quantities[sku] }))

  const cartTotal = cartItems.reduce((sum, { sku, qty }) => sum + getPrice(sku) * qty, 0)

  function handleOrderCart() {
    // Encode cart into search params and go to new-order with pre-filled quantities
    const params = new URLSearchParams()
    for (const { sku, qty } of cartItems) {
      params.set(sku, String(qty))
    }
    router.push(`/portal/new-order?cart=${encodeURIComponent(JSON.stringify(quantities))}`)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-red-600" />
    </div>
  )

  // Only the products this customer is set up to order (their active_products
  // in customer settings). Legacy customers with no list fall back to all.
  const activeList = (customer as any)?.active_products as string[] | null | undefined
  const activeSet = activeList && activeList.length > 0 ? new Set(activeList) : null
  const displayProducts = SPIKA_PRODUCTS.filter(p => ORDERABLE_SKUS.includes(p.sku) && (!activeSet || activeSet.has(p.sku)))

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Products</h1>
        <p className="text-muted-foreground text-xs">Your personal prices are shown below.</p>
      </div>

      <div className="space-y-2">
        {displayProducts.map(product => {
          const price = getPrice(product.sku)
          const qty = quantities[product.sku] ?? 0
          const meta = PRODUCT_META[product.sku]

          return (
            <Card key={product.sku} className="py-0">
              <CardContent className="py-2.5 px-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{product.name}</p>
                      {qty > 0 && (
                        <Badge className="bg-red-100 text-red-700 text-[11px] px-1.5 py-0">
                          {qty} selected
                        </Badge>
                      )}
                    </div>
                    {meta && (
                      <p className="text-[11px] text-muted-foreground leading-snug">{meta.description}</p>
                    )}
                    {meta?.packaging && (
                      <p className="text-[11px] text-muted-foreground">📦 {meta.packaging}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-red-600 text-sm">XCG {price.toFixed(2)}</p>
                    <p className="text-[11px] text-muted-foreground">per unit</p>
                  </div>
                </div>

                {/* Quantity selector */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQty(product.sku, qty - 1)}
                    disabled={qty === 0}
                    className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-30"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <Input
                    type="number"
                    min="0"
                    value={qty}
                    onChange={e => setQty(product.sku, Number(e.target.value))}
                    className="h-8 w-14 text-center"
                  />
                  <button
                    onClick={() => setQty(product.sku, qty + 1)}
                    className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-accent transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  {qty > 0 && (
                    <p className="text-sm font-medium text-red-600 ml-2">
                      = XCG {(qty * price).toFixed(2)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Floating cart summary */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40">
          <div className="max-w-2xl mx-auto">
            <Card className="border-red-200 bg-red-600 text-white shadow-lg">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">
                      {cartItems.reduce((s, i) => s + i.qty, 0)} items · XCG {cartTotal.toFixed(2)}
                    </p>
                    <p className="text-xs text-red-100">
                      {cartItems.map(i => `${i.qty}× ${SPIKA_PRODUCTS.find(p => p.sku === i.sku)?.name?.split(' - ')[1] ?? i.sku}`).join(', ')}
                    </p>
                  </div>
                  <Button
                    onClick={handleOrderCart}
                    className="bg-white text-red-600 hover:bg-red-50 gap-1.5 shrink-0 h-9"
                    size="sm"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Order Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
