'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useCreateExport, useCarriers } from '@/hooks/use-exports'
import { useOrders } from '@/hooks/use-orders'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

function NewExportInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createExport = useCreateExport()
  const { data: carriers } = useCarriers()
  const { data: orders } = useOrders()
  const { profile, isAdmin } = useAuth()

  const [orderId, setOrderId] = useState(searchParams.get('order') ?? '')
  const [carrierId, setCarrierId] = useState('')
  const [destination, setDestination] = useState('')
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pre-fill destination when carrier changes
  useEffect(() => {
    const carrier = carriers?.find(c => c.id === carrierId)
    if (carrier?.route) {
      const dest = carrier.route.split('→').pop()?.trim() ?? ''
      setDestination(dest)
    }
  }, [carrierId, carriers])

  const eligibleOrders = (orders ?? []).filter(
    o => o.status === 'invoice_ready' || o.status === 'paid'
  )

  const selectedOrder = eligibleOrders.find(o => o.id === orderId)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orderId) return
    setIsSubmitting(true)
    try {
      const exp = await createExport.mutateAsync({
        order_id: orderId,
        carrier_id: carrierId || null,
        destination,
        export_date: exportDate || null,
        notes,
        status: 'draft',
        created_by: profile?.id ?? '',
      } as any)
      router.push(`/exports/${exp.id}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center py-20">
        <p className="font-medium">Access restricted</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">New Export</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Export Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-1.5">
              <Label>Order *</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an order">
                    {selectedOrder
                      ? `${selectedOrder.order_number} — ${selectedOrder.customer?.company_name ?? ''}`
                      : 'Select an order'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {eligibleOrders.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_number} — {o.customer?.company_name ?? ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only Invoice Ready and Paid orders are shown
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Carrier</Label>
              <Select value={carrierId} onValueChange={setCarrierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carriers?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.route ? ` — ${c.route}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Input
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="e.g. Bonaire"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Export Date</Label>
                <Input
                  type="date"
                  value={exportDate}
                  onChange={e => setExportDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">(internal)</span></Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any notes about this export..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          className="w-full bg-red-600 hover:bg-red-700 h-12"
          disabled={isSubmitting || !orderId}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Export
        </Button>
      </form>
    </div>
  )
}

export default function NewExportPage() {
  return (
    <Suspense>
      <NewExportInner />
    </Suspense>
  )
}
