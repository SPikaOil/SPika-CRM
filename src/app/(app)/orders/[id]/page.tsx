'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Truck, CheckCircle, Clock, AlertCircle, Calendar, Download, Upload, FileCheck, X, UserCheck, XCircle, Pencil, Check, Plus, Trash2, PackageCheck, MapPin, ExternalLink } from 'lucide-react'
import { useOrder, useUpdateOrder } from '@/hooks/use-orders'
import { useExportByOrderId, useCreateExport, useUpdateExport, useCarriers } from '@/hooks/use-exports'
import { useUsers } from '@/hooks/use-users'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PriceInput } from '@/components/ui/price-input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { OrderEditLogEntry, OrderStatus, QuoteItem } from '@/types'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { getNextCashOrderNumber, getNextOrderNumber } from '@/lib/order-number'

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
  const { isAdmin, profile } = useAuth()

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
  const [poNumber, setPoNumber] = useState('')
  const [editingItems, setEditingItems] = useState(false)
  const [draftItems, setDraftItems] = useState<QuoteItem[]>([])
  const [editReason, setEditReason] = useState('')
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
        const { triggerDownload } = await import('@/lib/download-pdf')
        const orderNum = (order.order_number ?? order.id.slice(0, 8)).replace(/[#/\\:*?"<>|]/g, '').trim()
        const customerName = (order.customer?.company_name ?? '').replace(/[#/\\:*?"<>|]/g, '').trim()
        const filename = customerName ? `${orderNum} - ${customerName}.pdf` : `${orderNum}.pdf`
        triggerDownload(blob, filename)
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
            {(order as any).payment_type === 'cash' && (
              <Badge className="text-xs bg-green-100 text-green-700">Cash</Badge>
            )}
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
                }, {
                  onSuccess: () => {
                    // Notify customer their order is confirmed
                    if (order.customer?.email) {
                      fetch('/api/notify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          type: 'order_confirmed',
                          payload: {
                            orderNumber: order.order_number,
                            customerEmail: order.customer.email,
                            customerName: order.customer.company_name,
                            billingEmails: order.customer.billing_emails ?? [],
                          },
                        }),
                      }).catch(() => {})
                    }
                    // Notify assigned worker
                    fetch('/api/notify', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: 'order_out_for_delivery',
                        payload: {
                          orderNumber: order.order_number,
                          customerName: order.customer?.company_name ?? '',
                          assignedTo: selectedWorker,
                        },
                      }),
                    }).catch(() => {})
                  },
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

      {/* Payment Type (admin only) */}
      {isAdmin && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Payment Type</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cash orders use a separate number series (C-YYYY-XXXX)
                </p>
              </div>
              <div className="flex rounded-lg border overflow-hidden shrink-0">
                <button
                  onClick={async () => {
                    if ((order as any).payment_type === 'invoice') return
                    await updateOrder.mutateAsync({ id: order.id, values: { payment_type: 'invoice' } as any })
                  }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    (order as any).payment_type !== 'cash'
                      ? 'bg-blue-600 text-white'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Invoice
                </button>
                <button
                  onClick={async () => {
                    if ((order as any).payment_type === 'cash') return
                    const cashNum = await getNextCashOrderNumber()
                    await updateOrder.mutateAsync({
                      id: order.id,
                      values: { payment_type: 'cash', order_number: cashNum } as any,
                    })
                  }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    (order as any).payment_type === 'cash'
                      ? 'bg-green-600 text-white'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Cash
                </button>
              </div>
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

      {/* Signature Location — admin only */}
      {isAdmin && (() => {
        const sigLoc = (order.delivery as any)?.signature_location
        const startLoc = (order.delivery as any)?.gps_location
        if (!sigLoc && !startLoc) return null
        return (
          <Card className="border-blue-100">
            <CardContent className="pt-4 pb-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-blue-500" />
                Signature Location
                <span className="text-xs font-normal text-muted-foreground ml-1">(admin only)</span>
              </p>
              {sigLoc ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Captured at time of signing · ±{Math.round(sigLoc.accuracy)}m accuracy
                  </p>
                  <a
                    href={`https://www.google.com/maps?q=${sigLoc.lat},${sigLoc.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {sigLoc.lat.toFixed(5)}, {sigLoc.lng.toFixed(5)}
                    <span className="text-xs text-muted-foreground ml-0.5">→ Maps</span>
                  </a>
                </div>
              ) : startLoc ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Delivery start location (signature location unavailable)</p>
                  <a
                    href={`https://www.google.com/maps?q=${startLoc.lat},${startLoc.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {startLoc.lat.toFixed(5)}, {startLoc.lng.toFixed(5)}
                    <span className="text-xs text-muted-foreground ml-0.5">→ Maps</span>
                  </a>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
      })()}

      {/* Mark Invoice Ready — admin action for delivered orders */}
      {isAdmin && order.status === 'delivered' && (
        <Button
          className="w-full h-12 bg-green-600 hover:bg-green-700 gap-2"
          disabled={updateOrder.isPending}
          onClick={() => updateOrder.mutate({
            id: order.id,
            values: { status: 'invoice_ready' } as any,
          }, {
            onSuccess: () => {
              if (order.customer?.email) {
                fetch('/api/notify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'invoice_ready',
                    payload: {
                      orderNumber: order.order_number,
                      customerEmail: order.customer.email,
                      customerName: order.customer.company_name,
                      billingEmails: order.customer.billing_emails ?? [],
                      total: `XCG ${Number(order.total).toFixed(2)}`,
                    },
                  }),
                }).catch(() => {})
              }
            },
          })}
        >
          <CheckCircle className="h-5 w-5" />
          Mark Invoice Ready
        </Button>
      )}

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
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Order Items</CardTitle>
          {isAdmin && !editingItems && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setDraftItems(items.map(i => ({ ...i })))
                setEditReason('')
                setEditingItems(true)
              }}
            >
              <Pencil className="h-3 w-3" />
              Edit Items
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {editingItems ? (
            <>
              {/* Edit mode header */}
              <div className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-2 text-xs text-muted-foreground pb-1 border-b">
                <span>Product</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price (XCG)</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              {draftItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-2 items-center py-1 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium leading-tight">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    value={item.qty}
                    onChange={e => {
                      const qty = parseInt(e.target.value) || 0
                      setDraftItems(prev => prev.map((it, idx) =>
                        idx === i ? { ...it, qty, line_total: parseFloat(((it.unit_price - (it.discount ?? 0)) * qty).toFixed(2)) } : it
                      ))
                    }}
                    className="h-7 text-center px-1 text-sm"
                  />
                  <PriceInput
                    value={item.unit_price}
                    onChange={unit_price => {
                      setDraftItems(prev => prev.map((it, idx) =>
                        idx === i ? { ...it, unit_price, line_total: parseFloat(((unit_price - (it.discount ?? 0)) * it.qty).toFixed(2)) } : it
                      ))
                    }}
                    className="h-7 px-1 text-sm"
                  />
                  <span className="text-sm text-right font-medium">
                    {item.line_total.toFixed(2)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDraftItems(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {/* Add product */}
              <div className="pt-2">
                <Select
                  onValueChange={(skuVal) => {
                    if (!skuVal) return
                    const sku = String(skuVal)
                    const product = SPIKA_PRODUCTS.find(p => p.sku === sku)
                    if (!product) return
                    const price = (order.customer?.product_prices as Record<string, number> | undefined)?.[sku] ?? product.default_price
                    setDraftItems(prev => [...prev, {
                      sku: product.sku,
                      name: product.name,
                      qty: 1,
                      unit_price: price,
                      discount: 0,
                      line_total: price,
                    }])
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="+ Add product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPIKA_PRODUCTS.map(p => (
                      <SelectItem key={p.sku} value={p.sku}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reason required if order has been signed/delivered */}
              {order.delivery?.delivered_at && (
                <div className="pt-2 space-y-1.5">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                    ⚠️ This order has been delivered and signed. A reason is required.
                  </p>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    rows={2}
                    placeholder="Reason for changing this order (e.g. customer returned 2 bottles)…"
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                  />
                </div>
              )}

              {/* Edit mode totals + save/cancel */}
              <Separator />
              <div className="flex justify-between font-bold text-sm">
                <span>New Total</span>
                <span>XCG {draftItems.reduce((s, i) => s + i.line_total, 0).toFixed(2)}</span>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 gap-1"
                  disabled={updateOrder.isPending || (!!order.delivery?.delivered_at && !editReason.trim())}
                  onClick={async () => {
                    const newTotal = draftItems.reduce((s, i) => s + i.line_total, 0)
                    const isSigned = !!order.delivery?.delivered_at

                    const updateValues: any = { items: draftItems, total: newTotal }

                    if (isSigned) {
                      const entry: OrderEditLogEntry = {
                        edited_by: profile?.name ?? 'Admin',
                        edited_at: new Date().toISOString(),
                        reason: editReason.trim(),
                        old_items: items,
                        new_items: draftItems,
                        old_total: Number(order.total),
                        new_total: newTotal,
                      }
                      updateValues.edit_log = [...(order.edit_log ?? []), entry]
                    }

                    await updateOrder.mutateAsync({ id: order.id, values: updateValues })
                    setEditingItems(false)
                    setEditReason('')
                  }}
                >
                  <Check className="h-4 w-4" />
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setEditingItems(false); setEditReason('') }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Log — shown when post-signature changes have been made */}
      {isAdmin && (order.edit_log ?? []).length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Order Change Log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(order.edit_log ?? []).map((entry, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2 text-sm bg-orange-50 dark:bg-orange-950/20">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">{entry.edited_by}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.edited_at).toLocaleString('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-muted-foreground italic">"{entry.reason}"</p>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Before</p>
                    {entry.old_items.map((item, j) => (
                      <p key={j} className="text-xs">{item.qty}× {item.name} — XCG {item.line_total.toFixed(2)}</p>
                    ))}
                    <p className="text-xs font-bold mt-1">Total: XCG {entry.old_total.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">After</p>
                    {entry.new_items.map((item, j) => (
                      <p key={j} className="text-xs">{item.qty}× {item.name} — XCG {item.line_total.toFixed(2)}</p>
                    ))}
                    <p className="text-xs font-bold mt-1">Total: XCG {entry.new_total.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* PO Number — admin editable */}
      {isAdmin && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">PO Number <span className="text-muted-foreground font-normal">(optional)</span></p>
                <Input
                  placeholder="Enter customer PO number…"
                  defaultValue={order.po_number ?? ''}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className="h-8 max-w-xs"
                />
              </div>
              {poNumber && poNumber !== (order.po_number ?? '') && (
                <Button
                  size="sm"
                  onClick={() => updateOrder.mutate({ id: order.id, values: { po_number: poNumber } as any })}
                  disabled={updateOrder.isPending}
                  className="bg-red-600 hover:bg-red-700 shrink-0 self-end mb-0.5"
                >
                  Save
                </Button>
              )}
            </div>
            {order.po_number && (
              <p className="text-xs text-muted-foreground mt-1.5">Current: <span className="font-medium text-foreground">{order.po_number}</span></p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Export section — only for export-category customers */}
      {isAdmin && order.customer?.customer_category === 'export' && (
        <ExportOrderSection order={order} />
      )}

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

const EXP_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', ready: 'bg-blue-100 text-blue-700',
  submitted: 'bg-yellow-100 text-yellow-700', cleared: 'bg-green-100 text-green-700',
  delivered: 'bg-emerald-100 text-emerald-700',
}
const EXP_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', ready: 'Ready', submitted: 'Submitted', cleared: 'Cleared', delivered: 'Delivered',
}
const EXP_STATUSES = ['draft', 'ready', 'submitted', 'cleared', 'delivered']
const BTLS_PER_CTN = 12
const KG_PER_CTN = 5

function ExportOrderSection({ order }: { order: Order & { customer?: any } }) {
  const { data: exp, isLoading } = useExportByOrderId(order.id)
  const { data: carriers } = useCarriers()
  const createExport = useCreateExport()
  const updateExport = useUpdateExport()
  const { profile } = useAuth()
  const supabase = createClient()

  const orderItems = (order.items ?? []) as QuoteItem[]
  const activeItems = orderItems.filter(i => i.qty > 0)

  // Create-form state
  const [carrierId, setCarrierId] = useState('')
  const [destination, setDestination] = useState('')
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0])
  const [thtDates, setThtDates] = useState<Record<string, string>>({})
  const [isCreating, setIsCreating] = useState(false)

  // Edit-THT state (for existing export)
  const [editingItemTht, setEditingItemTht] = useState<number | null>(null)
  const [itemThtDraft, setItemThtDraft] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)

  // Auto-fill destination from carrier
  useEffect(() => {
    const carrier = carriers?.find(c => c.id === carrierId)
    if (carrier?.route) setDestination(carrier.route.split('→').pop()?.trim() ?? '')
  }, [carrierId, carriers])

  const missingTht = activeItems.some(i => !thtDates[i.sku])
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })

  async function handleCreate() {
    setIsCreating(true)
    try {
      const billingCountry = (order.customer?.billing_address as any)?.country ?? ''
      const { getTaxIdInfo } = await import('@/lib/tax-id')
      const taxInfo = getTaxIdInfo(billingCountry)
      const countryIso = taxInfo.prefix || billingCountry.slice(0, 2).toUpperCase() || 'XX'
      const { getNextExportNumber } = await import('@/lib/order-number')
      const exportNumber = await getNextExportNumber(countryIso, exportDate ? new Date(exportDate) : new Date())
      const itemsWithTht = activeItems.map(item => ({ ...item, tht_date: thtDates[item.sku] || undefined }))
      await createExport.mutateAsync({
        export_number: exportNumber,
        order_id: order.id,
        customer_id: order.customer_id,
        carrier_id: carrierId || null,
        destination,
        export_date: exportDate || null,
        items: itemsWithTht,
        status: 'draft',
        created_by: profile?.id ?? '',
      } as any)
    } catch {
      toast.error('Failed to create export')
    } finally {
      setIsCreating(false)
    }
  }

  async function saveItemTht(idx: number, tht_date: string) {
    if (!exp) return
    const expItems = (exp.items ?? []) as QuoteItem[]
    const updated = expItems.map((item, i) => i === idx ? { ...item, tht_date: tht_date || undefined } : item)
    await updateExport.mutateAsync({ id: exp.id, values: { items: updated } as any })
    setEditingItemTht(null)
  }

  async function fetchCompany() {
    const { data } = await supabase.from('company_settings').select('*').eq('id', '00000000-0000-0000-0000-000000000001').single()
    return data ?? undefined
  }

  async function downloadPdf(type: 'commercial_invoice' | 'packing_list' | 'bill_of_lading' | 'shipping_label') {
    if (!exp) return
    setIsDownloading(true)
    try {
      const React = await import('react')
      const { pdf } = await import('@react-pdf/renderer')
      const company = await fetchCompany()
      const { triggerDownload } = await import('@/lib/download-pdf')
      const labels = { commercial_invoice: 'Commercial Invoice', packing_list: 'Packing List', bill_of_lading: 'Bill of Lading', shipping_label: 'Shipping Label' }
      let element: any
      if (type === 'commercial_invoice') {
        const { CommercialInvoicePDF } = await import('@/components/pdf/exports/commercial-invoice-pdf')
        element = React.createElement(CommercialInvoicePDF, { exportRecord: exp, company })
      } else if (type === 'packing_list') {
        const { PackingListPDF } = await import('@/components/pdf/exports/packing-list-pdf')
        element = React.createElement(PackingListPDF, { exportRecord: exp, company })
      } else if (type === 'shipping_label') {
        const { ShippingLabelPDF } = await import('@/components/pdf/exports/shipping-label-pdf')
        element = React.createElement(ShippingLabelPDF, { exportRecord: exp, company })
      } else {
        const { DonAndresBolPDF } = await import('@/components/pdf/exports/don-andres-bol-pdf')
        element = React.createElement(DonAndresBolPDF, { exportRecord: exp, company })
      }
      const blob = await pdf(element).toBlob()
      const expNum = exp.export_number.replace(/[#/\\:*?"<>|]/g, '').trim()
      const cName = (order.customer?.company_name ?? '').replace(/[#/\\:*?"<>|]/g, '').trim()
      triggerDownload(blob, `${cName ? `${expNum} - ${cName}` : expNum} - ${labels[type]}.pdf`)
    } catch { toast.error('Failed to generate PDF') }
    finally { setIsDownloading(false) }
  }

  if (isLoading) return <Skeleton className="h-32 rounded-xl" />

  // ── No export yet — setup form ──
  if (!exp) return (
    <Card className="border-indigo-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-indigo-600" />
          Export Setup
        </CardTitle>
        <p className="text-xs text-muted-foreground">Fill in the export details to generate customs documents</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Carrier</Label>
            <Select value={carrierId} onValueChange={v => v && setCarrierId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select carrier">
                  {carrierId ? (() => { const c = carriers?.find(c => c.id === carrierId); return c ? `${c.name}${c.route ? ` — ${c.route}` : ''}` : 'Select carrier' })() : 'Select carrier'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {carriers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.route ? ` — ${c.route}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Destination</Label>
            <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. Netherlands" />
          </div>
          <div className="space-y-1.5">
            <Label>Export Date</Label>
            <Input type="date" value={exportDate} onChange={e => setExportDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>THT Date per Product <span className="text-red-500">*</span></Label>
          <div className="divide-y border rounded-lg overflow-hidden">
            {activeItems.map(item => (
              <div key={item.sku} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <p className="text-sm font-medium flex-1 min-w-0 truncate">{item.name}</p>
                <Input
                  type="date"
                  value={thtDates[item.sku] ?? ''}
                  onChange={e => setThtDates(prev => ({ ...prev, [item.sku]: e.target.value }))}
                  className={`h-7 w-36 text-xs px-2 ${!thtDates[item.sku] ? 'border-red-300' : ''}`}
                />
              </div>
            ))}
          </div>
        </div>

        {missingTht && <p className="text-xs text-red-500">THT date required for all products</p>}

        <Button
          className="w-full bg-indigo-600 hover:bg-indigo-700 h-10"
          disabled={isCreating || missingTht || activeItems.length === 0}
          onClick={handleCreate}
        >
          {isCreating && <Clock className="h-4 w-4 mr-2 animate-spin" />}
          Create Export
        </Button>
      </CardContent>
    </Card>
  )

  // ── Export exists — full details ──
  const expItems = (exp.items ?? []) as QuoteItem[]
  const expActiveItems = expItems.filter(i => i.qty > 0)
  const totalQty = expActiveItems.reduce((s, i) => s + i.qty, 0)
  const totalCartons = Math.ceil(totalQty / BTLS_PER_CTN)
  const totalWeight = totalCartons * KG_PER_CTN

  return (
    <Card className="border-indigo-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-indigo-600" />
            Export
            <span className="font-mono text-sm font-medium text-muted-foreground">{exp.export_number}</span>
          </CardTitle>
          <Select value={exp.status} onValueChange={v => updateExport.mutate({ id: exp.id, values: { status: v as any } })}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXP_STATUSES.map(s => <SelectItem key={s} value={s}>{EXP_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key info */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Carrier</span>
          <span className="font-medium text-right">{(exp as any).carrier?.name ?? '—'}</span>
          <span className="text-muted-foreground">Destination</span>
          <span className="font-medium text-right">{exp.destination || '—'}</span>
          <span className="text-muted-foreground">Export Date</span>
          <span className="font-medium text-right">{exp.export_date ? fmt(exp.export_date) : '—'}</span>
        </div>

        <Separator />

        {/* Cargo + THT */}
        <div className="space-y-0 divide-y text-sm">
          {expActiveItems.map((item, i) => {
            const ctns = Math.ceil(item.qty / BTLS_PER_CTN)
            const tht = (item as any).tht_date
            return (
              <div key={i} className="py-2.5">
                <div className="flex justify-between gap-4">
                  <span className="flex-1 min-w-0 truncate">{item.name}</span>
                  <span>{item.qty} btls</span>
                  <span className="text-muted-foreground">{ctns} ctns</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs text-muted-foreground">THT:</span>
                  {editingItemTht === i ? (
                    <>
                      <Input type="date" autoFocus value={itemThtDraft} onChange={e => setItemThtDraft(e.target.value)} className="h-6 text-xs px-2 w-36" />
                      <button onClick={() => saveItemTht(i, itemThtDraft)} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setEditingItemTht(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <button onClick={() => { setItemThtDraft(tht ?? ''); setEditingItemTht(i) }} className="flex items-center gap-1 text-xs hover:opacity-70 group">
                      <span className={tht ? 'font-medium' : 'text-muted-foreground'}>{tht ? fmt(tht) : 'Not set'}</span>
                      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          {[{ label: 'Bottles', value: totalQty }, { label: 'Cartons', value: totalCartons }, { label: 'kg gross', value: totalWeight }].map(({ label, value }) => (
            <div key={label} className="text-center p-2.5 bg-muted rounded-lg">
              <p className="text-lg font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <Separator />

        {/* Document downloads */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Documents</p>
          <div className="grid grid-cols-2 gap-2">
            {(['commercial_invoice', 'packing_list', 'bill_of_lading', 'shipping_label'] as const).map(type => (
              <Button key={type} variant="outline" size="sm" className="justify-start gap-2 text-xs h-8" disabled={isDownloading} onClick={() => downloadPdf(type)}>
                <Download className="h-3.5 w-3.5 shrink-0" />
                {{ commercial_invoice: 'Commercial Invoice', packing_list: 'Packing List', bill_of_lading: 'Bill of Lading', shipping_label: 'Shipping Label' }[type]}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
