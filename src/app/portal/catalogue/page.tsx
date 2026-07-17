'use client'

import { useEffect, useState } from 'react'
import { Loader2, MessageCircle, Package } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Customer } from '@/types'

// Product metadata — packaging & description per SKU
const PRODUCT_META: Record<string, { description: string; packaging: string }> = {
  'oil-100ml':      { description: 'Full-size SPika Oil bottle, ideal for retail and hospitality.', packaging: '12 bottles / carton' },
  'oil-50ml':       { description: 'Mid-size SPika Oil bottle. Popular for restaurants and cafés.', packaging: '24 bottles / carton' },
  'oil-30ml-table': { description: 'Compact table version designed for on-table placement.', packaging: '48 bottles / carton' },
  'spika2go-5ml':   { description: 'Pocket-size SPika2Go for on-the-go use. Great for retail.', packaging: '50 units / box' },
  'spika2go-3ml':   { description: 'Mini SPika2Go format. Ideal for sampling and promotions.', packaging: '100 units / box' },
}

const ORDERABLE_SKUS = ['oil-100ml', 'oil-50ml', 'oil-30ml-table', 'spika2go-5ml', 'spika2go-3ml']

export default function PortalCataloguePage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [customer, setCustomer] = useState<Customer | null>(null)
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
    return customer?.product_prices?.[sku] ?? SPIKA_PRODUCTS.find(p => p.sku === sku)?.default_price ?? 0
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-red-600" />
    </div>
  )

  // Only the products contracted for this customer (their active_products) — never all.
  const activeSet = new Set((customer as any)?.active_products ?? [])
  const displayProducts = SPIKA_PRODUCTS.filter(p => ORDERABLE_SKUS.includes(p.sku) && activeSet.has(p.sku))

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Products</h1>
        <p className="text-muted-foreground text-xs">The products contracted for your account, with your prices.</p>
      </div>

      {displayProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
          <Package className="h-10 w-10 opacity-20" />
          <p className="text-sm">No products on your account yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayProducts.map(product => {
            const meta = PRODUCT_META[product.sku]
            return (
              <Card key={product.sku} className="py-0">
                <CardContent className="py-2.5 px-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{product.name}</p>
                    {meta && <p className="text-[11px] text-muted-foreground leading-snug">{meta.description}</p>}
                    {meta?.packaging && <p className="text-[11px] text-muted-foreground">📦 {meta.packaging}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-red-600 text-sm">XCG {getPrice(product.sku).toFixed(2)}</p>
                    <p className="text-[11px] text-muted-foreground">per unit</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Contracted-items note */}
      <Card className="py-0 border-dashed">
        <CardContent className="py-3 px-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">These are all the products contracted for your account.</p>
            <p className="text-xs text-muted-foreground mt-0.5">Want to add other products to your account? Get in touch and we'll set it up for you.</p>
          </div>
          <Link href="/portal/support" className="shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5">
              <MessageCircle className="h-4 w-4" />
              Contact us
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
