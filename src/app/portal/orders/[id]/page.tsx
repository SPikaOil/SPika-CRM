'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Clock, Truck, CheckCircle2, XCircle, Package, Loader2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Order, QuoteItem } from '@/types'

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string; description: string }> = {
  pending_approval: { label: 'Waiting for approval', icon: Clock,        color: 'bg-yellow-100 text-yellow-700', description: 'Your order has been received and is waiting for confirmation.' },
  processing:       { label: 'Order confirmed',      icon: CheckCircle2, color: 'bg-blue-100 text-blue-700',    description: 'Your order has been approved and is being prepared.' },
  out_for_delivery: { label: 'On its way!',           icon: Truck,        color: 'bg-orange-100 text-orange-700',description: 'Your order is out for delivery.' },
  delivered:        { label: 'Delivered',             icon: CheckCircle2, color: 'bg-green-100 text-green-700', description: 'Your order has been delivered. Thank you!' },
  invoice_ready:    { label: 'Delivered',             icon: CheckCircle2, color: 'bg-green-100 text-green-700', description: 'Your order has been delivered. Thank you!' },
  invoice_blocked:  { label: 'Issue with order',      icon: XCircle,      color: 'bg-red-100 text-red-700',     description: 'There is an issue with your order. Please contact us.' },
}

const STEPS = [
  { key: 'pending_approval', label: 'Received' },
  { key: 'processing',       label: 'Confirmed' },
  { key: 'out_for_delivery', label: 'On its way' },
  { key: 'delivered',        label: 'Delivered' },
]

const stepIndex = (status: string) => {
  if (status === 'invoice_ready') return 3
  return STEPS.findIndex(s => s.key === status)
}

export default function PortalOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    loadOrder()

    const channel = supabase
      .channel(`portal-order-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => loadOrder())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function loadOrder() {
    const { data } = await supabase.from('orders').select('*').eq('id', id).single()
    if (data && data.customer_id === profile?.customer_id) {
      setOrder(data as Order)
    }
    setIsLoading(false)
  }

  async function handleCancel() {
    if (!order) return
    setCancelling(true)
    const { error } = await supabase.from('orders').update({ status: 'invoice_blocked' } as any).eq('id', order.id)
    if (error) {
      toast.error('Could not cancel order. Please contact us.')
    } else {
      toast.success('Order cancelled.')
      setShowConfirm(false)
      loadOrder()
    }
    setCancelling(false)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-red-600" />
    </div>
  )

  if (!order) return (
    <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
      <Package className="h-10 w-10 opacity-20" />
      <p>Order not found.</p>
    </div>
  )

  const status = statusConfig[order.status] ?? { label: order.status, icon: Package, color: 'bg-gray-100 text-gray-700', description: '' }
  const Icon = status.icon
  const items = (order.items as QuoteItem[]).filter(i => i.qty > 0)
  const currentStep = stepIndex(order.status)
  const canCancel = order.status === 'pending_approval'

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        My Orders
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono font-bold text-lg">{order.order_number || 'Order'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(order.created_at).toLocaleDateString('nl', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Badge className={`${status.color} flex items-center gap-1`}>
          <Icon className="h-3.5 w-3.5" />
          {status.label}
        </Badge>
      </div>

      {/* Status description */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-muted-foreground">{status.description}</p>

          {/* Progress steps */}
          {order.status !== 'invoice_blocked' && (
            <div className="mt-4 flex items-center gap-0">
              {STEPS.map((step, i) => {
                const done = currentStep >= i
                const active = currentStep === i
                return (
                  <div key={step.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`h-3 w-3 rounded-full border-2 transition-colors ${done ? 'bg-red-600 border-red-600' : 'bg-background border-muted-foreground/30'} ${active ? 'ring-2 ring-red-200' : ''}`} />
                      <span className={`text-[10px] font-medium whitespace-nowrap ${done ? 'text-red-600' : 'text-muted-foreground/50'}`}>{step.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`h-0.5 flex-1 mb-4 transition-colors ${currentStep > i ? 'bg-red-600' : 'bg-muted'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Planned delivery */}
          {order.planned_date && (order.status === 'processing' || order.status === 'out_for_delivery') && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Truck className="h-3.5 w-3.5 shrink-0" />
              Planned delivery: {new Date(order.planned_date + 'T12:00:00').toLocaleDateString('nl', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Order Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 pb-4">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.qty}× {item.name}</span>
              <span className="font-medium">XCG {item.line_total.toFixed(2)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="text-red-600">XCG {Number(order.total).toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Cancel */}
      {canCancel && !showConfirm && (
        <Button
          variant="outline"
          className="w-full border-red-200 text-red-600 hover:bg-red-50"
          onClick={() => setShowConfirm(true)}
        >
          Cancel Order
        </Button>
      )}

      {showConfirm && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-700">Cancel this order?</p>
                <p className="text-sm text-red-600/80 mt-0.5">This cannot be undone. The order will be marked as cancelled.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)} disabled={cancelling}>
                Keep Order
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, Cancel'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
