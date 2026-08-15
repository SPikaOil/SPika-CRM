'use client'

import { useState } from 'react'
import { Download, Loader2, FileText, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { Transport, Order } from '@/types'
import { CompanyInfo } from '@/components/pdf/delivery-note-pdf'
import { buildLabelPages, colliQrText, transportCargo } from '@/lib/transport-cargo'
import { toast } from 'sonner'

type PerOrder = 'commercial_invoice' | 'packing_list'
type PerTransport = 'bl' | 'shipping_label'

/**
 * The customs paperwork for a transport.
 *
 * Commercial Invoice and Packing List are per ORDER — customs wants one per
 * consignee, and a transport can carry several. The B/L and the shipping labels
 * are per TRANSPORT: the carrier receives one load, and the labels are numbered
 * across it (Colli 1/4 … 4/4).
 */
export function TransportDocuments({ transport }: { transport: Transport }) {
  const [busy, setBusy] = useState<string | null>(null)
  const orders = transport.orders ?? []
  const cargo = transportCargo(transport)

  async function company(): Promise<CompanyInfo | undefined> {
    const supabase = createClient()
    const { data } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single()
    return data ?? undefined
  }

  function safe(s: string) {
    return (s ?? '').replace(/[#/\\:*?"<>|]/g, '').trim()
  }

  async function buildOrderDoc(type: PerOrder, order: Order, co?: CompanyInfo) {
    const React = await import('react')
    if (type === 'commercial_invoice') {
      const { CommercialInvoicePDF } = await import('@/components/pdf/exports/commercial-invoice-pdf')
      const b = await (await import('@/lib/order-batches')).fetchOrderBatches(order.id)
      return React.createElement(CommercialInvoicePDF, { transport, order, company: co, batches: b })
    }
    const { PackingListPDF } = await import('@/components/pdf/exports/packing-list-pdf')
    const b = await (await import('@/lib/order-batches')).fetchOrderBatches(order.id)
    return React.createElement(PackingListPDF, { transport, order, company: co, batches: b })
  }

  async function buildTransportDoc(type: PerTransport, co?: CompanyInfo) {
    const React = await import('react')
    if (type === 'bl') {
      const { DonAndresBLPDF } = await import('@/components/pdf/exports/don-andres-bl-pdf')
      return React.createElement(DonAndresBLPDF, { transport, company: co })
    }
    const { ShippingLabelPDF } = await import('@/components/pdf/exports/shipping-label-pdf')
    const QRCode = (await import('qrcode')).default
    // Batches are per order, so they are fetched once per order and then handed
    // to every label of that order — a box names the batches inside it.
    const { fetchOrderBatches } = await import('@/lib/order-batches')
    const perOrder = new Map<string, Awaited<ReturnType<typeof fetchOrderBatches>>>()
    for (const o of orders) perOrder.set(o.id, await fetchOrderBatches(o.id))
    const pages = await Promise.all(
      buildLabelPages(transport).map(async (p) => ({
        ...p,
        qrCodeDataUrl: await QRCode.toDataURL(
          colliQrText(transport, p, perOrder.get(p.order.id)),
          { margin: 1, width: 240 },
        ),
      }))
    )
    return React.createElement(ShippingLabelPDF, { transport, pages, company: co })
  }

  async function download(key: string, build: (co?: CompanyInfo) => Promise<any>, filename: string) {
    setBusy(key)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const co = await company()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf((await build(co)) as any).toBlob()
      const { triggerDownload } = await import('@/lib/download-pdf')
      triggerDownload(blob, filename)
    } catch (err) {
      // Never fail silently — a missing document is how a container leaves
      // without its paperwork.
      toast.error(err instanceof Error ? err.message : 'Could not generate this document')
      console.error(err)
    } finally {
      setBusy(null)
    }
  }

  async function downloadAll() {
    setBusy('all')
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const JSZip = (await import('jszip')).default
      const co = await company()
      const zip = new JSZip()
      const base = safe(transport.transport_number)

      for (const order of orders) {
        const name = safe(order.customer?.company_name ?? '')
        const stem = `${safe(order.order_number)}${name ? ` - ${name}` : ''}`
        zip.file(`${stem} - Commercial Invoice.pdf`,
          await pdf((await buildOrderDoc('commercial_invoice', order, co)) as any).toBlob())
        zip.file(`${stem} - Packing List.pdf`,
          await pdf((await buildOrderDoc('packing_list', order, co)) as any).toBlob())
      }

      zip.file(`${base} - Bill of Lading.pdf`, await pdf((await buildTransportDoc('bl', co)) as any).toBlob())
      if (cargo.colli > 0) {
        zip.file(`${base} - Shipping Labels.pdf`,
          await pdf((await buildTransportDoc('shipping_label', co)) as any).toBlob())
      }

      const { triggerDownload } = await import('@/lib/download-pdf')
      triggerDownload(await zip.generateAsync({ type: 'blob' }), `${base} - Export Package.zip`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate the package')
      console.error(err)
    } finally {
      setBusy(null)
    }
  }

  const spinner = (key: string) =>
    busy === key ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />

  return (
    <Card size="sm">
      <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Put an order on this transport first</p>
        ) : (
          <>
            {/* Per order — customs wants one set per consignee */}
            <div className="space-y-2">
              {orders.map(order => {
                const name = safe(order.customer?.company_name ?? '')
                const stem = `${safe(order.order_number)}${name ? ` - ${name}` : ''}`
                return (
                  <div key={order.id} className="rounded-lg border p-2.5 space-y-1.5">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      {order.order_number} — {order.customer?.company_name}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        disabled={!!busy}
                        onClick={() => download(`ci-${order.id}`,
                          co => buildOrderDoc('commercial_invoice', order, co),
                          `${stem} - Commercial Invoice.pdf`)}>
                        {spinner(`ci-${order.id}`)}Commercial Invoice
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        disabled={!!busy}
                        onClick={() => download(`pl-${order.id}`,
                          co => buildOrderDoc('packing_list', order, co),
                          `${stem} - Packing List.pdf`)}>
                        {spinner(`pl-${order.id}`)}Packing List
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Per transport — one load, one B/L, labels numbered across it */}
            <div className="rounded-lg border p-2.5 space-y-1.5">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Whole transport
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  disabled={!!busy}
                  onClick={() => download('bl', co => buildTransportDoc('bl', co),
                    `${safe(transport.transport_number)} - Bill of Lading.pdf`)}>
                  {spinner('bl')}B/L
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  disabled={!!busy || cargo.colli === 0}
                  onClick={() => download('label', co => buildTransportDoc('shipping_label', co),
                    `${safe(transport.transport_number)} - Shipping Labels.pdf`)}>
                  {spinner('label')}
                  Shipping Labels{cargo.colli > 0 ? ` (${cargo.colli})` : ''}
                </Button>
              </div>
              {cargo.colli === 0 && (
                <p className="text-xs text-red-600">
                  No labels yet — pack the orders out into colli first
                </p>
              )}
            </div>

            <Button className="w-full bg-red-600 hover:bg-red-700" disabled={!!busy} onClick={downloadAll}>
              {busy === 'all' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download All (ZIP)
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
