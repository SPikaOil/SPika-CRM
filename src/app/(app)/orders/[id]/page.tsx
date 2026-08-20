'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Truck, CheckCircle, Clock, AlertCircle, Calendar, Download, Upload, FileCheck, X, UserCheck, XCircle, Pencil, Check, Plus, Trash2, PackageCheck, MapPin, RotateCcw, Ship } from 'lucide-react'
import { useOrder, useUpdateOrder } from '@/hooks/use-orders'
import { useTransportsForOrder } from '@/hooks/use-transports'
import { useUsers } from '@/hooks/use-users'
import { useAuth } from '@/contexts/auth-context'
import { OrderPosLine } from '@/components/order-pos-line'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PriceInput } from '@/components/ui/price-input'
import { QtyInput } from '@/components/ui/qty-input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Order, OrderCurrency, OrderEditLogEntry, OrderStatus, QuoteItem } from '@/types'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { getNextCashOrderNumber, getNextOrderNumber, getCreditNoteNumber } from '@/lib/order-number'
import { formatCurrency, formatTht, thtToMonthInput, monthInputToTht, currentMonthInput } from '@/lib/utils'
import { isExportCustomer } from '@/lib/country'
import { storagePath } from '@/lib/storage'
import { BatchSelect } from '@/components/batch-select'
import { useOrderPicks, useSetOrderPick } from '@/hooks/use-batches'
import { ConsignmentPanel } from '../_components/consignment-panel'
import { DefectReportsPanel } from '../_components/defect-reports-panel'
import { PosRequestsPanel } from '../_components/pos-requests-panel'

const statusColors: Record<OrderStatus, string> = {
  pending_approval: 'bg-orange-100 text-orange-700',
  processing: 'bg-yellow-100 text-yellow-700',
  out_for_delivery: 'bg-blue-100 text-blue-700',
  partly_delivered: 'bg-amber-100 text-amber-700',
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
  partly_delivered: 'Partly Delivered',
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

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: order, isLoading } = useOrder(id)
  const updateOrder = useUpdateOrder()
  const { isAdmin, profile, can } = useAuth()
  // The batch chosen per product. It lives in the stock movements, not on the
  // order, so the choice and the stock can never drift apart.
  const { data: picks = {} } = useOrderPicks(id)
  const setOrderPick = useSetOrderPick()

  // Adjusted total accounting for table bottle credit
  const bottleCredit = order
    ? (order.delivery?.table_bottles_returned ?? 0) * (order.customer?.table_bottle_return_price ?? 2.50)
    : 0
  const adjustedTotal = order ? Number(order.total) - bottleCredit : 0
  const cur: OrderCurrency = (order as any)?.currency ?? 'XCG'
  const fmt = (amount: number) => formatCurrency(amount, cur)
  const { data: users } = useUsers()
  const router = useRouter()
  const supabase = createClient()
  const [plannedDate, setPlannedDate] = useState<string>('')
  const [estimatedBottles, setEstimatedBottles] = useState<string>('')
  const [invoiceDate, setInvoiceDate] = useState<string>('')
  const [selectedWorker, setSelectedWorker] = useState<string>('')
  const [approveOrderNum, setApproveOrderNum] = useState('')
  const [approveDate, setApproveDate] = useState('')
  const [editingOrderNumber, setEditingOrderNumber] = useState(false)
  const [orderNumberDraft, setOrderNumberDraft] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [editingItems, setEditingItems] = useState(false)
  const [draftItems, setDraftItems] = useState<QuoteItem[]>([])
  const [editReason, setEditReason] = useState('')
  const [isDownloading, setIsDownloading] = useState<'invoice' | 'note' | null>(null)
  const [isDownloadingSigned, setIsDownloadingSigned] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfTitle, setPdfTitle] = useState('Delivery Note')
  const [pdfShareFile, setPdfShareFile] = useState<File | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState<'invoice' | 'note' | null>(null)
  const [creditOpen, setCreditOpen] = useState(false)
  // Credited quantity per SKU. A credit note credits LINES — which products and
  // how many — never a loose amount; the amount is what those lines add up to.
  const [creditQty, setCreditQty] = useState<Record<string, number>>({})
  const [creditReason, setCreditReason] = useState('')
  const [creditNumber, setCreditNumber] = useState('')
  // Credit notes already raised against this invoice. Loaded with the order so
  // they are visible on the page itself, not only inside the dialog.
  const [existingCredits, setExistingCredits] = useState<any[]>([])
  // Deleting a credit note follows the same rule as deleting an order: admin
  // only, a written reason, and the password typed again.
  const [creditDeleteTarget, setCreditDeleteTarget] = useState<any>(null)
  const [creditDeleteReason, setCreditDeleteReason] = useState('')
  const [creditDeletePassword, setCreditDeletePassword] = useState('')
  const [creditDeleting, setCreditDeleting] = useState(false)
  const [creditSaving, setCreditSaving] = useState(false)
  const [creditPdfBusy, setCreditPdfBusy] = useState<string | null>(null)

  async function loadCredits(invoiceNumber: string) {
    const base = `CR${(invoiceNumber ?? '').replace(/^#+/, '').trim()}`
    if (base === 'CR') return
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, total, currency, invoice_date, delivery_notes, items, created_at')
      .like('order_number', `${base}%`)
      .neq('status', 'deleted')
      .order('created_at', { ascending: true })
    setExistingCredits(data ?? [])
  }

  useEffect(() => {
    if (order?.order_number) loadCredits(order.order_number)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.order_number])

  /**
   * The credit note PDF, built from the credit note's OWN order row. It goes
   * through exactly the same path as the invoice — same generator, same
   * download helper, same in-app viewer with the Share button — so the iPhone
   * share sheet behaves identically. Nothing here is a second implementation.
   */
  async function buildCreditNotePdfBlob(creditNote: any): Promise<Blob> {
    const React = await import('react')
    const { pdf } = await import('@react-pdf/renderer')
    const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')
    const { data: companyData } = await supabase
      .from('company_settings').select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001').single()

    return (pdf as any)(
      React.createElement(DeliveryNotePDF as any, {
        order: { ...creditNote, customer: order?.customer },
        batches: await (await import('@/lib/order-batches')).fetchOrderBatches(order?.id),
        showPrices: true,
        company: companyData ?? undefined,
        documentType: 'CREDIT NOTE',
        creditOfNumber: order?.order_number ?? '',
      })
    ).toBlob()
  }

  async function handleCreditNotePdf(creditNote: any, mode: 'download' | 'view') {
    setCreditPdfBusy(creditNote.id)
    try {
      const blob = await buildCreditNotePdfBlob(creditNote)
      const { isMobileDevice, triggerDownload, orderDocumentFilename } = await import('@/lib/download-pdf')
      const filename = orderDocumentFilename({ ...creditNote, cash_invoice: order?.cash_invoice, customer: order?.customer })
      // Same rule as the invoice: on a phone show it first, then Share sends the
      // actual named file. Never pre-open a tab — that freezes iOS Safari.
      if (mode === 'view' || isMobileDevice()) {
        showPdfInApp(blob, 'Credit Note', filename)
      } else {
        triggerDownload(blob, filename)
      }
    } catch (err: any) {
      toast.error(`Credit note PDF failed: ${err?.message ?? 'unknown error'}`, { duration: 8000 })
    } finally {
      setCreditPdfBusy(null)
    }
  }

  async function handleCreateCreditNote() {
    if (!order || creditLines.length === 0 || !creditReason.trim()) return
    setCreditSaving(true)
    try {
      // NEGATIVE quantities and a NEGATIVE total. That single choice is what
      // makes every existing sum come out right: revenue drops, the bottle
      // count on the stock page drops, the customer's totals drop. Storing it
      // positive would mean special-casing every total in the app, forever.
      const items = creditLines.map(l => ({
        sku: l.sku,
        name: l.name,
        qty: -l.qty,
        unit_price: l.unit,
        discount: 0,
        line_total: -(l.qty * l.unit),
      }))

      const { error } = await supabase.from('orders').insert({
        customer_id: order.customer_id,
        order_number: creditNumber || await getCreditNoteNumber(order.order_number ?? ''),
        credit_note_of: order.id,
        order_type: 'credit_note',
        // 'paid' on purpose: revenue counts this status so the credit lands in
        // the figures, while the overdue chase only looks at invoice_ready and
        // invoice_blocked — there is nothing to collect on a credit note.
        status: 'paid',
        payment_type: (order as any).payment_type ?? 'invoice',
        items,
        total: -creditTotal,
        delivery_notes: creditReason.trim(),
        assigned_to: null,
        planned_date: null,
      } as any)
      if (error) throw error

      toast.success(`${creditNumber} created — ${fmt(creditTotal)} credited`)
      setCreditOpen(false)
      await loadCredits(order.order_number ?? '')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not create the credit note', { duration: 10000 })
    } finally {
      setCreditSaving(false)
    }
  }

  async function handleDeleteCreditNote() {
    if (!creditDeleteTarget || !creditDeleteReason.trim() || !creditDeletePassword) return
    setCreditDeleting(true)
    try {
      // Re-authenticate — same guard the order delete uses.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: profile?.email ?? '',
        password: creditDeletePassword,
      })
      if (authError) {
        toast.error('Incorrect password')
        setCreditDeleting(false)
        return
      }

      // Soft delete, like an order: the document stays, it simply stops
      // counting. A credit note that vanished without trace would be the very
      // problem credit notes exist to solve.
      await supabase.from('orders').update({
        status: 'deleted',
        deleted_by: profile?.id,
        deleted_reason: creditDeleteReason.trim(),
        deleted_at: new Date().toISOString(),
      } as any).eq('id', creditDeleteTarget.id)

      toast.success(`${creditDeleteTarget.order_number} deleted`)
      setCreditDeleteTarget(null)
      setCreditDeleteReason('')
      setCreditDeletePassword('')
      if (order?.order_number) await loadCredits(order.order_number)
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not delete the credit note')
    } finally {
      setCreditDeleting(false)
    }
  }

  // When a portal request (pending, no order number yet) opens, suggest the
  // next order number so the admin can accept or override it, and prefill any
  // existing planned date.
  useEffect(() => {
    if (order?.status === 'pending_approval' && !order.order_number) {
      getNextOrderNumber().then(setApproveOrderNum).catch(() => {})
    }
    if (order?.planned_date) setApproveDate(order.planned_date)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.status])

  // Show a PDF inside the app (so the user SEES it first), with a Share button
  // that sends the actual named file — the only iOS-reliable way to preview
  // AND forward a correctly-named file.
  function showPdfInApp(blob: Blob, title: string, filename: string) {
    setPdfTitle(title)
    setPdfShareFile(new File([blob], filename, { type: 'application/pdf' }))
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
    setPdfBlobUrl(URL.createObjectURL(blob))
  }

  async function sharePdf() {
    if (!pdfShareFile || isSharing) return
    setIsSharing(true)
    try {
      const { sharePdfFile } = await import('@/lib/download-pdf')
      await sharePdfFile(supabase, pdfShareFile, msg => toast.error(msg, { duration: 10000 }))
    } finally {
      setIsSharing(false)
    }
  }
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Live-render an Invoice or Delivery Note from the database. NEVER embeds a
  // photo: the delivery photo is not stored in a queryable field — it exists
  // only baked into the signed PDF captured at delivery time (pod_file_url is
  // the SIGNATURE, not a photo). The Signed Invoice therefore serves that
  // stored PDF; this function is only for the plain Invoice / Delivery Note.
  /**
   * Put a wrong name right, on the order and on the runs that carried it.
   *
   * Only the deliveries that were on the OLD name move across. An order can go
   * out in parts with different people (migration 059), and overwriting all of
   * them would erase a split that actually happened in order to fix a typo.
   */
  async function reassign(userId: string) {
    const previous = order?.assigned_to ?? null
    if (!order || userId === previous) return
    try {
      await updateOrder.mutateAsync({ id: order.id, values: { assigned_to: userId } as never })

      const runs = supabase.from('deliveries').update({ assigned_to: userId }).eq('order_id', order.id)
      const { error } = previous
        ? await runs.eq('assigned_to', previous)
        : await runs.is('assigned_to', null)
      if (error) throw error

      const name = (users ?? []).find(u => u.id === userId)?.name ?? 'them'
      toast.success(`Reassigned to ${name} — order and its delivery runs`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reassign this order')
    }
  }

  async function buildDeliveryPdfBlob(docType: 'INVOICE' | 'DELIVERY NOTE'): Promise<Blob> {
    const delivery = (order as any).delivery
    const React = await import('react')
    const { pdf } = await import('@react-pdf/renderer')
    const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')
    const { data: companyData } = await supabase.from('company_settings').select('*').eq('id', '00000000-0000-0000-0000-000000000001').single()
    const signatureDataUrl: string | undefined = (order as any).signature_data_url ?? undefined
    const tableBottlesReturned = delivery?.table_bottles_returned ?? 0
    const tableBottlesNotes = delivery?.table_bottles_notes ?? ''
    const signerName: string | undefined = delivery?.signer_name ?? undefined
    return (pdf as any)(
      React.createElement(DeliveryNotePDF as any, {
        order,
        signatureDataUrl,
        tableBottlesReturned,
        tableBottlesNotes,
        signerName,
        deliveryPhotoDataUrl: undefined,
        showPrices: docType === 'INVOICE' ? isAdmin : false,
        company: companyData ?? undefined,
        documentType: docType,
        batches: await (await import('@/lib/order-batches')).fetchOrderBatches(order?.id),
      })
    ).toBlob()
  }

  async function handleViewPDF(type: 'invoice' | 'note') {
    if (!order) return
    setIsGeneratingPreview(type)
    try {
      const docType = type === 'invoice' ? 'INVOICE' : 'DELIVERY NOTE'
      const label = type === 'invoice' ? 'Invoice' : 'Delivery Note'
      const blob = await buildDeliveryPdfBlob(docType)
      const { orderDocumentFilename } = await import('@/lib/download-pdf')
      const filename = orderDocumentFilename(order, order.id.slice(0, 8))
      showPdfInApp(blob, label, filename)
    } catch (err: any) {
      toast.error(`Preview failed: ${err?.message ?? 'unknown error'}`, { duration: 8000 })
      console.error(err)
    } finally {
      setIsGeneratingPreview(null)
    }
  }

  function signedPdfStoragePath(): string | null {
    const stored = (order as any)?.signed_pdf_url
    if (!stored) return null
    // Old rows hold a full public URL, new ones a path. storagePath takes both
    // — the same function the rest of the app uses, so they cannot drift.
    return storagePath('pod-files', stored)
  }

  // The Signed Invoice = the stored PDF captured at delivery time: a full
  // INVOICE (prices) + the real signature + the real delivery photo (if one was
  // taken). That photo lives ONLY inside this stored file — it is not in any
  // queryable column — so we serve the stored file rather than regenerate.
  // Only if the stored file is missing or broken (0 bytes) do we regenerate a
  // fresh INVOICE (prices + signature, no photo, since the photo is unavailable)
  // and back it up.
  async function buildSignedInvoiceBlob(): Promise<{ blob: Blob; filename: string }> {
    // orderNum/customerName stay as they are — they build the STORAGE path
    // further down, which must keep matching the files already stored.
    const orderNum = (order!.order_number ?? order!.id.slice(0, 8)).replace(/[/\\:*?"<>|]/g, '').trim()
    const customerName = (order!.customer?.company_name ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
    const { orderDocumentFilename } = await import('@/lib/download-pdf')
    const filename = orderDocumentFilename(order, order!.id.slice(0, 8))

    // Try the stored PDF first (has the real photo)
    const storedPath = signedPdfStoragePath()
    if (storedPath) {
      try {
        const { data, error } = await supabase.storage.from('pod-files').createSignedUrl(storedPath, 120)
        if (!error && data?.signedUrl) {
          const res = await fetch(data.signedUrl)
          if (res.ok) {
            const blob = await res.blob()
            if (blob.size > 1024) return { blob, filename } // valid stored file
          }
        }
      } catch { /* fall through to regenerate */ }
    }

    // No usable stored file → regenerate a fresh invoice (no photo available) and back it up
    const blob = await buildDeliveryPdfBlob('INVOICE')
    try {
      const path = `signed-notes/${customerName ? `${orderNum} - ${customerName}` : orderNum}.pdf`
      await supabase.storage.from('pod-files').upload(path, blob, { upsert: true, contentType: 'application/pdf' })
      // The PATH, not a public URL: pod-files is private. See lib/storage.ts.
      try { await updateOrder.mutateAsync({ id: order!.id, values: { signed_pdf_url: path } as any }) } catch { /* non-fatal */ }
    } catch { /* non-fatal */ }
    return { blob, filename }
  }

  async function handleViewSignedPDF() {
    if (!order) return
    setIsDownloadingSigned(true)
    try {
      const { blob, filename } = await buildSignedInvoiceBlob()
      showPdfInApp(blob, 'Signed Invoice', filename)
    } catch (err: any) {
      toast.error(`Could not open signed invoice: ${err?.message ?? 'unknown error'}`, { duration: 8000 })
    } finally {
      setIsDownloadingSigned(false)
    }
  }

  async function handleDownloadSignedPDF() {
    if (!order) return
    setIsDownloadingSigned(true)
    try {
      const { blob, filename } = await buildSignedInvoiceBlob()
      const { isMobileDevice, triggerDownload } = await import('@/lib/download-pdf')
      if (isMobileDevice()) {
        showPdfInApp(blob, 'Signed Invoice', filename) // preview + Share button
      } else {
        triggerDownload(blob, filename)
      }
    } catch (err: any) {
      toast.error(`Download failed: ${err?.message ?? 'unknown error'}`, { duration: 8000 })
    } finally {
      setIsDownloadingSigned(false)
    }
  }

  async function handleDownloadPDF(type: 'invoice' | 'note') {
    if (!order) return
    setIsDownloading(type)

    try {
      const docType = type === 'invoice' ? 'INVOICE' : 'DELIVERY NOTE'
      const label = type === 'invoice' ? 'Invoice' : 'Delivery Note'
      const blob = await buildDeliveryPdfBlob(docType)

      const { isMobileDevice, triggerDownload, orderDocumentFilename } = await import('@/lib/download-pdf')
      const filename = orderDocumentFilename(order, order.id.slice(0, 8))
      if (isMobileDevice()) {
        showPdfInApp(blob, label, filename) // preview in-app, then Share button
      } else {
        triggerDownload(blob, filename)
      }
    } catch (err: any) {
      // Show the real error — silent blanks made mobile issues undiagnosable
      toast.error(`Download failed: ${err?.message ?? 'unknown error'}`, { duration: 8000 })
      console.error(err)
    } finally {
      setIsDownloading(null)
    }
  }

  // How much of each line earlier credit notes already took, so the same
  // bottles can never be credited twice across two documents.
  const alreadyCredited: Record<string, number> = {}
  for (const cn of existingCredits) {
    for (const line of ((cn.items ?? []) as QuoteItem[])) {
      alreadyCredited[line.sku] = (alreadyCredited[line.sku] ?? 0) + Math.abs(Number(line.qty) || 0)
    }
  }

  // Lines that can be credited: what was actually invoiced, minus what has
  // already been credited. Free and returned SKUs are priced at 0, so crediting
  // them is meaningless — they are left out.
  const creditableItems = ((order?.items ?? []) as QuoteItem[])
    .filter(i => i.qty > 0 && Number(i.unit_price) - Number(i.discount ?? 0) > 0)
    .map(i => ({ ...i, remaining: i.qty - (alreadyCredited[i.sku] ?? 0) }))
    .filter(i => i.remaining > 0)

  const creditLines = creditableItems
    .map(i => ({
      sku: i.sku,
      name: i.name,
      qty: creditQty[i.sku] ?? 0,
      unit: Number(i.unit_price) - Number(i.discount ?? 0),
    }))
    .filter(l => l.qty > 0)

  const creditTotal = creditLines.reduce((s, l) => s + l.qty * l.unit, 0)

  function handleClosePdf() {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
    setPdfBlobUrl(null)
    setPdfShareFile(null)
  }

async function handleUploadSigned(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !order) return
    setIsUploading(true)
    try {
      const supabase = createClient()
      const safeOrder = (order.order_number ?? order.id.slice(0, 8)).replace(/[/\\:*?"<>|]/g, '').trim()
      const safeCust = (order.customer?.company_name ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
      // Keep the real file extension — a photo saved as ".pdf" is unopenable
      const ext = file.type === 'application/pdf' ? 'pdf' : (file.name.split('.').pop()?.toLowerCase() ?? 'pdf')
      const path = `signed-notes/${safeCust ? `${safeOrder} - ${safeCust}` : safeOrder}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('pod-files')
        .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' })
      if (uploadError) throw uploadError

      // The PATH, not a public URL: pod-files is private. See lib/storage.ts.
      await updateOrder.mutateAsync({ id: order.id, values: { signed_pdf_url: path } as any })
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
    <div className="p-3 lg:p-6 space-y-3 max-w-3xl mx-auto w-full">
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
            {(order as any).is_consignment && (
              <Badge className="text-xs bg-amber-100 text-amber-700">📦 Consignment</Badge>
            )}
            {(order as any).cash_invoice && (
              <Badge className="text-xs bg-slate-200 text-slate-700">💵 Cash Payment invoice</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">{order.customer?.company_name}</p>
        </div>
      </div>

      {/* Status Timeline */}
      {order.status !== 'invoice_blocked' && (
        <Card size="sm">
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
        <Card size="sm" className="border-red-200 bg-red-50 dark:bg-red-950/20">
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
        <Card size="sm" className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
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
            <p className="text-sm text-orange-600/80">Give it an order number and a delivery date, assign a worker, then approve.</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Order number</p>
                <Input value={approveOrderNum} onChange={(e) => setApproveOrderNum(e.target.value)} placeholder="Next number" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Delivery date</p>
                <Input type="date" value={approveDate} onChange={(e) => setApproveDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Assign to worker</p>
              <Select value={selectedWorker} onValueChange={(v) => setSelectedWorker(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a worker…">
                    {users?.find(u => u.id === selectedWorker)?.name ?? undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(users ?? []).filter(u => u.role !== 'customer' && u.is_active !== false).map(u => (
                    <SelectItem key={u.id} value={u.id} label={u.name}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                disabled={!selectedWorker || !approveOrderNum.trim() || !approveDate || updateOrder.isPending}
                onClick={() => updateOrder.mutate({
                  id: order.id,
                  values: { status: 'processing', assigned_to: selectedWorker, order_number: approveOrderNum.trim(), planned_date: approveDate } as any,
                }, {
                  onSuccess: () => {
                    // No mail to the customer. Danique, 2026-08-14: the e-mail
                    // addresses on a customer card are OURS, for internal use —
                    // approving an order here is an internal act and the
                    // customer never asked to hear about it. Only somebody who
                    // ordered through the B2B portal gets order updates, and
                    // that mail is sent from the portal itself.
                    // Notify assigned worker
                    fetch('/api/notify', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: 'order_out_for_delivery',
                        payload: {
                          orderNumber: approveOrderNum.trim(),
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

      {/* Estimated Bottle Return */}
      {isAdmin && order.customer?.track_table_bottles && !['delivered', 'invoice_ready', 'paid', 'invoice_blocked', 'deleted'].includes(order.status) && (() => {
        const returnPrice = order.customer?.table_bottle_return_price ?? 2.50
        const returnItem = (order.items ?? []).find((i: any) => i.sku === 'oil-30ml-table-return')
        const savedQty = returnItem && returnItem.qty < 0 ? Math.abs(returnItem.qty) : 0
        const displayQty = estimatedBottles !== '' ? Number(estimatedBottles) : savedQty
        const estimatedCredit = displayQty > 0 ? displayQty * returnPrice : null
        const isDirty = estimatedBottles !== '' && Number(estimatedBottles) !== savedQty

        function saveReturnToItems() {
          if (!order) return
          const qty = Number(estimatedBottles)
          const newItems = (order.items ?? []).map((i: any) => {
            if (i.sku !== 'oil-30ml-table-return') return i
            if (qty === 0) return { ...i, qty: 0, unit_price: 0, line_total: 0 }
            return { ...i, qty: -qty, unit_price: returnPrice, discount: 0, line_total: -(qty * returnPrice) }
          })
          const newTotal = newItems.reduce((sum: number, i: any) => sum + (i.line_total ?? 0), 0)
          updateOrder.mutate({ id: order.id, values: { items: newItems, total: newTotal } as any })
          setEstimatedBottles('')
        }

        return (
          <Card size="sm">
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <PackageCheck className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1">Estimated bottle return</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={estimatedBottles !== '' ? estimatedBottles : (savedQty > 0 ? String(savedQty) : '')}
                      onChange={e => setEstimatedBottles(e.target.value)}
                      className="h-8 w-24"
                    />
                    <span className="text-sm text-muted-foreground">bottles</span>
                    {isDirty && (
                      <Button
                        size="sm"
                        onClick={saveReturnToItems}
                        disabled={updateOrder.isPending}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Save
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {estimatedCredit !== null && (
                <div className="flex justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-muted-foreground">Estimated credit ({displayQty} × {fmt(returnPrice)})</span>
                  <span className="font-medium text-green-600">- {fmt(estimatedCredit)}</span>
                </div>
              )}
              {estimatedCredit !== null && (
                <div className="flex justify-between text-sm px-3">
                  <span className="text-muted-foreground">Estimated net total</span>
                  <span className="font-semibold">{fmt(Number(order.total) - estimatedCredit)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* Planned Delivery Date */}
      {(order.status === 'processing' || order.status === 'out_for_delivery') && (
        <Card size="sm">
          <CardContent>
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

      {isAdmin && <DefectReportsPanel orderId={order.id} />}

      {/* Free POS material this reseller asked for. Sales may grant it too —
          they stand in the shop and know whether that shelf exists. */}
      {order.customer_id && (order as any).order_type !== 'credit_note' && (
        <PosRequestsPanel
          customerId={order.customer_id}
          orderId={order.id}
          items={(order.items ?? []) as any}
          canGrant={can('pos.grant')}
        />
      )}

      {/* Consignment — the note itself is not payable; the period invoices are */}
      {isAdmin && (order as any).is_consignment && (order as any).order_type !== 'credit_note' && (
        <ConsignmentPanel order={order} />
      )}

      {/* Cash Payment invoice — admin decides what the paper says. The order
          itself stays attached to the customer: revenue, history and the chase
          are all unaffected, only the printed document changes. */}
      {isAdmin && (
        <Card size="sm">
          <CardContent>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-red-600 shrink-0"
                checked={(order as any).cash_invoice === true}
                onChange={(e) =>
                  updateOrder.mutate({ id: order.id, values: { cash_invoice: e.target.checked } as any })
                }
              />
              <div>
                <p className="text-sm font-medium">Print as &ldquo;Cash Payment&rdquo;</p>
                <p className="text-xs text-muted-foreground">
                  The invoice and delivery note show <strong>Cash Payment</strong> instead of the
                  customer&rsquo;s company details, and the file is named without their name.
                  The order stays linked to {order.customer?.company_name ?? 'this customer'} everywhere in the CRM.
                </p>
              </div>
            </label>
          </CardContent>
        </Card>
      )}

      {/* Invoice Date (admin only) */}
      {isAdmin && (
        <Card size="sm">
          <CardContent>
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
        <Card size="sm">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Payment Type</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cash orders use a separate number series (C-YYYY-XXXX)
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                {/* Currency — read-only on purpose. It is decided at customer
                    level (051): change it on the customer and every order,
                    price and invoice follows. Converting a single order here
                    would put its prices out of step with the customer's. */}
                <div
                  className="flex items-center rounded-lg border px-2.5 py-1.5 shrink-0 gap-1.5"
                  title="Set on the customer — an order always follows its customer's currency"
                >
                  <span className="text-xs font-semibold">{cur}</span>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">from customer</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit note — a correction on an invoice that has already gone out.
          Deliberately has none of the delivery machinery: no planned date, no
          assignee, no signature, no proof photo. It is a money document, and it
          is created FROM the order so the link between the two is never in
          doubt. */}
      {isAdmin && (
        <Card size="sm">
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Credit Note</p>
                <p className="text-xs text-muted-foreground">
                  {order.invoice_date
                    ? `Correct this invoice without deleting it. Links to ${order.order_number}.`
                    : 'This order has not been invoiced yet — nothing to correct.'}
                </p>
              </div>
              <Button
                variant="outline"
                className="shrink-0 gap-2 border-red-200 text-red-600 hover:bg-red-50"
                disabled={!order.invoice_date}
                onClick={async () => {
                  setCreditQty({})
                  setCreditReason('')
                  setCreditNumber('')
                  setCreditOpen(true)
                  // CR + this invoice's number, so the two documents read as a
                  // pair without anyone having to look anything up.
                  try { setCreditNumber(await getCreditNoteNumber(order.order_number ?? '')) } catch { /* shown as pending */ }
                  // Refresh what has already been credited, so the caps are
                  // right even if another tab raised one a moment ago.
                  try { await loadCredits(order.order_number ?? '') } catch { /* empty list shows nothing */ }
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Credit Note
              </Button>
            </div>

            {/* Credit notes raised against this invoice, on the page itself so
                they are visible without opening anything. */}
            {existingCredits.length > 0 && (
              <div className="border rounded-lg divide-y">
                {existingCredits.map(cn => (
                  <div key={cn.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium">{cn.order_number}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cn.invoice_date
                          ? new Date(cn.invoice_date + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                        {cn.delivery_notes ? ` · ${cn.delivery_notes}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-red-600 shrink-0">
                      − {cn.currency ?? 'XCG'} {Math.abs(Number(cn.total) || 0).toFixed(2)}
                    </p>
                    <button
                      type="button"
                      title="Download credit note"
                      disabled={creditPdfBusy === cn.id}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-50"
                      onClick={() => handleCreditNotePdf(cn, 'download')}
                    >
                      {creditPdfBusy === cn.id
                        ? <Clock className="h-4 w-4 animate-spin" />
                        : <Download className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      title="View credit note"
                      disabled={creditPdfBusy === cn.id}
                      className="text-green-600 hover:text-green-700 transition-colors shrink-0 disabled:opacity-50"
                      onClick={() => handleCreditNotePdf(cn, 'view')}
                    >
                      <FileCheck className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Delete credit note"
                      className="text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                      onClick={() => {
                        setCreditDeleteTarget(cn)
                        setCreditDeleteReason('')
                        setCreditDeletePassword('')
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Deleting a credit note — admin only, reason and password, exactly the
          guard an order delete uses. Soft delete: the document stays on record
          and simply stops counting. */}
      {creditDeleteTarget && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-background w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="font-semibold text-sm">Delete {creditDeleteTarget.order_number}</p>
              <Button variant="ghost" size="icon" onClick={() => setCreditDeleteTarget(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-3 py-2.5">
                <p className="text-xs text-red-700 dark:text-red-400">
                  The credited quantities go back to {order.order_number} and can be credited again.
                  The credit note stays on record as deleted, with your reason.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Reason *</Label>
                <Input
                  value={creditDeleteReason}
                  onChange={e => setCreditDeleteReason(e.target.value)}
                  placeholder="e.g. raised against the wrong invoice"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Your password *</Label>
                <Input
                  type="password"
                  value={creditDeletePassword}
                  onChange={e => setCreditDeletePassword(e.target.value)}
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground">
                  Confirms it is really you — the same check as deleting an order.
                </p>
              </div>
            </div>

            <div className="flex gap-2 px-4 py-3 border-t pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <Button variant="outline" className="flex-1" onClick={() => setCreditDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={creditDeleting || !creditDeleteReason.trim() || !creditDeletePassword}
                onClick={handleDeleteCreditNote}
              >
                {creditDeleting ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete credit note
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Actions */}
      <Card size="sm">
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Documents</p>

          {/* Invoice */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Invoice</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleDownloadPDF('invoice')}
                disabled={isDownloading !== null}
                className="flex-1 sm:flex-none"
              >
                {isDownloading === 'invoice'
                  ? <Clock className="h-4 w-4 mr-2 animate-spin" />
                  : <Download className="h-4 w-4 mr-2" />
                }
                {isDownloading === 'invoice' ? 'Generating…' : 'Download Invoice'}
              </Button>
              <button
                onClick={() => handleViewPDF('invoice')}
                disabled={isGeneratingPreview !== null}
                className="inline-flex items-center gap-2 text-sm text-green-600 hover:underline disabled:opacity-50 px-1"
              >
                {isGeneratingPreview === 'invoice'
                  ? <><Clock className="h-4 w-4 animate-spin" /> Generating…</>
                  : <><FileCheck className="h-4 w-4" /> View Invoice</>
                }
              </button>
            </div>
          </div>

          {/* Delivery Note */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Delivery Note</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleDownloadPDF('note')}
                disabled={isDownloading !== null}
                className="flex-1 sm:flex-none"
              >
                {isDownloading === 'note'
                  ? <Clock className="h-4 w-4 mr-2 animate-spin" />
                  : <Download className="h-4 w-4 mr-2" />
                }
                {isDownloading === 'note' ? 'Generating…' : 'Download Delivery Note'}
              </Button>
              <button
                onClick={() => handleViewPDF('note')}
                disabled={isGeneratingPreview !== null}
                className="inline-flex items-center gap-2 text-sm text-green-600 hover:underline disabled:opacity-50 px-1"
              >
                {isGeneratingPreview === 'note'
                  ? <><Clock className="h-4 w-4 animate-spin" /> Generating…</>
                  : <><FileCheck className="h-4 w-4" /> View Delivery Note</>
                }
              </button>
            </div>
          </div>

          {/* Signed Invoice — the frozen signed proof-of-delivery. Available for
              any signed/delivered order; regenerates on demand if the PDF was
              never stored (generation failed on ~24% of past deliveries). */}
          {((order as any).signed_pdf_url || (order as any).signature_data_url ||
            ['delivered', 'invoice_ready', 'invoice_blocked', 'paid'].includes(order.status)) && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Signed Invoice (with proof of delivery)</p>
              <div className="flex flex-wrap gap-2">
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
                <button
                  onClick={handleViewSignedPDF}
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline px-1"
                >
                  <FileCheck className="h-4 w-4" /> View
                </button>
              </div>
            </div>
          )}

          {/* Upload signed */}
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
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
        </CardContent>
      </Card>

      {/* Signature Location — admin only */}
      {isAdmin && (() => {
        const sigLoc = (order.delivery as any)?.signature_location
        const startLoc = (order.delivery as any)?.gps_location
        if (!sigLoc && !startLoc) return null
        return (
          <Card size="sm" className="border-blue-100">
            <CardContent className="space-y-3">
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

      {/* Send Invoice — admin action for delivered orders */}
      {isAdmin && order.status === 'delivered' && (
        <Button
          className="w-full h-12 bg-green-600 hover:bg-green-700 gap-2"
          disabled={updateOrder.isPending}
          onClick={() => updateOrder.mutate({
            id: order.id,
            values: { status: 'invoice_ready' } as any,
          }, {
            // "Send Invoice" moves the order to invoice_ready and NOTHING
            // else. Danique, 2026-08-14: "als ik op send invoice klik, DAN MOET
            // ER NOOIT EEN MAIL OF BERICHT gestuurd worden naar klant — dit is
            // enkel voor intern gebruik". The invoice itself is downloaded and
            // sent by hand.
          })}
        >
          <CheckCircle className="h-5 w-5" />
          Send Invoice
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
      <Card size="sm">
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
            <div className="overflow-x-auto -mx-1 px-1">
              {/* Edit mode header */}
              <div className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-2 text-xs text-muted-foreground pb-1 border-b min-w-[340px]">
                <span>Product</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price ({cur})</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              {draftItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-2 items-center py-1 border-b last:border-0 min-w-[340px]">
                  <div>
                    <p className="text-sm font-medium leading-tight">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                  </div>
                  <QtyInput
                    value={item.qty}
                    onChange={qty => {
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
                <span>{fmt(draftItems.reduce((s, i) => s + i.line_total, 0))}</span>
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
            </div>
          ) : (
            <>
              {items.map((item, i) => (
                <div key={i}>
                  {i > 0 && <Separator className="my-2" />}
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      {isAdmin && <p className="text-xs text-muted-foreground">{item.sku} · {fmt(item.unit_price)} × {item.qty}</p>}
                      {!isAdmin && <p className="text-xs text-muted-foreground">{item.sku} · qty: {item.qty}</p>}
                      {/* THT per item — printed on the invoice for traceability */}
                      {isAdmin ? (
                        item.qty > 0 && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-xs ${item.tht_date ? 'text-muted-foreground' : 'text-red-600 font-medium'}`}>THT</span>
                            <Input
                              type="month"
                              // A best-before in the past is always a typo. `min`
                              // greys out earlier months in the picker; the check
                              // below catches a typed one, which the picker does
                              // not prevent on every browser.
                              min={currentMonthInput()}
                              value={thtToMonthInput(item.tht_date)}
                              onChange={e => {
                                const month = e.target.value
                                if (month && month < currentMonthInput()) {
                                  toast.error('THT cannot be in the past')
                                  return
                                }
                                const newItems = items.map((it, idx) => idx === i ? { ...it, tht_date: monthInputToTht(month) ?? undefined } : it)
                                updateOrder.mutate({ id: order.id, values: { items: newItems } as any })
                              }}
                              className={`h-7 w-36 text-xs px-2 ${!item.tht_date ? 'border-red-300' : ''}`}
                            />
                          </div>
                        )
                      ) : (
                        item.tht_date && <p className="text-xs text-muted-foreground mt-0.5">THT: {formatTht(item.tht_date)}</p>
                      )}
                      {/* Which batch this product came off. Choosing one takes
                          the bottles off that batch straight away, so the stock
                          under Stock is what is really on the shelf — and the
                          batch number lands on the invoice and the packing
                          list. Per product, because one order can be picked
                          from more than one batch. */}
                      {isAdmin && item.qty > 0 && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-xs ${picks[item.sku] ? 'text-muted-foreground' : 'text-red-600 font-medium'}`}>Batch</span>
                          <BatchSelect
                            className="w-52"
                            sku={item.sku}
                            needed={item.qty}
                            value={picks[item.sku] ?? null}
                            onChange={batchId => setOrderPick.mutate({
                              orderId: order.id, sku: item.sku, qty: item.qty, batchId,
                            })}
                          />
                        </div>
                      )}
                    </div>
                    {isAdmin && <p className="font-semibold text-sm shrink-0">{fmt(item.line_total)}</p>}
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
                        <span>{fmt(Number(order.total))}</span>
                      </div>
                      <div className="flex justify-between text-sm text-red-600">
                        <span>Table bottle credit ({order.delivery?.table_bottles_returned} × {fmt(order.customer?.table_bottle_return_price ?? 2.50)})</span>
                        <span>- {fmt(bottleCredit)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>{fmt(adjustedTotal)}</span>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* POS material on this order.

          On the ORDER and not on one screen in the flow, because there is no
          single moment where a stand gets decided. It can start in Curacao,
          be ordered in the Netherlands, or come from China into a warehouse —
          her correction of 2026-08-16. Wherever the order is opened, this is
          here, and it is the same €0 line every time. */}
      <OrderPosLine order={order as never} />

      {/* Edit Log — shown when post-signature changes have been made */}
      {isAdmin && (order.edit_log ?? []).length > 0 && (
        <Card size="sm" className="border-orange-200">
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
                      <p key={j} className="text-xs">{item.qty}× {item.name} — {fmt(item.line_total)}</p>
                    ))}
                    <p className="text-xs font-bold mt-1">Total: {fmt(entry.old_total)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">After</p>
                    {entry.new_items.map((item, j) => (
                      <p key={j} className="text-xs">{item.qty}× {item.name} — {fmt(item.line_total)}</p>
                    ))}
                    <p className="text-xs font-bold mt-1">Total: {fmt(entry.new_total)}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* PO Number — admin editable */}
      {isAdmin && (
        <Card size="sm">
          <CardContent>
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

      {/* Export section — driven by the delivery COUNTRY, not by a switch and
          not by the price category. The category doubles as the price list, so
          gating on it meant that changing someone's pricing silently took their
          customs paperwork away (La Bandera, 2026-08-02). The switch that
          replaced it could be forgotten just as silently, so since 2026-08-15
          the address decides — see lib/country.ts. */}
      {isAdmin && isExportCustomer(order.customer) && (
        <ExportOrderSection order={order} />
      )}

      {/* Details */}
      <Card size="sm">
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {/* Correctable, because a wrong name could not be put right anywhere.
              It is set at Approve & Assign and again when a run goes out, and
              once an order is delivered both those screens are gone for good —
              so 729147 sat there saying Djamy with no way to change it.

              Was hardcoded to admin; now it follows work.assign, so the
              Permissions screen decides. Who did the work is a payroll-adjacent
              fact, which is why nobody holds it by default except the admin. */}
          {can('work.assign') ? (
            <div className="flex justify-between gap-4 items-center">
              <span className="text-muted-foreground">Assigned To</span>
              <Select
                value={order.assigned_to ?? undefined}
                onValueChange={v => v && reassign(v)}
              >
                <SelectTrigger className="h-7 w-44 text-xs px-2">
                  <SelectValue placeholder="Nobody">
                    {(v: string) => (users ?? []).find(u => u.id === v)?.name ?? 'Nobody'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(users ?? [])
                    .filter(u => ['admin', 'manager', 'sales', 'warehouse', 'staff'].includes(u.role)
                      && (u as { is_active?: boolean }).is_active !== false)
                    .map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <Row label="Assigned To" value={order.assigned_user?.name ?? '—'} />
          )}
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

      {/* Credit note dialog. Amount and reason, nothing else — no date to plan,
          nobody to assign, nothing to sign. */}
      {creditOpen && (
        // z-[60]: the bottom navigation bar is z-50 and would otherwise paint
        // over the Cancel / Create buttons on a phone.
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-background w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border shadow-xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <p className="font-semibold text-sm">Credit note for {order.order_number}</p>
              <Button variant="ghost" size="icon" onClick={() => setCreditOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit note #</span>
                  <span className="font-mono font-semibold">{creditNumber || '…'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit of invoice</span>
                  <span className="font-mono font-medium">{order.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{order.customer?.company_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoiced</span>
                  <span className="font-medium">
                    {order.invoice_date
                      ? new Date(order.invoice_date + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice total</span>
                  <span className="font-medium">{fmt(Number(order.total))}</span>
                </div>
              </div>

              {/* Credit notes already raised against this invoice. Shown before
                  the lines, so it is obvious what has been done before rather
                  than something you discover after issuing a duplicate. */}
              {existingCredits.length > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 px-3 py-2.5 space-y-1.5">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                    Already credited on this invoice ({existingCredits.length})
                  </p>
                  {existingCredits.map(cn => (
                    <div key={cn.id} className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-mono font-medium text-orange-800 dark:text-orange-300">{cn.order_number}</p>
                        <p className="text-orange-700/80 dark:text-orange-400/80">
                          {cn.invoice_date
                            ? new Date(cn.invoice_date + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                          {cn.delivery_notes ? ` · ${cn.delivery_notes}` : ''}
                        </p>
                      </div>
                      <p className="font-semibold shrink-0 text-orange-800 dark:text-orange-300">
                        {cn.currency ?? 'XCG'} {Math.abs(Number(cn.total) || 0).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {creditableItems.length === 0 && (
                <div className="rounded-lg border px-3 py-4 text-center text-sm text-muted-foreground">
                  Everything on this invoice has already been credited.
                </div>
              )}

              {/* Lines. Set how many of each product are being credited — the
                  amount follows from that, it is never typed in loose. */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>What is being credited *</Label>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => setCreditQty(Object.fromEntries(
                      creditableItems.map(i => [i.sku, i.remaining]),
                    ))}
                  >
                    Credit everything
                  </button>
                </div>
                <div className="border rounded-lg divide-y">
                  {creditableItems.map(item => {
                    const unit = Number(item.unit_price) - Number(item.discount ?? 0)
                    const qty = creditQty[item.sku] ?? 0
                    return (
                      // Two rows on a phone: the product name gets the full
                      // width instead of being truncated to "SPika Oil - 1…",
                      // with the quantity and the amount underneath.
                      <div key={item.sku} className="px-3 py-2">
                        <p className="text-sm font-medium">{item.name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-muted-foreground flex-1 min-w-0">
                            {item.qty} invoiced · {fmt(unit)} each
                            {item.remaining < item.qty && (
                              <span className="text-orange-600"> · {item.qty - item.remaining} already credited</span>
                            )}
                          </p>
                          <QtyInput
                            value={qty}
                            onChange={v => setCreditQty(prev => ({
                              ...prev,
                              [item.sku]: Math.max(0, Math.min(v, item.remaining)),
                            }))}
                            className="h-8 w-20 shrink-0"
                          />
                          <p className="text-sm font-semibold w-24 text-right shrink-0">
                            {qty > 0 ? `− ${fmt(qty * unit)}` : '—'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Never more than what was invoiced on that line.
                </p>
              </div>

              <div className="flex justify-between items-center px-1 pt-1 border-t font-bold">
                <span>Credit total</span>
                <span className="text-red-600">− {fmt(creditTotal)}</span>
              </div>

              <div className="space-y-1.5">
                <Label>Reason *</Label>
                <Input
                  value={creditReason}
                  onChange={e => setCreditReason(e.target.value)}
                  placeholder="e.g. returned damaged"
                />
                <p className="text-xs text-muted-foreground">
                  Printed on the credit note and kept with the order.
                </p>
              </div>

              {/* What this will create — spelled out so nothing is a surprise. */}
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-3 py-2.5 space-y-1">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">This creates</p>
                <ul className="text-xs text-red-700/90 dark:text-red-400/90 space-y-0.5">
                  <li>• <strong>{creditNumber || 'CR-…'}</strong> — a credit note of <strong>− {fmt(creditTotal)}</strong> over {creditLines.length} line{creditLines.length === 1 ? '' : 's'}, against invoice {order.order_number}</li>
                  <li>• Dated today — no delivery, no driver, no signature</li>
                  <li>• Currency and rate copied from this order, so the amount matches the invoice</li>
                  <li>• Subtracted from your revenue; kept out of the payment chase</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-2 px-4 py-3 border-t shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <Button variant="outline" className="flex-1" onClick={() => setCreditOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={creditSaving || !creditReason.trim() || creditLines.length === 0}
                onClick={handleCreateCreditNote}
              >
                {creditSaving && <Clock className="h-4 w-4 mr-2 animate-spin" />}
                Create credit note
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* In-app PDF Viewer */}
      {pdfBlobUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-background border-b gap-2">
            <p className="font-semibold text-sm truncate">{pdfTitle} — {order.order_number}</p>
            <div className="flex items-center gap-2 shrink-0">
              {pdfShareFile && (
                <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5" onClick={sharePdf} disabled={isSharing}>
                  {isSharing ? <Clock className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Share
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={handleClosePdf}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <iframe
            src={pdfBlobUrl}
            className="flex-1 w-full bg-white"
            title={pdfTitle}
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
  partly_delivered: 'bg-amber-100 text-amber-700',
  delivered: 'bg-emerald-100 text-emerald-700',
}
const EXP_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', ready: 'Ready', submitted: 'Submitted', cleared: 'Cleared', delivered: 'Delivered',
}
const EXP_STATUSES = ['draft', 'ready', 'submitted', 'cleared', 'delivered']
const BTLS_PER_CTN = 12
const KG_PER_CTN = 5

/**
 * An export order is a normal order that happens to be for an international
 * customer. Everything about the journey — carrier, colli, ETD, ETA, freight —
 * lives on the TRANSPORT it is put on, under the Export tab. This card only
 * says where that is, so the order page never becomes a second place to edit a
 * shipment.
 */
function ExportOrderSection({ order }: { order: Order & { customer?: any } }) {
  // ALL of them since migration 100. An order that was sent, lost and sent
  // again is on two transports, and a card that shows one of them is a card
  // that hides the other.
  const { data: transports } = useTransportsForOrder(order.id)
  const list = transports ?? []

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Ship className="h-4 w-4" />
          Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {list.length > 0 ? (
          <>
            {list.map(t => {
              // The boxes on THAT transport that were packed for this order.
              // Loose boxes on it belong to no order and are not counted here.
              const colli = (t.colli_contents ?? []).filter(c => c.for_order_id === order.id).length
              return (
                <div key={t.id} className="flex items-baseline justify-between gap-4">
                  <Link
                    href={`/exports/${t.id}`}
                    className="font-mono font-medium text-red-600 hover:underline shrink-0"
                  >
                    {t.transport_number}
                  </Link>
                  <span className="text-muted-foreground text-xs truncate">
                    {t.destination || '—'}
                    {colli > 0 && ` · ${colli} colli`}
                  </span>
                </div>
              )
            })}
            {list.length > 1 && (
              <p className="text-xs text-muted-foreground">
                On more than one transport — a load that had to be sent again, or a
                delivery split over two runs.
              </p>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground">Not on a transport yet</p>
            <Link href="/exports">
              <Button variant="outline" size="sm">Go to Export</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
