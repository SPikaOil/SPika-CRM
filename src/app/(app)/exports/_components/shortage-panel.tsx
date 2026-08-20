'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useUpdateTransport } from '@/hooks/use-transports'
import { Transport, QuoteItem } from '@/types'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

type Outcome = 'credit' | 'later' | 'our_loss'

const OUTCOMES: { value: Outcome; label: string; hint: string }[] = [
  { value: 'credit',   label: 'Credit the customer', hint: 'They pay for what arrived. A credit note is made for the rest.' },
  { value: 'later',    label: 'Deliver later',        hint: 'The order stays as it is and the missing bottles follow on a later run.' },
  { value: 'our_loss', label: 'Our loss / claim it',  hint: 'The customer gets the full order anyway. We carry it, or claim it from the carrier.' },
]

interface Line {
  order_id: string
  order_number: string
  /**
   * Which box this count came from (2026-08-19). Intake is per colli, so the
   * same product can come up short in two boxes on one transport and each is
   * its own decision — one may be credited and the other sent again.
   */
  colli?: number
  sku: string
  name: string
  expected: number
  received: number
  reason: string
  outcome?: Outcome
}

/** What identifies one shortage: a product, in a box, on an order. */
function keyOf(l: Line) {
  return `${l.order_id}-${l.colli ?? 0}-${l.sku}`
}

/**
 * What a shortage at intake means for the CUSTOMER.
 *
 * Counting short is only half the story. 200 left Curaçao, 198 arrived, and the
 * order still says 200 — so somebody has to decide what the customer is owed.
 * Leaving that open is how an invoice goes out for bottles that were never
 * delivered.
 *
 * Three honest answers, and which one applies is a judgement per line, not a
 * rule the app can work out:
 *
 *   credit    they pay for what arrived — a credit note for the difference
 *   later     the order is untouched, the rest follows on a later run
 *   our_loss  they get the whole order anyway; we carry it or claim the carrier
 *
 * The choice is stored on the intake line itself, next to the count and the
 * reason, so the whole story of those two bottles stays in one place.
 */
export function ShortagePanel({ transport }: { transport: Transport }) {
  const update = useUpdateTransport()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)

  const lines = ((transport.receipt_lines ?? []) as Line[])
  const short = lines.filter(l => l.received < l.expected)

  if (!transport.arrived_at || short.length === 0) return null

  const open = short.filter(l => !l.outcome)

  async function settle(line: Line, outcome: Outcome) {
    const key = keyOf(line)
    setBusy(key)
    try {
      const supabase = createClient()
      const missing = line.expected - line.received

      if (outcome === 'credit') {
        // A box of loose stock belongs to no order, so there is nobody to
        // credit. It is our own stock that went missing, which is what "our
        // loss" is for.
        if (!line.order_id) {
          throw new Error('This box was not packed for an order — there is nobody to credit')
        }
        // The same shape migration 052 uses: negative quantities and a negative
        // total, so every sum that already exists corrects itself untouched.
        const { data: order } = await supabase
          .from('orders')
          .select('id, order_number, customer_id, items, assigned_to')
          .eq('id', line.order_id)
          .single()
        if (!order) throw new Error('Order not found')

        const item = ((order.items ?? []) as QuoteItem[]).find(i => i.sku === line.sku)
        if (!item) throw new Error(`${line.name} is not on order ${line.order_number}`)

        const { getCreditNoteNumber } = await import('@/lib/order-number')
        const number = await getCreditNoteNumber(order.order_number)

        const { error } = await supabase.from('orders').insert({
          order_number: number,
          customer_id: order.customer_id,
          order_type: 'credit_note',
          credit_note_of: order.id,
          items: [{
            sku: line.sku,
            name: line.name,
            qty: -missing,
            unit_price: item.unit_price,
            discount: item.discount ?? 0,
            line_total: -(missing * item.unit_price),
            tht_date: item.tht_date,
          }],
          total: -(missing * item.unit_price),
          status: 'paid',
          invoice_date: new Date().toISOString().slice(0, 10),
          assigned_to: order.assigned_to,
          delivery_notes:
            `${missing}x ${line.name} short on arrival of ${transport.transport_number} — ${line.reason}`,
        })
        if (error) throw error
      }

      // 'later' and 'our_loss' change no money and no stock: the bottles never
      // arrived, so they were never booked in. What they change is the record of
      // what we decided, and that is the point of writing it down.
      const next = lines.map(l =>
        keyOf(l) === keyOf(line) ? { ...l, outcome } : l
      )
      await update.mutateAsync({ id: transport.id, values: { receipt_lines: next } as never })
      queryClient.invalidateQueries({ queryKey: ['orders'] })

      toast.success(
        outcome === 'credit' ? `Credit note made for ${missing}x ${line.name}`
          : outcome === 'later' ? 'Marked to deliver later'
          : 'Written off on our side'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not settle this shortage')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card size="sm" className="border-orange-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          Shortages
          {open.length > 0 && (
            <span className="ml-auto text-xs font-normal text-orange-700">
              {open.length} still to decide
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Less arrived than was sent. The order still says the full amount, so decide
          per line what the customer is owed.
        </p>

        {short.map(l => {
          const key = keyOf(l)
          const missing = l.expected - l.received
          const settled = OUTCOMES.find(o => o.value === l.outcome)
          return (
            <div key={key} className="rounded-lg border p-2.5 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{l.name}</span>
                <span className="text-xs text-red-600 shrink-0">{missing} short</span>
                {l.colli ? (
                  <span className="text-xs text-muted-foreground shrink-0">Colli {l.colli}</span>
                ) : null}
                <span className="text-xs text-muted-foreground shrink-0">{l.order_number}</span>
              </div>

              {settled ? (
                <p className="text-xs text-green-700 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  {settled.label}
                </p>
              ) : (
                <div className="space-y-1">
                  <Select
                    value={undefined}
                    onValueChange={v => v && settle(l, v as Outcome)}
                    disabled={busy === key}
                  >
                    <SelectTrigger className="h-7 text-xs px-2">
                      <SelectValue placeholder={busy === key ? 'Working…' : 'What does the customer get?'} />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTCOMES.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {busy === key && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" /> Settling…
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* The three answers spelled out, so nobody has to guess what they do. */}
        <div className="rounded-lg bg-muted/50 p-2 space-y-0.5">
          {OUTCOMES.map(o => (
            <p key={o.value} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{o.label}</span> — {o.hint}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
