'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, Truck, CheckCircle2, XCircle, Package, Loader2, AlertTriangle, MapPin, CreditCard, Calendar, FileText, Phone, Mail, RotateCcw, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Order, QuoteItem } from '@/types'
import { ReportProblem } from '../../_components/report-problem'

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string; description: string }> = {
  pending_approval: { label: 'Waiting for approval', icon: Clock,        color: 'bg-yellow-100 text-yellow-700', description: 'Your order has been received and is waiting for confirmation. We\'ll update you shortly.' },
  processing:       { label: 'Order confirmed',      icon: CheckCircle2, color: 'bg-blue-100 text-blue-700',    description: 'Your order has been approved and is being prepared for delivery.' },
  out_for_delivery: { label: 'On its way!',           icon: Truck,        color: 'bg-orange-100 text-orange-700',description: 'Your order is out for delivery. Please make sure someone is available to receive it.' },
  delivered:        { label: 'Delivered',             icon: CheckCircle2, color: 'bg-green-100 text-green-700', description: 'Your order has been delivered. Thank you for your business!' },
  invoice_ready:    { label: 'Delivered',             icon: CheckCircle2, color: 'bg-green-100 text-green-700', description: 'Your order has been delivered. An invoice has been sent for payment.' },
  invoice_blocked:  { label: 'Issue with order',      icon: XCircle,      color: 'bg-red-100 text-red-700',     description: 'There is an issue with your order. Please contact us directly.' },
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

const fmtDate = (d: string, opts?: Intl.DateTimeFormatOptions) =>
  new Date(d + 'T12:00:00').toLocaleDateString('nl', opts ?? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export default function PortalOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [order, setOrder] = useState<Order | null>(null)
  const [customer, setCustomer] = useState<any>(null)
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
    const { data } = await supabase
      .from('orders')
      // The runs come along: a consignment contract arrives in parts, and the
      // customer needs to see which part landed when.
      .select('*, customer:customers(*), deliveries:deliveries(*)')
      .eq('id', id)
      .single()
    // TEMPORARY: an admin with ?preview=1 may look at this page to check what a
    // customer sees. Remove together with the layout bypass.
    const adminPreview = profile?.role === 'admin'
      && new URLSearchParams(window.location.search).get('preview') === '1'
    if (data && (data.customer_id === profile?.customer_id || adminPreview)) {
      setOrder(data as Order)
      setCustomer((data as any).customer)
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
  // Stamped on the order itself (051), so an old order keeps its own currency.
  const currency = (order as any).currency ?? 'XCG'
  const currentStep = stepIndex(order.status)
  const canCancel = order.status === 'pending_approval'

  const paymentTermDays = customer?.payment_term_days ?? 7
  const isCash = (order as any).payment_type === 'cash'

  // Invoice due date — based on invoice_date or planned_date
  const invoiceDateRaw = (order as any).invoice_date ?? order.planned_date
  const invoiceDue = invoiceDateRaw
    ? (() => { const d = new Date(invoiceDateRaw + 'T12:00:00'); d.setDate(d.getDate() + paymentTermDays); return d })()
    : null

  const deliveryAddr = customer?.delivery_address as any
  const billingAddr = customer?.billing_address as any
  const addr = deliveryAddr?.street ? deliveryAddr : billingAddr

  const isDelivered = ['delivered', 'invoice_ready'].includes(order.status)

  return (
    <div className="space-y-4">
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
            Placed on {new Date(order.created_at).toLocaleDateString('nl', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Badge className={`${status.color} flex items-center gap-1`}>
          <Icon className="h-3.5 w-3.5" />
          {status.label}
        </Badge>
      </div>

      {/* Status + progress */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-4">
          <p className="text-sm text-muted-foreground">{status.description}</p>

          {order.status !== 'invoice_blocked' && (
            <div className="flex items-center gap-0">
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

          {/* Delivery date */}
          {order.planned_date && !isDelivered && order.status !== 'invoice_blocked' && (
            <div className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg px-3 py-2.5">
              <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
              <div>
                <p className="font-medium text-blue-700 dark:text-blue-400">Expected delivery</p>
                <p className="text-blue-600/80 dark:text-blue-500 text-xs mt-0.5 capitalize">{fmtDate(order.planned_date)}</p>
              </div>
            </div>
          )}

          {/* Delivered date */}
          {isDelivered && order.planned_date && (
            <div className="flex items-center gap-2 text-sm bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">Delivered on</p>
                <p className="text-green-600/80 dark:text-green-500 text-xs mt-0.5 capitalize">{fmtDate(order.planned_date)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order details */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Order Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 pb-4">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.qty}× {item.name}</span>
              <span className="font-medium">{currency} {item.line_total.toFixed(2)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="text-red-600">{currency} {Number(order.total).toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {/* What has arrived, and what is still to come. An order can be delivered
          in parts, so the customer sees each run rather than one lump. */}
      {(() => {
        const runs = [...((order as any).deliveries ?? [])]
          .filter((d: any) => d.delivered_at)
          .sort((a: any, b: any) => String(a.delivered_at).localeCompare(String(b.delivered_at)))

        const delivered = new Map<string, number>()
        for (const run of runs) {
          const lines = (run.items ?? []) as any[]
          const source = lines.length > 0 ? lines : items
          for (const it of source) delivered.set(it.sku, (delivered.get(it.sku) ?? 0) + it.qty)
        }

        const rows = items.filter(i => i.qty > 0).map(i => ({
          ...i,
          delivered: delivered.get(i.sku) ?? 0,
        }))
        const totalOrdered = rows.reduce((s, r) => s + r.qty, 0)
        const totalDelivered = rows.reduce((s, r) => s + r.delivered, 0)

        if (totalOrdered === 0) return null

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Deliveries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              <div className="space-y-1">
                {rows.map(r => (
                  <div key={r.sku} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex-1 min-w-0 truncate text-muted-foreground">{r.name}</span>
                    <span className="shrink-0">
                      <span className={r.delivered < r.qty ? 'text-amber-600 font-medium' : 'font-medium'}>
                        {r.delivered}
                      </span>
                      <span className="text-muted-foreground"> of {r.qty} delivered</span>
                    </span>
                  </div>
                ))}
                <Separator className="my-1" />
                <div className="flex justify-between text-sm font-bold">
                  <span>Total</span>
                  <span>
                    {totalDelivered} of {totalOrdered}
                    {totalDelivered < totalOrdered && (
                      <span className="text-amber-600"> · {totalOrdered - totalDelivered} to come</span>
                    )}
                  </span>
                </div>
              </div>

              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing delivered yet.</p>
              ) : (
                <div className="space-y-2">
                  {runs.map((run: any, i: number) => {
                    const lines = ((run.items ?? []) as any[]).length > 0 ? run.items : items
                    return (
                      <div key={run.id} className="rounded-lg border p-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            Delivery {i + 1}
                            {runs.length > 1 && <span className="text-muted-foreground"> of {runs.length}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(run.delivered_at).toLocaleDateString('en', {
                              day: 'numeric', month: 'long', year: 'numeric',
                            })}
                          </p>
                        </div>
                        {(lines as any[]).map((it: any) => (
                          <div key={it.sku} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{it.name}</span>
                            <span className="font-medium">{it.qty}</span>
                          </div>
                        ))}
                        {run.signer_name && (
                          <p className="text-xs text-muted-foreground pt-0.5">
                            Signed by {run.signer_name}
                          </p>
                        )}
                        <ReportProblem
                          orderId={order.id}
                          customerId={order.customer_id}
                          delivery={run}
                          fallbackItems={items}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* Payment info */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Payment</CardTitle></CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Payment method</span>
            <span className="font-medium">{isCash ? 'Cash' : `Invoice (${paymentTermDays}-day terms)`}</span>
          </div>
          {(order as any).po_number && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> PO Number</span>
              <span className="font-medium font-mono">{(order as any).po_number}</span>
            </div>
          )}
          {!isCash && invoiceDue && isDelivered && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Payment due</span>
              <span className="font-medium">{invoiceDue.toLocaleDateString('nl', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery address */}
      {addr?.street && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Delivery Address</CardTitle></CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-muted-foreground space-y-0.5">
                {customer?.company_name && <p className="font-medium text-foreground">{customer.company_name}</p>}
                {addr.street && <p>{addr.street}</p>}
                {addr.city && <p>{addr.city}{addr.zip ? ` ${addr.zip}` : ''}</p>}
                {addr.country && <p>{addr.country}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Need help?</CardTitle></CardHeader>
        <CardContent className="space-y-2 pb-4">
          <p className="text-sm text-muted-foreground">Questions about your order? Contact us directly.</p>
          <div className="flex flex-col gap-2">
            <a href="mailto:hello@spikaoil.nl" className="flex items-center gap-2 text-sm text-red-600 hover:underline">
              <Mail className="h-3.5 w-3.5" /> hello@spikaoil.nl
            </a>
            {/* WhatsApp rather than a phone call — it is how customers on
                Curacao actually reach us, and lucide has no brand icons. */}
            <a
              href="https://wa.me/59996896969"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-red-600 hover:underline"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.174-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              +5999 689-6969
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Reorder */}
      {isDelivered && (
        <Link
          href={`/portal/new-order?reorder=${order.id}`}
          className="block"
        >
          <Button variant="outline" className="w-full gap-2">
            <RotateCcw className="h-4 w-4" />
            Reorder — same products
          </Button>
        </Link>
      )}

      {/* Edit Order */}
      {(order.status === 'pending_approval' || order.status === 'processing') && (
        <Link href={`/portal/orders/${order.id}/edit`}>
          <Button variant="outline" className="w-full gap-2">
            <Pencil className="h-4 w-4" />
            Edit Order
          </Button>
        </Link>
      )}

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
