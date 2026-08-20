'use client'

import { useState } from 'react'
import { Download, Loader2, FileText, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { Transport } from '@/types'
import { CompanyInfo } from '@/components/pdf/delivery-note-pdf'
import { buildLabelPages, colliQrText, transportCargo, weightsBySku, hsCodesBySku } from '@/lib/transport-cargo'
import { useProducts } from '@/hooks/use-products'
import { toast } from 'sonner'

type PerTransport = 'commercial_invoice' | 'packing_list' | 'bl' | 'shipping_label'

/**
 * The customs paperwork for a transport.
 *
 * Every document here is per TRANSPORT. The carrier receives one load: the B/L
 * declares it, the labels are numbered across it (Colli 1/4 … 4/4), the packing
 * list says what is in it and who receives it, and the commercial invoice puts
 * a value on exactly that same load.
 *
 * Both the packing list and the invoice used to be per ORDER, which meant a
 * separate set per reseller for one shipment and an order's full quantity on a
 * paper describing a part shipment. Her rule, 2026-08-19: "de order is niet
 * leidend in een transport." The orders behind a load still set the prices;
 * they set nothing else.
 */
export function TransportDocuments({ transport }: { transport: Transport }) {
  const [busy, setBusy] = useState<string | null>(null)
  const orders = transport.orders ?? []
  const cargo = transportCargo(transport)

  // What a bottle weighs, per sku. The gross weight on the packing list and the
  // B/L is the packaging typed on each colli plus the bottles inside it, so the
  // documents need the Products screen. Her instruction of 2026-08-19.
  const { data: products } = useProducts()
  const productWeights = weightsBySku(products)
  // Both customs codes per sku; the invoice picks one by destination (097).
  const hsCodes = hsCodesBySku(products)

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

  /**
   * The batches on this load, as one map — a document has one row per product,
   * not one per order.
   *
   * Read off the TRANSPORT since 2026-08-19: the bottles leave Curaçao when they
   * are loaded, so that is where the batch is chosen. The orders are still
   * merged in behind it, so a transport loaded under the old rule keeps printing
   * its batch numbers.
   */
  async function transportBatches() {
    const { fetchOrderBatches, fetchTransportBatches, mergeBatches } =
      await import('@/lib/order-batches')
    const fromLoad = await fetchTransportBatches(transport.id)
    if (Object.keys(fromLoad).length > 0) return fromLoad
    return mergeBatches(await Promise.all(orders.map(o => fetchOrderBatches(o.id))))
  }

  async function buildTransportDoc(type: PerTransport, co?: CompanyInfo) {
    const React = await import('react')
    if (type === 'commercial_invoice') {
      const { CommercialInvoicePDF } = await import('@/components/pdf/exports/commercial-invoice-pdf')
      return React.createElement(CommercialInvoicePDF, {
        transport, company: co, batches: await transportBatches(), hsCodes,
      })
    }
    if (type === 'packing_list') {
      const { PackingListPDF } = await import('@/components/pdf/exports/packing-list-pdf')
      return React.createElement(PackingListPDF, {
        transport, company: co, batches: await transportBatches(), productWeights,
      })
    }
    if (type === 'bl') {
      const { DonAndresBLPDF } = await import('@/components/pdf/exports/don-andres-bl-pdf')
      return React.createElement(DonAndresBLPDF, { transport, company: co, productWeights })
    }
    const { ShippingLabelPDF } = await import('@/components/pdf/exports/shipping-label-pdf')
    const QRCode = (await import('qrcode')).default
    // The batches on the load, one map for every label. A box names the batches
    // inside it, and since the whole load leaves Curaçao out of chosen batches
    // that answer no longer depends on which order a box belongs to — which is
    // just as well, because a box of loose stock belongs to none.
    const batchesOnLoad = await transportBatches()
    const pages = await Promise.all(
      buildLabelPages(transport).map(async (p) => ({
        ...p,
        qrCodeDataUrl: await QRCode.toDataURL(
          colliQrText(transport, p, batchesOnLoad, productWeights),
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

      zip.file(`${base} - Commercial Invoice.pdf`,
        await pdf((await buildTransportDoc('commercial_invoice', co)) as any).toBlob())
      zip.file(`${base} - Packing List.pdf`,
        await pdf((await buildTransportDoc('packing_list', co)) as any).toBlob())
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
            {/* Which orders are on board. Read-only: no document is generated
                per order any more, but the warehouse still has to be able to
                see what this load is made of. */}
            <div className="rounded-lg border p-2.5">
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-1">
                <FileText className="h-3.5 w-3.5" />
                Orders in this load
              </p>
              {orders.map(order => (
                <p key={order.id} className="text-xs text-muted-foreground">
                  {order.order_number} — {order.customer?.company_name}
                </p>
              ))}
            </div>

            {/* Per transport — one load, one set of papers, all describing the
                same goods arriving at the same door */}
            <div className="rounded-lg border p-2.5 space-y-1.5">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Whole transport
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  disabled={!!busy}
                  onClick={() => download('ci', co => buildTransportDoc('commercial_invoice', co),
                    `${safe(transport.transport_number)} - Commercial Invoice.pdf`)}>
                  {spinner('ci')}Commercial Invoice
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  disabled={!!busy}
                  onClick={() => download('pl', co => buildTransportDoc('packing_list', co),
                    `${safe(transport.transport_number)} - Packing List.pdf`)}>
                  {spinner('pl')}Packing List
                </Button>
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
