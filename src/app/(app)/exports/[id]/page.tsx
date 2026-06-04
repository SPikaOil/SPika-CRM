'use client'

import { use, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Download, Upload, Trash2, PackageCheck, FileText, Pencil, Check, X as XIcon,
} from 'lucide-react'
import {
  useExport, useExportDocuments, useUpdateExport,
  useDeleteExport, useUploadExportDocument, useDeleteExportDocument,
} from '@/hooks/use-exports'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ExportStatus, QuoteItem } from '@/types'
import { toast } from 'sonner'
import { CompanyInfo } from '@/components/pdf/delivery-note-pdf'

const statusColors: Record<ExportStatus, string> = {
  draft:     'bg-gray-100 text-gray-700',
  ready:     'bg-blue-100 text-blue-700',
  submitted: 'bg-yellow-100 text-yellow-700',
  cleared:   'bg-green-100 text-green-700',
  delivered: 'bg-emerald-100 text-emerald-700',
}

const statusLabels: Record<ExportStatus, string> = {
  draft:     'Draft',
  ready:     'Ready',
  submitted: 'Submitted',
  cleared:   'Cleared',
  delivered: 'Delivered',
}

const BOTTLES_PER_CARTON = 12
const KG_PER_CARTON = 5

export default function ExportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: exportRecord, isLoading } = useExport(id)
  const { data: documents } = useExportDocuments(id)
  const updateExport = useUpdateExport()
  const deleteExport = useDeleteExport()
  const uploadDoc = useUploadExportDocument()
  const deleteDoc = useDeleteExportDocument()
  const { isAdmin } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [editingTht, setEditingTht] = useState(false)
  const [thtDraft, setThtDraft] = useState('')
  const [editingItemTht, setEditingItemTht] = useState<number | null>(null)
  const [itemThtDraft, setItemThtDraft] = useState('')
  const receivedFileRef = useRef<HTMLInputElement>(null)

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20">
        <p className="font-medium">Access restricted</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    )
  }

  if (!exportRecord) {
    return <div className="p-4 lg:p-6"><p>Export not found.</p></div>
  }

  // Narrowed non-null reference for use in async callbacks
  const exp = exportRecord

  const order = (exp as any).order
  const customer = order?.customer ?? (exp as any).customer
  const items: QuoteItem[] = (order?.items ?? exp.items ?? []) as QuoteItem[]
  const activeItems = items.filter(i => i.qty > 0)
  const totalQty = activeItems.reduce((sum, i) => sum + i.qty, 0)
  const totalCartons = Math.ceil(totalQty / BOTTLES_PER_CARTON)
  const totalWeight = totalCartons * KG_PER_CARTON

  async function saveItemTht(itemIndex: number, tht_date: string) {
    const updatedItems = items.map((item, i) =>
      i === itemIndex ? { ...item, tht_date: tht_date || undefined } : item
    )
    await updateExport.mutateAsync({ id, values: { items: updatedItems } as any })
    setEditingItemTht(null)
  }

  async function handleDeleteExport() {
    if (!confirm('Delete this export? This cannot be undone.')) return
    await deleteExport.mutateAsync(id)
    router.push('/exports')
  }

  async function fetchCompany(): Promise<CompanyInfo | undefined> {
    const { data } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single()
    return data ?? undefined
  }

  async function downloadPdf(type: 'commercial_invoice' | 'packing_list' | 'bill_of_lading' | 'shipping_label') {
    setIsDownloadingPdf(true)
    try {
      const React = await import('react')
      const { pdf } = await import('@react-pdf/renderer')
      const company = await fetchCompany()

      let element: React.ReactElement

      if (type === 'commercial_invoice') {
        const { CommercialInvoicePDF } = await import('@/components/pdf/exports/commercial-invoice-pdf')
        element = React.createElement(CommercialInvoicePDF, { exportRecord: exp, company })
      } else if (type === 'packing_list') {
        const { PackingListPDF } = await import('@/components/pdf/exports/packing-list-pdf')
        element = React.createElement(PackingListPDF, { exportRecord: exp, company })
      } else if (type === 'shipping_label') {
        const { ShippingLabelPDF } = await import('@/components/pdf/exports/shipping-label-pdf')
        const QRCode = (await import('qrcode')).default
        const qrUrl = `${window.location.origin}/exports/${exp.id}`
        const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 200 })
        element = React.createElement(ShippingLabelPDF, { exportRecord: exp, company, qrCodeDataUrl })
      } else {
        const { DonAndresBolPDF } = await import('@/components/pdf/exports/don-andres-bol-pdf')
        element = React.createElement(DonAndresBolPDF, { exportRecord: exp, company })
      }

      const blob = await pdf(element as any).toBlob()
      const labels = {
        commercial_invoice: 'Commercial Invoice',
        packing_list: 'Packing List',
        bill_of_lading: 'Bill of Lading',
        shipping_label: 'Shipping Label',
      }
      const { triggerDownload } = await import('@/lib/download-pdf')
      const expNum = exp.export_number.replace(/[#/\\:*?"<>|]/g, '').trim()
      const customerName = (exp.customer?.company_name ?? '').replace(/[#/\\:*?"<>|]/g, '').trim()
      const baseName = customerName ? `${expNum} - ${customerName}` : expNum
      triggerDownload(blob, `${baseName} - ${labels[type]}.pdf`)
    } catch (err) {
      toast.error('Failed to generate PDF')
      console.error(err)
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  async function handleDownloadAll() {
    setIsDownloadingPdf(true)
    try {
      const React = await import('react')
      const { pdf } = await import('@react-pdf/renderer')
      const JSZip = (await import('jszip')).default
      const company = await fetchCompany()

      const { CommercialInvoicePDF } = await import('@/components/pdf/exports/commercial-invoice-pdf')
      const { PackingListPDF } = await import('@/components/pdf/exports/packing-list-pdf')
      const { DonAndresBolPDF } = await import('@/components/pdf/exports/don-andres-bol-pdf')
      const { ShippingLabelPDF } = await import('@/components/pdf/exports/shipping-label-pdf')
      const QRCode = (await import('qrcode')).default
      const qrUrl = `${window.location.origin}/exports/${exp.id}`
      const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 200 })
      const [ciBlob, plBlob, bolBlob, slBlob] = await Promise.all([
        pdf(React.createElement(CommercialInvoicePDF, { exportRecord: exp, company }) as any).toBlob(),
        pdf(React.createElement(PackingListPDF, { exportRecord: exp, company }) as any).toBlob(),
        pdf(React.createElement(DonAndresBolPDF, { exportRecord: exp, company }) as any).toBlob(),
        pdf(React.createElement(ShippingLabelPDF, { exportRecord: exp, company, qrCodeDataUrl }) as any).toBlob(),
      ])

      const expNum = exp.export_number.replace(/[#/\\:*?"<>|]/g, '').trim()
      const customerName = (exp.customer?.company_name ?? '').replace(/[#/\\:*?"<>|]/g, '').trim()
      const baseName = customerName ? `${expNum} - ${customerName}` : expNum

      const zip = new JSZip()
      zip.file(`${baseName} - Commercial Invoice.pdf`, ciBlob)
      zip.file(`${baseName} - Packing List.pdf`, plBlob)
      zip.file(`${baseName} - Bill of Lading.pdf`, bolBlob)
      zip.file(`${baseName} - Shipping Label.pdf`, slBlob)

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const { triggerDownload } = await import('@/lib/download-pdf')
      triggerDownload(zipBlob, `${baseName} - Export Package.zip`)
    } catch (err) {
      toast.error('Failed to generate export package')
      console.error(err)
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  async function handleUploadReceived(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadDoc.mutateAsync({ exportId: id, file, documentType: 'received_doc' })
    if (receivedFileRef.current) receivedFileRef.current.value = ''
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link href="/exports">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold font-mono">{exp.export_number}</h1>
            <Badge className={`capitalize ${statusColors[exp.status]}`}>
              {statusLabels[exp.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {customer?.company_name ?? '—'} · {exp.destination || '—'}
          </p>
        </div>
      </div>

      {/* Status update */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Status</p>
              <Select
                value={exp.status}
                onValueChange={(v) => updateExport.mutate({ id, values: { status: v as ExportStatus } })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['draft', 'ready', 'submitted', 'cleared', 'delivered'] as ExportStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 border-red-200 hover:bg-red-50 shrink-0 self-end mb-0.5"
              onClick={handleDeleteExport}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Export Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Order</span>
            {order ? (
              <Link href={`/orders/${order.id}`} className="font-medium text-red-600 hover:underline font-mono">
                {order.order_number}
              </Link>
            ) : <span className="font-medium">—</span>}
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Carrier</span>
            <span className="font-medium">{(exp as any).carrier?.name ?? '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Route</span>
            <span className="font-medium">{(exp as any).carrier?.route ?? '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Destination</span>
            <span className="font-medium">{exp.destination || '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Export Date</span>
            <span className="font-medium">
              {exp.export_date
                ? new Date(exp.export_date + 'T12:00:00').toLocaleDateString('en', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })
                : '—'}
            </span>
          </div>
          {/* THT Date — inline editable */}
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground shrink-0">THT Date</span>
            {editingTht ? (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  autoFocus
                  value={thtDraft}
                  onChange={e => setThtDraft(e.target.value)}
                  className="h-7 w-40 text-sm text-right px-2"
                />
                <button
                  onClick={() => {
                    updateExport.mutate({ id, values: { tht_date: thtDraft || null } })
                    setEditingTht(false)
                  }}
                  className="text-green-600 hover:text-green-700"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setEditingTht(false)} className="text-muted-foreground hover:text-foreground">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setThtDraft((exp as any).tht_date ?? ''); setEditingTht(true) }}
                className="flex items-center gap-1.5 font-medium hover:opacity-70 transition-opacity group"
              >
                <span>
                  {(exp as any).tht_date
                    ? new Date((exp as any).tht_date + 'T12:00:00').toLocaleDateString('en', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })
                    : <span className="text-muted-foreground">Not set</span>}
                </span>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground shrink-0">Currency</span>
            <Select
              value={exp.currency ?? 'XCG'}
              onValueChange={(v) => updateExport.mutate({ id, values: { currency: v } as any })}
            >
              <SelectTrigger className="w-40 h-7 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="XCG">XCG</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="ANG">ANG</SelectItem>
                <SelectItem value="AWG">AWG</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Created</span>
            <span className="font-medium">{new Date(exp.created_at).toLocaleString()}</span>
          </div>
          {exp.notes && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Notes</span>
              <span className="font-medium text-right">{exp.notes}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cargo summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Cargo Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-0 divide-y text-sm">
            {activeItems.map((item, i) => {
              const ctns = Math.ceil(item.qty / BOTTLES_PER_CARTON)
              const tht = (item as any).tht_date
              const fmtTht = tht
                ? new Date(tht + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
                : null
              return (
                <div key={i} className="py-2.5">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground flex-1 min-w-0 truncate">{item.name}</span>
                    <span>{item.qty} btls</span>
                    <span className="text-muted-foreground">{ctns} ctns</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs text-muted-foreground">THT:</span>
                    {editingItemTht === i ? (
                      <>
                        <Input
                          type="date"
                          autoFocus
                          value={itemThtDraft}
                          onChange={e => setItemThtDraft(e.target.value)}
                          className="h-6 text-xs px-2 w-36"
                        />
                        <button onClick={() => saveItemTht(i, itemThtDraft)} className="text-green-600 hover:text-green-700">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingItemTht(null)} className="text-muted-foreground hover:text-foreground">
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setItemThtDraft(tht ?? ''); setEditingItemTht(i) }}
                        className="flex items-center gap-1 text-xs hover:opacity-70 transition-opacity group"
                      >
                        <span className={fmtTht ? 'font-medium' : 'text-muted-foreground'}>{fmtTht ?? 'Not set'}</span>
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <Separator className="my-3" />
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{totalQty}</p>
              <p className="text-xs text-muted-foreground">Bottles</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{totalCartons}</p>
              <p className="text-xs text-muted-foreground">Cartons</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{totalWeight}</p>
              <p className="text-xs text-muted-foreground">kg gross</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document package */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Package</CardTitle>
          <p className="text-xs text-muted-foreground">Generate and download the customs documents</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="gap-2 justify-start"
              onClick={() => downloadPdf('commercial_invoice')}
              disabled={isDownloadingPdf}
            >
              <Download className="h-4 w-4 shrink-0" />
              Commercial Invoice
            </Button>
            <Button
              variant="outline"
              className="gap-2 justify-start"
              onClick={() => downloadPdf('packing_list')}
              disabled={isDownloadingPdf}
            >
              <Download className="h-4 w-4 shrink-0" />
              Packing List
            </Button>
            <Button
              variant="outline"
              className="gap-2 justify-start"
              onClick={() => downloadPdf('bill_of_lading')}
              disabled={isDownloadingPdf}
            >
              <Download className="h-4 w-4 shrink-0" />
              Bill of Lading
            </Button>
            <Button
              variant="outline"
              className="gap-2 justify-start"
              onClick={() => downloadPdf('shipping_label')}
              disabled={isDownloadingPdf}
            >
              <Download className="h-4 w-4 shrink-0" />
              Shipping Label
            </Button>
          </div>
          <Button
            className="w-full bg-red-600 hover:bg-red-700 gap-2"
            onClick={handleDownloadAll}
            disabled={isDownloadingPdf}
          >
            <Download className="h-4 w-4" />
            {isDownloadingPdf ? 'Generating…' : 'Download All (ZIP)'}
          </Button>
        </CardContent>
      </Card>

      {/* Received documents */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Received Documents</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Upload signed or stamped documents from carrier/customs</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => receivedFileRef.current?.click()}
              disabled={uploadDoc.isPending}
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
            <input
              ref={receivedFileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={handleUploadReceived}
            />
          </div>
        </CardHeader>
        <CardContent>
          {!documents || documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <FileText className="h-8 w-8 opacity-20" />
              <p className="text-sm">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.filter(d => d.document_type === 'received_doc').map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-red-600 hover:underline truncate"
                  >
                    {doc.file_name}
                  </a>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(doc.uploaded_at).toLocaleDateString()}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 shrink-0"
                    onClick={() => deleteDoc.mutate({ id: doc.id, exportId: id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
