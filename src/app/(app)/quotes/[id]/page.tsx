'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Send, Check, X, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { useQuote, useUpdateQuote } from '@/hooks/use-quotes'
import { useCreateOrder } from '@/hooks/use-orders'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { QuoteItem, QuoteStatus } from '@/types'

const statusColors: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700',
}

export default function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: quote, isLoading } = useQuote(id)
  const updateQuote = useUpdateQuote()
  const createOrder = useCreateOrder()
  const { profile } = useAuth()
  const router = useRouter()
  const [converting, setConverting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleStatusChange(status: QuoteStatus) {
    await updateQuote.mutateAsync({ id, values: { status } })
  }

  async function handleConvertToOrder() {
    if (!quote) return
    setConverting(true)
    try {
      const order = await createOrder.mutateAsync({
        quote_id: quote.id,
        customer_id: quote.customer_id,
        items: quote.items,
        total: quote.total,
        assigned_to: profile?.id!,
        status: 'processing',
        order_number: '',
        delivery_notes: '',
      })
      await updateQuote.mutateAsync({ id, values: { status: 'accepted' } })
      toast.success('Order created!')
      router.push(`/orders/${order.id}`)
    } finally {
      setConverting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center py-20 gap-3">
        <FileText className="h-12 w-12 opacity-20" />
        <p className="font-medium">Delivery note not found</p>
        <Link href="/quotes"><Button variant="outline">Back to Delivery Notes</Button></Link>
      </div>
    )
  }

  const items = quote.items as QuoteItem[]

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold font-mono">{quote.quote_number}</h1>
            <Badge className={`text-xs capitalize ${statusColors[quote.status]}`}>
              {quote.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{quote.customer?.company_name}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {quote.status === 'draft' && (
          <Button
            size="sm"
            className="gap-1.5 bg-blue-600 hover:bg-blue-700"
            onClick={() => handleStatusChange('sent')}
            disabled={updateQuote.isPending}
          >
            <Send className="h-4 w-4" />
            Mark as Sent
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
              <Check className="h-4 w-4" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-red-600 border-red-200"
              onClick={() => handleStatusChange('declined')}
              disabled={updateQuote.isPending}
            >
              <X className="h-4 w-4" />
              Decline
            </Button>
          </>
        )}
        {(quote.status === 'accepted' || quote.status === 'sent') && (
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors">
              <ShoppingCart className="h-4 w-4" />
              Convert to Order
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Convert to Order?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will create a new order from this quote and mark the quote as accepted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmOpen(false)}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    setConfirmOpen(false)
                    await handleConvertToOrder()
                  }}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={converting}
                >
                  {converting ? 'Creating...' : 'Convert'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Delivery Note Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Customer" value={quote.customer?.company_name ?? '—'} />
          <Row label="Template" value={quote.template_used || '—'} />
          <Row label="Created" value={new Date(quote.created_at).toLocaleDateString()} />
          {quote.valid_until && (
            <Row label="Valid Until" value={new Date(quote.valid_until).toLocaleDateString()} />
          )}
          <Row label="Created By" value={quote.creator?.name ?? '—'} />
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((item, i) => (
            <div key={i}>
              {i > 0 && <Separator className="my-2" />}
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.sku} · XCG {Number(item.unit_price).toFixed(2)} × {item.qty}
                  </p>
                </div>
                <p className="font-semibold text-sm shrink-0">
                  XCG {Number(item.line_total).toFixed(2)}
                </p>
              </div>
            </div>
          ))}
          <Separator />
          <div className="space-y-1 text-sm pt-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>XCG {Number(quote.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT (21%)</span>
              <span>XCG {Number(quote.tax).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-1">
              <span>Total</span>
              <span>XCG {Number(quote.total).toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
