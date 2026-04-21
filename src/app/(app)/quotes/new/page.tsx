'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuoteTemplates, useCreateQuote } from '@/hooks/use-quotes'
import { useCustomers } from '@/hooks/use-customers'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { QuoteItem, TemplateItem } from '@/types'

const TAX_RATE = 0.21 // 21% VAT

function NewQuotePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createQuote = useCreateQuote()
  const { data: templates } = useQuoteTemplates()
  const { data: customers } = useCustomers()
  const { profile, isAdmin } = useAuth()

  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '')
  const [leadId] = useState(searchParams.get('lead') ?? '')
  const [templateId, setTemplateId] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [validUntil, setValidUntil] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function loadTemplate(id: string) {
    const tmpl = templates?.find((t) => t.id === id)
    if (!tmpl) return
    setTemplateId(id)
    setItems(
      (tmpl.items as TemplateItem[]).map((i) => ({
        sku: i.sku,
        name: i.name,
        qty: 1,
        unit_price: i.unit_price,
        line_total: i.unit_price,
      }))
    )
  }

  function updateQty(index: number, qty: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, qty, line_total: qty * item.unit_price }
          : item
      )
    )
  }

  function updatePrice(index: number, price: number) {
    if (!isAdmin) return // Sales cannot override price
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, unit_price: price, line_total: item.qty * price }
          : item
      )
    )
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0)
  const tax = subtotal * TAX_RATE
  const total = subtotal + tax

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) return toast.error('Select a customer')
    if (items.length === 0) return toast.error('Add at least one item')

    setIsSubmitting(true)
    try {
      const tmpl = templates?.find((t) => t.id === templateId)
      const quote = await createQuote.mutateAsync({
        customer_id: customerId,
        lead_id: leadId || null,
        items,
        subtotal,
        tax,
        total,
        status: 'draft',
        template_used: tmpl?.name ?? '',
        valid_until: validUntil || undefined,
        created_by: profile?.id!,
        quote_number: '',
      })
      router.push(`/quotes/${quote.id}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">New Quote</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Customer & Template */}
        <Card>
          <CardHeader><CardTitle className="text-base">Quote Setup</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Template *</Label>
              <Select value={templateId} onValueChange={(v) => v && loadTemplate(v)}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isAdmin ? 'Admin: you can override prices' : 'Prices are fixed by the template'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Valid Until</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        {items.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, i) => (
                <div key={i}>
                  {i > 0 && <Separator className="mb-3" />}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.sku}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeItem(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => updateQty(i, Number(e.target.value))}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Unit Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updatePrice(i, Number(e.target.value))}
                          className="h-8"
                          readOnly={!isAdmin}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total</Label>
                        <p className="h-8 flex items-center font-semibold text-sm">
                          €{item.line_total.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>€{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT (21%)</span>
                  <span>€{tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          type="submit"
          className="w-full bg-red-600 hover:bg-red-700 h-12"
          disabled={isSubmitting || items.length === 0}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Quote
        </Button>
      </form>
    </div>
  )
}

export default function NewQuotePage() {
  return (
    <Suspense>
      <NewQuotePageInner />
    </Suspense>
  )
}
