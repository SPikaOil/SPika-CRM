'use client'

import { use, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Truck,
  CheckCircle,
  Clock,
  Calendar,
  Download,
  Upload,
  FileCheck,
  X,
  Image as ImageIcon,
} from 'lucide-react'
import { useOrder, useUpdateOrder } from '@/hooks/use-orders'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { OrderStatus, QuoteItem } from '@/types'

const statusColors: Record<OrderStatus, string> = {
  pending_approval: 'bg-orange-100 text-orange-700',
  processing: 'bg-yellow-100 text-yellow-700',
  out_for_delivery: 'bg-blue-100 text-blue-700',
  delivered: 'bg-purple-100 text-purple-700',
  invoice_ready: 'bg-green-100 text-green-700',
  invoice_blocked: 'bg-red-100 text-red-700',
  paid: 'bg-emerald-100 text-emerald-700',
  deleted: 'bg-gray-100 text-gray-500',
}

const statusLabels: Record<OrderStatus, string> = {
  pending_approval: 'Pending Approval',
  processing: 'Processing',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  invoice_ready: 'Send Invoice',
  invoice_blocked: 'Invoice Blocked',
  paid: 'Paid',
  deleted: 'Deleted',
}

const TIMELINE: OrderStatus[] = [
  'processing',
  'out_for_delivery',
  'delivered',
  'invoice_ready',
]

export default function DeliveryNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: order, isLoading } = useOrder(id)
  const updateOrder = useUpdateOrder()
  const { isAdmin } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [isDownloading, setIsDownloading] = useState(false)
  const [isDownloadingSigned, setIsDownloadingSigned] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleViewPDF() {
    if (!order) return
    setIsGeneratingPreview(true)

    // NEVER open a tab before generating: on iOS, window.open() switches to
    // the new tab and freezes this page mid-generation — blank tab forever.
    const isMobile = /Android|iPad|iPhone|iPod/.test(navigator.userAgent)

    try {
      const delivery = (order as any).delivery
      const React = await import('react')
      const { pdf } = await import('@react-pdf/renderer')
      const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')

      const { data: companyData } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single()
      const company = companyData ?? undefined

      const signatureDataUrl: string | undefined =
        (order as any).signature_data_url ?? undefined
      const tableBottlesReturned = delivery?.table_bottles_returned ?? 0
      const tableBottlesNotes = delivery?.table_bottles_notes ?? ''
      const signerName: string | undefined = delivery?.signer_name ?? undefined

      let deliveryPhotoDataUrl: string | undefined
      if (delivery?.pod_file_url) {
        try {
          const res = await fetch(
            `/api/image-proxy?url=${encodeURIComponent(delivery.pod_file_url)}`
          )
          const json = await res.json()
          if (json.dataUrl) {
            const { downscaleDataUrl } = await import('@/lib/image-utils')
            deliveryPhotoDataUrl = await downscaleDataUrl(json.dataUrl)
          }
        } catch {
          /* non-fatal */
        }
      }

      const blob = await (pdf as any)(
        React.createElement(DeliveryNotePDF as any, {
          order,
          signatureDataUrl,
          tableBottlesReturned,
          tableBottlesNotes,
          signerName,
          deliveryPhotoDataUrl,
          showPrices: false, // delivery notes never show prices
          company,
        })
      ).toBlob()
      if (isMobile) {
        // Share sheet: preview via Quick Look, or save/send directly
        const orderNum = (order.order_number ?? order.id.slice(0, 8)).replace(/[#/\\:*?"<>|]/g, '').trim()
        const customerName = (order.customer?.company_name ?? '').replace(/[#/\\:*?"<>|]/g, '').trim()
        const filename = customerName ? `${orderNum} - ${customerName} - Delivery Note.pdf` : `${orderNum} - Delivery Note.pdf`
        const { triggerDownload } = await import('@/lib/download-pdf')
        triggerDownload(blob, filename)
      } else {
        setPdfBlobUrl(URL.createObjectURL(blob))
      }
    } catch (err: any) {
      toast.error(`Preview failed: ${err?.message ?? 'unknown error'}`, { duration: 8000 })
      console.error(err)
    } finally {
      setIsGeneratingPreview(false)
    }
  }

  function handleClosePdf() {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
    setPdfBlobUrl(null)
  }

  async function handleDownloadPDF() {
    if (!order) return
    setIsDownloading(true)

    try {
      // Always regenerate without prices — embed signature and POD photo if available
      const delivery = (order as any).delivery
      const React = await import('react')
      const { pdf } = await import('@react-pdf/renderer')
      const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')

      const { data: companyData } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single()
      const company = companyData ?? undefined

      const signatureDataUrl: string | undefined =
        (order as any).signature_data_url ?? undefined
      const tableBottlesReturned = delivery?.table_bottles_returned ?? 0
      const tableBottlesNotes = delivery?.table_bottles_notes ?? ''
      const signerName: string | undefined = delivery?.signer_name ?? undefined

      let deliveryPhotoDataUrl: string | undefined
      if (delivery?.pod_file_url) {
        try {
          const res = await fetch(
            `/api/image-proxy?url=${encodeURIComponent(delivery.pod_file_url)}`
          )
          const json = await res.json()
          deliveryPhotoDataUrl = json.dataUrl
        } catch { /* non-fatal */ }
      }

      const blob = await (pdf as any)(
        React.createElement(DeliveryNotePDF as any, {
          order,
          signatureDataUrl,
          tableBottlesReturned,
          tableBottlesNotes,
          signerName,
          deliveryPhotoDataUrl,
          showPrices: false,
          company,
        })
      ).toBlob()

      const { isMobileDevice, uploadAndOpenInViewer, triggerDownload } = await import('@/lib/download-pdf')
      const orderNum = (order.order_number ?? order.id.slice(0, 8)).replace(/[#/\\:*?"<>|]/g, '').trim()
      const customerName = (order.customer?.company_name ?? '').replace(/[#/\\:*?"<>|]/g, '').trim()
      // Same naming convention as the orders page
      const filename = customerName ? `${orderNum} - ${customerName} - Delivery Note.pdf` : `${orderNum} - Delivery Note.pdf`
      if (isMobileDevice()) {
        const ok = await uploadAndOpenInViewer(supabase, blob, filename)
        if (!ok) triggerDownload(blob, filename)
      } else {
        triggerDownload(blob, filename)
      }
    } catch (err: any) {
      toast.error(`Download failed: ${err?.message ?? 'unknown error'}`, { duration: 8000 })
      console.error(err)
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleDownloadSignedPDF() {
    if (!order) return
    const signedUrl = (order as any).signed_pdf_url
    if (!signedUrl) return
    setIsDownloadingSigned(true)

    try {
      const match = signedUrl.match(/\/object\/(?:public\/)?pod-files\/(.+)$/)
      const storagePath = match ? match[1] : signedUrl
      const { isMobileDevice, openStoredPdfInViewer, triggerDownload } = await import('@/lib/download-pdf')

      if (isMobileDevice()) {
        // Open on-screen in the iPhone viewer with the real filename
        const orderNum = (order.order_number ?? order.id.slice(0, 8)).replace(/[/\\:*?"<>|]/g, '').trim()
        const customerName = (order.customer?.company_name ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
        const dlName = customerName ? `${orderNum} - ${customerName} - Signed Invoice.pdf` : `${orderNum} - Signed Invoice.pdf`
        const ok = await openStoredPdfInViewer(supabase, storagePath, dlName)
        if (!ok) throw new Error('Could not open signed PDF')
      } else {
        const { data: signedData, error } = await supabase.storage.from('pod-files').createSignedUrl(storagePath, 120)
        if (error || !signedData) throw error ?? new Error('Could not create signed URL')
        const res = await fetch(signedData.signedUrl)
        if (!res.ok) throw new Error('Could not fetch signed PDF')
        const orderNum = (order.order_number ?? order.id.slice(0, 8)).replace(/[/\\:*?"<>|]/g, '').trim()
        const customerName = (order.customer?.company_name ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
        const ext = storagePath.includes('.') ? storagePath.split('.').pop() : 'pdf'
        const filename = customerName
          ? `${orderNum} - ${customerName} - Signed Invoice.${ext}`
          : `${orderNum} - Signed Invoice.${ext}`
        triggerDownload(await res.blob(), filename)
      }
    } catch (err: any) {
      toast.error(`Download failed: ${err?.message ?? 'unknown error'}`, { duration: 8000 })
    } finally {
      setIsDownloadingSigned(false)
    }
  }

  async function handleUploadSigned(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !order) return
    setIsUploading(true)
    try {
      const safeOrder = (order.order_number ?? order.id.slice(0, 8)).replace(/[/\\:*?"<>|]/g, '').trim()
      const safeCust = (order.customer?.company_name ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
      // Keep the real file extension — a photo saved as ".pdf" is unopenable
      const ext = file.type === 'application/pdf' ? 'pdf' : (file.name.split('.').pop()?.toLowerCase() ?? 'pdf')
      const path = `signed-notes/${safeCust ? `${safeOrder} - ${safeCust}` : safeOrder}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('pod-files')
        .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' })
      if (uploadError) throw uploadError
      const {
        data: { publicUrl },
      } = supabase.storage.from('pod-files').getPublicUrl(path)
      await updateOrder.mutateAsync({
        id: order.id,
        values: { signed_pdf_url: publicUrl } as any,
      })
      toast.success('Signed delivery note uploaded!')
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center py-20 gap-3">
        <p className="font-medium">Delivery note not found</p>
        <Link href="/delivery-notes">
          <Button variant="outline">Back</Button>
        </Link>
      </div>
    )
  }

  // Sales workers cannot access paid orders
  if (!isAdmin && order.status === 'paid') {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center py-20 gap-3">
        <p className="font-medium text-muted-foreground">This order has been paid and is no longer accessible.</p>
        <Link href="/delivery-notes">
          <Button variant="outline">Back to Delivery Notes</Button>
        </Link>
      </div>
    )
  }

  const currentStepIndex = TIMELINE.indexOf(order.status as any)
  const items = order.items as QuoteItem[]
  const delivery = (order as any).delivery
  const podPhotoUrl = delivery?.pod_file_url

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">
      {/* Hard copy warning */}
      {order.customer?.hardcopy_required && (
        <div className="flex items-start gap-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl p-3">
          <span className="text-xl shrink-0">🖨️</span>
          <div>
            <p className="font-semibold text-orange-700 dark:text-orange-400 text-sm">
              Hard Copy Required
            </p>
            <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
              This customer requires a printed delivery note.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold font-mono">{order.order_number}</h1>
            <Badge className={`text-xs ${statusColors[order.status]}`}>
              {statusLabels[order.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {order.customer?.company_name}
          </p>
        </div>
      </div>

      {/* Status Timeline */}
      {order.status !== 'invoice_blocked' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {TIMELINE.map((step, i) => {
                const done = i <= currentStepIndex
                const current = i === currentStepIndex
                return (
                  <div key={step} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          done
                            ? 'bg-green-500 text-white'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {done ? <CheckCircle className="h-4 w-4" /> : i + 1}
                      </div>
                      <span
                        className={`text-[10px] text-center leading-tight ${
                          current ? 'font-semibold' : 'text-muted-foreground'
                        }`}
                      >
                        {statusLabels[step].split(' ')[0]}
                      </span>
                    </div>
                    {i < TIMELINE.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 ${
                          i < currentStepIndex ? 'bg-green-500' : 'bg-muted'
                        }`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Planned Delivery Date (read-only) */}
      {order.planned_date && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Planned Delivery Date</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(order.planned_date).toLocaleDateString('en', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delivery CTAs */}
      {order.status === 'processing' && (
        <Link href={`/delivery/${order.id}`}>
          <Button className="w-full h-14 text-lg bg-red-600 hover:bg-red-700 gap-2">
            <Truck className="h-6 w-6" />
            Start Delivery
          </Button>
        </Link>
      )}
      {order.status === 'out_for_delivery' && (
        <Link href={`/delivery/${order.id}`}>
          <Button className="w-full h-14 text-lg bg-orange-500 hover:bg-orange-600 gap-2">
            <Truck className="h-6 w-6" />
            Continue Delivery
          </Button>
        </Link>
      )}

      {/* PDF Actions */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <p className="text-sm font-medium">Delivery Note PDF</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="flex-1 sm:flex-none"
            >
              {isDownloading ? (
                <Clock className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isDownloading ? 'Generating…' : 'Download PDF'}
            </Button>

            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex-1 sm:flex-none"
            >
              {isUploading ? (
                <Clock className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isUploading ? 'Uploading…' : 'Upload Signed PDF'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={handleUploadSigned}
            />
          </div>

          <button
            onClick={handleViewPDF}
            disabled={isGeneratingPreview}
            className="inline-flex items-center gap-2 text-sm text-green-600 hover:underline disabled:opacity-50"
          >
            {isGeneratingPreview ? (
              <>
                <Clock className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <FileCheck className="h-4 w-4" /> View Delivery Note
              </>
            )}
          </button>

          {/* Signed Invoice — the frozen original with signature, photo and prices */}
          {(order as any).signed_pdf_url && (
            <div className="pt-2 border-t space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Signed Invoice (with proof of delivery)</p>
              <Button
                variant="outline"
                onClick={handleDownloadSignedPDF}
                disabled={isDownloadingSigned}
                className="flex-1 sm:flex-none"
              >
                {isDownloadingSigned
                  ? <Clock className="h-4 w-4 mr-2 animate-spin" />
                  : <Download className="h-4 w-4 mr-2" />
                }
                {isDownloadingSigned ? 'Preparing…' : 'Download / Share'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items — no prices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item, i) => (
            <div key={i}>
              {i > 0 && <Separator className="my-2" />}
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.sku} · qty: {item.qty}
                  </p>
                </div>
                <p className="font-semibold text-sm shrink-0">× {item.qty}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* POD photo */}
      {podPhotoUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Proof of Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={podPhotoUrl}
              alt="Proof of delivery"
              className="w-full rounded-lg object-cover max-h-64"
            />
            {delivery?.signer_name && (
              <p className="text-sm text-muted-foreground mt-2">
                Signed by: <span className="font-medium">{delivery.signer_name}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Assigned To" value={order.assigned_user?.name ?? '—'} />
          <Row
            label="Created"
            value={new Date(order.created_at).toLocaleString()}
          />
          {order.delivery_notes && (
            <Row label="Notes" value={order.delivery_notes} />
          )}
          {delivery?.delivered_at && (
            <Row
              label="Delivered At"
              value={new Date(delivery.delivered_at).toLocaleString()}
            />
          )}
          {delivery?.table_bottles_returned > 0 && (
            <Row
              label="Table Bottles Returned"
              value={String(delivery.table_bottles_returned)}
            />
          )}
        </CardContent>
      </Card>

      {/* In-app PDF Viewer */}
      {pdfBlobUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-background border-b">
            <p className="font-semibold text-sm">
              Delivery Note — {order.order_number}
            </p>
            <Button variant="ghost" size="icon" onClick={handleClosePdf}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <iframe
            src={pdfBlobUrl}
            className="flex-1 w-full"
            title="Delivery Note"
          />
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right capitalize">{value}</span>
    </div>
  )
}
