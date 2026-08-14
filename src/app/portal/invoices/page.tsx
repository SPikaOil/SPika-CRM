'use client'

import { useEffect, useState } from 'react'
import { FileText, Loader2, CheckCircle2, Clock, Download, Package } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Order, QuoteItem } from '@/types'

export default function PortalInvoicesPage() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [customer, setCustomer] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!profile?.customer_id) { setIsLoading(false); return }
    loadData()
  }, [profile?.customer_id])

  async function loadData() {
    const [ordersRes, custRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*')
        .eq('customer_id', profile!.customer_id!)
        .in('status', ['delivered', 'invoice_ready', 'paid'])
        .order('created_at', { ascending: false }),
      supabase.from('customers').select('*').eq('id', profile!.customer_id!).single(),
    ])
    setOrders((ordersRes.data ?? []) as Order[])
    setCustomer(custRes.data)
    setIsLoading(false)
  }

  async function handleDownload(order: Order) {
    setDownloading(order.id)
    try {
      const React = await import('react')
      const { pdf } = await import('@react-pdf/renderer')
      const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')
      const { data: companyData } = await supabase.from('company_settings').select('*').eq('id', '00000000-0000-0000-0000-000000000001').single()

      const blob = await (pdf as any)(
        React.createElement(DeliveryNotePDF as any, {
          order: { ...order, customer },
          batches: await (await import('@/lib/order-batches')).fetchOrderBatches(order?.id),
          showPrices: true,
          company: companyData ?? undefined,
          documentType: 'INVOICE',
        })
      ).toBlob()

      const { triggerDownload, documentFilename } = await import('@/lib/download-pdf')
      triggerDownload(blob, documentFilename(order.order_number ?? order.id.slice(0, 8), customer?.company_name))
    } catch {
      toast.error('Failed to download invoice')
    } finally {
      setDownloading(null)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-red-600" />
    </div>
  )

  const paymentTermDays = customer?.payment_term_days ?? 7
  // The invoice currency lives on the order; the customer is the fallback (051).
  const currencyOf = (order: any) => order?.currency ?? customer?.currency ?? 'XCG'

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">My Invoices</h1>
        <p className="text-muted-foreground text-xs">{orders.length} invoice{orders.length !== 1 ? 's' : ''}</p>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
          <Package className="h-12 w-12 opacity-20" />
          <p className="font-medium">No invoices yet</p>
          <p className="text-sm">Invoices appear here after your orders are delivered.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => {
            const isPaid = order.status === 'paid'
            const invoiceDateRaw = (order as any).invoice_date ?? order.planned_date
            const invoiceDue = invoiceDateRaw
              ? (() => { const d = new Date(invoiceDateRaw + 'T12:00:00'); d.setDate(d.getDate() + paymentTermDays); return d })()
              : null
            const isOverdue = invoiceDue && !isPaid && invoiceDue < new Date()
            const items = (order.items as QuoteItem[]).filter(i => i.qty > 0)

            return (
              <Card key={order.id} className={`py-0 ${isOverdue ? 'border-red-300' : ''}`}>
                <CardContent className="py-2.5 px-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono text-sm font-semibold">{order.order_number}</p>
                        {/* A credit note sits between the invoices and has to
                            say what it is — the amount alone is negative and
                            that is not enough of a signal. */}
                        {(order as any).order_type === 'credit_note' && (
                          <Badge className="bg-red-100 text-red-700 text-[11px] px-1.5 py-0">Credit note</Badge>
                        )}
                        {(order as any).order_type === 'credit_note' ? null : isPaid ? (
                          <Badge className="bg-green-100 text-green-700 flex items-center gap-1 text-[11px] px-1.5 py-0">
                            <CheckCircle2 className="h-3 w-3" /> Paid
                          </Badge>
                        ) : isOverdue ? (
                          <Badge className="bg-red-100 text-red-700 flex items-center gap-1 text-[11px] px-1.5 py-0">
                            <Clock className="h-3 w-3" /> Overdue
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-700 flex items-center gap-1 text-[11px] px-1.5 py-0">
                            <Clock className="h-3 w-3" /> Open
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString('nl', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <p className="font-bold text-red-600 text-sm shrink-0">{currencyOf(order)} {Number(order.total).toFixed(2)}</p>
                  </div>

                  <div className="space-y-0.5">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-muted-foreground">
                        <span className="truncate">{item.qty}× {item.name}</span>
                        <span className="shrink-0">{currencyOf(order)} {item.line_total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {invoiceDue && !isPaid && (
                    <p className={`text-[11px] ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {isOverdue ? 'Was due' : 'Due'}: {invoiceDue.toLocaleDateString('nl', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-0.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 flex-1"
                      disabled={downloading === order.id}
                      onClick={() => handleDownload(order)}
                    >
                      {downloading === order.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Download className="h-3.5 w-3.5" />
                      }
                      Download Invoice
                    </Button>
                    <Link href={`/portal/orders/${order.id}`} className="flex-1">
                      <Button variant="ghost" size="sm" className="w-full gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        View Order
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
