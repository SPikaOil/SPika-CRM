'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Download, Send, CheckCircle, XCircle, FileText, Loader2,
  ShoppingCart, Clock, AlertTriangle,
} from 'lucide-react'
import { useQuote, useUpdateQuote } from '@/hooks/use-quotes'
import { useCreateOrder } from '@/hooks/use-orders'
import { useUsers } from '@/hooks/use-users'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { downloadQuotationPDF } from '@/lib/download-pdf'
import { getNextOrderNumber } from '@/lib/order-number'
import type { QuoteStatus } from '@/types'

const statusColors: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-700',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired:  'bg-orange-100 text-orange-700',
}

const B2C_TAX_RATE = 0.06

export default function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: quote, isLoading } = useQuote(id)
  const updateQuote = useUpdateQuote()
  const createOrder = useCreateOrder()
  const { data: users } = useUsers()
  const { profile, isAdmin } = useAuth()
  const router = useRouter()

  const [isSending, setIsSending] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [assignedTo, setAssignedTo] = useState('')
  const [plannedDate, setPlannedDate] = useState('')

  // All hooks before any early returns
  const customer = (quote as any)?.customer
  const isExpired = (quote?.status === 'draft' || quote?.status === 'sent') &&
    quote?.valid_until && new Date(quote.valid_until) < new Date()
  const displayStatus: QuoteStatus | 'expired' = isExpired ? 'expired' : (quote?.status ?? 'draft')

  const activeItems = (quote?.items ?? []).filter((i) => i.qty > 0)
  const subtotal = activeItems.reduce((sum, i) => sum + i.line_total, 0)
  const isB2C = customer?.customer_category === 'b2c'
  const taxRate = isB2C ? B2C_TAX_RATE : 0
  const tax = subtotal * taxRate
  const total = subtotal + tax

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20 gap-3">
        <FileText className="h-12 w-12 opacity-20" />
        <p className="font-medium">Quotation not found</p>
        <Link href="/quotations">
          <Button variant="outline">Back to Quotations</Button>
        </Link>
      </div>
    )
  }

  async function handleDownloadPDF() {
    if (!quote) return
    setIsDownloading(true)
    try {
      await downloadQuotationPDF(quote)
    } catch (err: any) {
      toast.error('Could not generate PDF: ' + err.message)
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleSendToCustomer() {
    if (!quote || !customer) return
    setIsSending(true)
    try {
      // Update status to sent
      await updateQuote.mutateAsync({ id, values: { status: 'sent' } })

      // Send email notification
      const itemsSummary = activeItems.map((i) => `${i.qty}× ${i.name}`).join(', ')
      const validUntilStr = quote.valid_until
        ? new Date(quote.valid_until).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
        : '—'

      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'quote_sent',
          payload: {
            quoteNumber: quote.quote_number,
            customerEmail: customer.email,
            customerName: customer.company_name,
            validUntil: validUntilStr,
            total: total.toFixed(2),
            items: itemsSummary,
            billingEmails: customer.billing_emails ?? [],
          },
        }),
      }).catch(() => {})

      toast.success('Quotation sent to customer!')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSending(false)
    }
  }

  async function handleStatusChange(status: QuoteStatus) {
    try {
      await updateQuote.mutateAsync({ id, values: { status } })
      toast.success(`Marked as ${status}`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleConvertToOrder() {
    if (!quote || !assignedTo) return
    setIsConverting(true)
    try {
      const orderNumber = await getNextOrderNumber()
      const order = await createOrder.mutateAsync({
        customer_id: quote.customer_id,
        quote_id: quote.id,
        order_number: orderNumber,
        items: activeItems,
        total,
        status: 'processing',
        assigned_to: assignedTo,
        planned_date: plannedDate || null,
        delivery_notes: '',
      } as any)
      // Mark quote as accepted
      await updateQuote.mutateAsync({ id, values: { status: 'accepted' } })
      toast.success('Delivery note created!')
      router.push(`/orders/${order.id}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsConverting(false)
    }
  }

  const validUntilDisplay = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="mt-0.5">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{quote.quote_number || 'Quotation'}</h1>
            <Badge className={`capitalize text-xs ${statusColors[displayStatus]}`}>
              {displayStatus}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">{customer?.company_name ?? '—'}</p>
        </div>
      </div>

      {/* Expired warning */}
      {isExpired && (
        <div className="flex items-start gap-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-300 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-orange-700 dark:text-orange-400">Quotation expired</p>
            <p className="text-sm text-orange-600/80 mt-0.5">
              This quotation expired on {validUntilDisplay}. You can still convert it to a delivery note if agreed with the customer.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownloadPDF}
              disabled={isDownloading}
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>

            {(quote.status === 'draft') && (
              <Button
                size="sm"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                onClick={handleSendToCustomer}
                disabled={isSending || !customer?.email}
                title={!customer?.email ? 'Customer has no email address' : undefined}
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to Customer
              </Button>
            )}

            {quote.status === 'sent' && (
              <>
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700"
                  onClick={() => handleStatusChange('accepted')}
                  disabled={updateQuote.isPending}
                >
                  <CheckCircle className="h-4 w-4" />
                  Mark Accepted
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => handleStatusChange('declined')}
                  disabled={updateQuote.isPending}
                >
                  <XCircle className="h-4 w-4" />
                  Mark Declined
                </Button>
              </>
            )}

            {(quote.status === 'accepted' || quote.status === 'sent' || isExpired) && (
              <Button
                size="sm"
                className="gap-1.5 bg-red-600 hover:bg-red-700"
                onClick={() => setShowConvertDialog(true)}
              >
                <ShoppingCart className="h-4 w-4" />
                Convert to Delivery Note
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Convert to order dialog */}
      {showConvertDialog && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-red-600" />
              Convert to Delivery Note
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will create a new delivery note with the same items and assign it to a worker.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Assign to Worker *</Label>
                <Select value={assignedTo} onValueChange={(v) => v && setAssignedTo(v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select worker">
                      {assignedTo
                        ? (() => { const u = users?.find(u => u.id === assignedTo); return u ? u.name : 'Select worker' })()
                        : 'Select worker'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} {u.role === 'admin' ? '(Admin)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Planned Delivery Date</Label>
                <Input
                  type="date"
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  className="h-9"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700"
                onClick={handleConvertToOrder}
                disabled={isConverting || !assignedTo}
              >
                {isConverting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Create Delivery Note
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowConvertDialog(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quote details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quote Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Customer</p>
            <p className="font-medium">{customer?.company_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Quote Date</p>
            <p className="font-medium">
              {quote.created_at
                ? new Date(quote.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Valid Until</p>
            <p className={`font-medium ${isExpired ? 'text-orange-600' : ''}`}>{validUntilDisplay}</p>
          </div>
          {customer?.email && (
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium truncate">{customer.email}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">VAT</p>
            <p className="font-medium">{isB2C ? '6% (B2C)' : '0% (B2B exempt)'}</p>
          </div>
          {quote.template_used && (
            <div className="sm:col-span-3">
              <p className="text-muted-foreground">Internal Notes</p>
              <p className="font-medium whitespace-pre-wrap">{quote.template_used}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_60px_100px_100px_100px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
            <span>Product</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right">Discount</span>
            <span className="text-right">Amount</span>
          </div>

          {activeItems.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Clock className="h-5 w-5" />
              <span className="text-sm">No items in this quotation</span>
            </div>
          ) : (
            activeItems.map((item, i) => (
              <div
                key={item.sku}
                className={`grid grid-cols-1 sm:grid-cols-[1fr_60px_100px_100px_100px] gap-1 sm:gap-2 px-4 py-3 text-sm border-b last:border-0 ${i % 2 === 1 ? 'bg-muted/20' : ''}`}
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.sku}</p>
                </div>
                <p className="text-center sm:text-center font-medium">
                  <span className="sm:hidden text-muted-foreground">Qty: </span>{item.qty}
                </p>
                <p className="text-right">
                  <span className="sm:hidden text-muted-foreground">Price: </span>
                  XCG {item.unit_price.toFixed(2)}
                </p>
                <p className="text-right text-muted-foreground">
                  <span className="sm:hidden">Discount: </span>
                  {item.discount > 0 ? `XCG ${item.discount.toFixed(2)}` : '—'}
                </p>
                <p className="text-right font-semibold">
                  <span className="sm:hidden text-muted-foreground">Total: </span>
                  XCG {item.line_total.toFixed(2)}
                </p>
              </div>
            ))
          )}

          {/* Totals */}
          <div className="px-4 pt-3 pb-4 space-y-1 border-t text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>XCG {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{isB2C ? 'VAT (6%)' : 'VAT (0% — B2B exempt)'}</span>
              <span>XCG {tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-1 border-t">
              <span>Total</span>
              <span>XCG {total.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
