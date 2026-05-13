'use client'

import { use, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Truck, CheckCircle, Clock, AlertCircle, Calendar, Download, Upload, FileCheck, X, UserCheck, XCircle, Pencil, Check } from 'lucide-react'
import { useOrder, useUpdateOrder } from '@/hooks/use-orders'
import { useUsers } from '@/hooks/use-users'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  invoice_ready: 'Invoice Ready',
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

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: order, isLoading } = useOrder(id)
  const updateOrder = useUpdateOrder()
  const { isAdmin } = useAuth()

  // Adjusted total accounting for table bottle credit
  const bottleCredit = order
    ? (order.delivery?.table_bottles_returned ?? 0) * (order.customer?.table_bottle_return_price ?? 2.50)
    : 0
  const adjustedTotal = order ? Number(order.total) - bottleCredit : 0
  const { data: users } = useUsers()
  const router = useRouter()
  const supabase = createClient()
  const [plannedDate, setPlannedDate] = useState<string>('')
  const [invoiceDate, setInvoiceDate] = useState<string>('')
  const [selectedWorker, setSelectedWorker] = useState<string>('')
  const [editingOrderNumber, setEditingOrderNumber] = useState(false)
  const [orderNumberDraft, setOrderNumberDraft] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleViewPDF() {
    if (!order) return
    setIsGeneratingPreview(true)
    try {
      const delivery = (order as any).delivery
      const React = await import('react')
      const { pdf } = await import('@react-pdf/renderer')
      const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')

      // Fetch company settings
      const { data: companyData } = await supabase.from('company_settings').select('*').eq('id', '00000000-0000-0000-0000-000000000001').single()
      const company = companyData ?? undefined

      // Auto-embed signature stored directly on the order
      const signatureDataUrl: string | undefined = (order as any).signature_data_url ?? undefined

      const tableBottlesReturned = delivery?.table_bottles_returned ?? 0
      const tableBottlesNotes = delivery?.table_bottles_notes ?? ''
      const signerName: string | undefined = delivery?.signer_name ?? undefined

      // Fetch delivery photo via proxy to embed in PDF
      let deliveryPhotoDataUrl: string | undefined
      if (delivery?.pod_file_url) {
        try {
          const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(delivery.pod_file_url)}`)
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
          showPrices: isAdmin,
          company,
          documentType: 'INVOICE',
        })
      ).toBlob()
      const url = URL.createObjectURL(blob)
      setPdfBlobUrl(url)
    } catch (err) {
      toast.error('Failed to generate preview')
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
      // If a signed PDF was saved at delivery, download that directly
      const signedUrl = (order as any).signed_pdf_url
      if (signedUrl) {
        // Extract the storage path from the public URL
        // URL format: .../storage/v1/object/public/pod-files/<path>
        const match = signedUrl.match(/\/object\/(?:public\/)?pod-files\/(.+)$/)
        if (!match) throw new Error('Could not parse storage path')
        const storagePath = match[1]

        // Use a temporary signed URL via the Supabase client (works regardless of bucket public setting)
        const { data: signedData, error: signedError } = await supabase
          .storage
          .from('pod-files')
          .createSignedUrl(storagePath, 60)
        if (signedError || !signedData) throw signedError ?? new Error('Could not create signed URL')

        const res = await fetch(signedData.signedUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${order.order_number}-signed.pdf`
        a.click()
        URL.revokeObjectURL(url)
        return
      }
      // Otherwise regenerate unsigned PDF
      const { downloadDeliveryNotePDF } = await import('@/lib/download-pdf')
      await downloadDeliveryNotePDF(order, isAdmin, 'INVOICE')
    } catch (err) {
      toast.error('Failed to download PDF')
      console.error(err)
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleUploadSigned(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !order) return
    setIsUploading(true)
    try {
      const supabase = createClient()
      const path = `signed-notes/${order.id}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('pod-files')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('pod-files').getPublicUrl(path)
      await updateOrder.mutateAsync({ id: order.id, values: { signed_pdf_url: publicUrl } as any })
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
        <p className="font-medium">Order not found</p>
        <Link href="/orders"><Button variant="outline">Back</Button></Link>
      </div>
    )
  }

  const currentStepIndex = TIMELINE.indexOf(order.status as any)
  const items = order.items as QuoteItem[]

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">
      {/* Hard copy warning */}
      {order.customer?.hardcopy_required && (
        <div className="flex items-start gap-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl p-3">
          <span className="text-xl shrink-0">🖨️</span>
          <div>
            <p className="font-semibold text-orange-700 dark:text-orange-400 text-sm">Hard Copy Required</p>
            <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">This customer requires a printed delivery note.</p>
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
            {editingOrderNumber ? (
              <div className="flex items-center gap-1">
                <Input
                  className="h-7 w-40 font-mono text-base font-bold px-2"
                  value={orderNumberDraft}
                  onChange={(e) => setOrderNumberDraft(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      await updateOrder.mutateAsync({ id: order.id, values: { order_number: orderNumberDraft } })
                      setEditingOrderNumber(false)
                    }
                    if (e.key === 'Escape') setEditingOrderNumber(false)
                  }}
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => {
                  await updateOrder.mutateAsync({ id: order.id, values: { order_number: orderNumberDraft } })
                  setEditingOrderNumber(false)
                }}>
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingOrderNumber(false)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <h1 className="text-xl font-bold font-mono">{order.order_number}</h1>
                {isAdmin && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                    setOrderNumberDraft(order.order_number)
                    setEditingOrderNumber(true)
                  }}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                )}
              </div>
            )}
            <Badge className={`text-xs ${statusColors[order.status]}`}>
              {statusLabels[order.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{order.customer?.company_name}</p>
        </div>
      </div>

      {/* Status Timeline */}
      {order.status !== 'invoice_blocked' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Status Timeline</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {TIMELINE.map((step, i) => {
                const done = i <= currentStepIndex
                const current = i === currentStepIndex
                return (
                  <div key={step} className="flex items-center flex-1">
                    <div className={`flex flex-col items-center gap-1 flex-1 ${i > 0 ? '' : ''}`}>
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          done
                            ? 'bg-green-500 text-white'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {done ? <CheckCircle className="h-4 w-4" /> : i + 1}
                      </div>
                      <span className={`text-[10px] text-center leading-tight ${current ? 'font-semibold' : 'text-muted-foreground'}`}>
                        {statusLabels[step].split(' ')[0]}
                      </span>
                    </div>
                    {i < TIMELINE.length - 1 && (
                      <div className={`h-0.5 flex-1 ${i < currentStepIndex ? 'bg-green-500' : 'bg-muted'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {order.status === 'invoice_blocked' && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-red-700 dark:text-red-400">Invoice Blocked</p>
              <p className="text-sm text-red-600/80">This order has been flagged and cannot be invoiced.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Approval — admin action card */}
      {order.status === 'pending_approval' && isAdmin && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader><CardTitle className="text-base text-orange-700 dark:text-orange-400">Customer Order — Awaiting Approval</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {order.customer?.ob_form_required && !(order.customer as any).ob_form_signed && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-300 rounded-lg p-3">
                <span className="text-red-600 text-lg shrink-0">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">OB Form Missing!</p>
                  <p className="text-xs text-red-600/80 mt-0.5">
                    This customer has not signed the OB Declaratie Formulier 2026.{' '}
                    <a href={`/customers/${order.customer_id}/ob-sign`} className="underline font-medium">Sign now →</a>
                  </p>
                </div>
              </div>
            )}
            <p className="text-sm text-orange-600/80">Assign a worker and approve, or reject this order.</p>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Assign to worker</p>
              <Select value={selectedWorker} onValueChange={(v) => setSelectedWorker(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a worker…">
                    {users?.find(u => u.id === selectedWorker)?.name ?? undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(users ?? []).filter(u => u.role !== 'customer').map(u => (
                    <SelectItem key={u.id} value={u.id} label={u.name}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                disabled={!selectedWorker || updateOrder.isPending}
                onClick={() => updateOrder.mutate({
                  id: order.id,
                  values: { status: 'processing', assigned_to: selectedWorker } as any,
                })}
              >
                <UserCheck className="h-4 w-4" />
                Approve & Assign
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-red-300 text-red-600 hover:bg-red-50 gap-2"
                disabled={updateOrder.isPending}
                onClick={() => updateOrder.mutate({
                  id: order.id,
                  values: { status: 'invoice_blocked' } as any,
                })}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Planned Delivery Date */}
      {(order.status === 'processing' || order.status === 'out_for_delivery') && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">Planned Delivery Date</p>
                <Input
                  type="date"
                  defaultValue={order.planned_date ?? ''}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  className="h-8 w-44"
                />
              </div>
              {plannedDate && plannedDate !== order.planned_date && (
                <Button
                  size="sm"
                  onClick={() => updateOrder.mutate({ id: order.id, values: { planned_date: plannedDate } })}
                  disabled={updateOrder.isPending}
                  className="bg-red-600 hover:bg-red-700 shrink-0"
                >
                  Save
                </Button>
              )}
              {order.planned_date && !plannedDate && (
                <p className="text-sm text-muted-foreground">
                  {new Date(order.planned_date).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice Date (admin only) */}
      {isAdmin && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">Invoice Date</p>
                <Input
                  type="date"
                  defaultValue={(order as any).invoice_date ?? order.planned_date ?? ''}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="h-8 w-44"
                />
                <p className="text-xs text-muted-foreground mt-1">Defaults to delivery date if not set</p>
              </div>
              {invoiceDate && invoiceDate !== ((order as any).invoice_date ?? order.planned_date) && (
                <Button
                  size="sm"
                  onClick={() => updateOrder.mutate({ id: order.id, values: { invoice_date: invoiceDate } as any })}
                  disabled={updateOrder.isPending}
                  className="bg-red-600 hover:bg-red-700 shrink-0"
                >
                  Save
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
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
              {isDownloading
                ? <Clock className="h-4 w-4 mr-2 animate-spin" />
                : <Download className="h-4 w-4 mr-2" />
              }
              {isDownloading ? 'Generating…' : 'Download PDF'}
            </Button>

            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex-1 sm:flex-none"
            >
              {isUploading
                ? <Clock className="h-4 w-4 mr-2 animate-spin" />
                : <Upload className="h-4 w-4 mr-2" />
              }
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
            {isGeneratingPreview
              ? <><Clock className="h-4 w-4 animate-spin" /> Generating…</>
              : <><FileCheck className="h-4 w-4" /> View Delivery Note</>
            }
          </button>
        </CardContent>
      </Card>

      {/* Start / Continue Delivery CTA */}
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

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Order Items</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((item, i) => (
            <div key={i}>
              {i > 0 && <Separator className="my-2" />}
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  {isAdmin && <p className="text-xs text-muted-foreground">{item.sku} · XCG {item.unit_price.toFixed(2)} × {item.qty}</p>}
                  {!isAdmin && <p className="text-xs text-muted-foreground">{item.sku} · qty: {item.qty}</p>}
                </div>
                {isAdmin && <p className="font-semibold text-sm shrink-0">XCG {item.line_total.toFixed(2)}</p>}
              </div>
            </div>
          ))}
          {isAdmin && (
            <>
              <Separator />
              {bottleCredit > 0 && (
                <>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Order subtotal</span>
                    <span>XCG {Number(order.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Table bottle credit ({order.delivery?.table_bottles_returned} × XCG {(order.customer?.table_bottle_return_price ?? 2.50).toFixed(2)})</span>
                    <span>- XCG {bottleCredit.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>XCG {adjustedTotal.toFixed(2)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Assigned To" value={order.assigned_user?.name ?? '—'} />
          <Row label="Created" value={new Date(order.created_at).toLocaleString()} />
          {order.delivery_notes && <Row label="Notes" value={order.delivery_notes} />}
          {order.delivery?.delivered_at && (
            <Row label="Delivered At" value={new Date(order.delivery.delivered_at).toLocaleString()} />
          )}
          {order.delivery?.pod_type && (
            <Row label="POD Type" value={order.delivery.pod_type} />
          )}
        </CardContent>
      </Card>

      {/* In-app PDF Viewer */}
      {pdfBlobUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-background border-b">
            <p className="font-semibold text-sm">Delivery Note — {order.order_number}</p>
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
