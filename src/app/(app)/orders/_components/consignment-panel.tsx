'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { Order, QuoteItem } from '@/types'
import { formatCurrency } from '@/lib/utils'

/**
 * A consignment note is not a receivable. Article 9.1 of the agreement: the
 * amount on it states the value of the stock and is not payable on delivery.
 * What IS payable are the period invoices for the quantities reported sold
 * (art. 9.2), and at the end the remainder is settled (art. 4.3, 4.4, 12.5,
 * 12.7).
 *
 * Revenue was already booked in full on the consignment note itself, so the
 * period invoices deliberately do not count as revenue anywhere — they are
 * payment documents. The closing credit note is what brings revenue back down
 * to what was really sold.
 */

/** What happens to a bottle that is still with the customer when the term ends. */
type Outcome = 'returned' | 'taken_over' | 'lost' | 'our_defect'

const OUTCOMES: { value: Outcome; label: string; hint: string }[] = [
  { value: 'returned',   label: 'Returned to us',      hint: 'Art. 12.5 — credited back, returns to stock' },
  { value: 'taken_over', label: 'Taken over by them',  hint: 'Art. 12.7 — stays invoiced at consignment price' },
  { value: 'lost',       label: 'Lost or broken',      hint: 'Art. 4.4 — counts as sold, stays invoiced' },
  { value: 'our_defect', label: 'Our product defect',  hint: 'Art. 4.3 — credited, written off as our loss' },
]

export function ConsignmentPanel({ order }: { order: Order }) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'none' | 'invoice' | 'close'>('none')
  const [qty, setQty] = useState<Record<string, number>>({})
  const [outcome, setOutcome] = useState<Record<string, Outcome>>({})

  // Every line on the note, free table samples included. They carry no price,
  // but they are stock that sits at the customer and has to be accounted for
  // like anything else — the number of them is not something to remember by
  // heart.
  const contractItems = ((order.items ?? []) as QuoteItem[]).filter(i => i.qty > 0)
  const currency = (order as any).currency ?? 'XCG'

  // Every period invoice raised against this note so far.
  const { data: settled } = useQuery({
    queryKey: ['consignment-invoices', order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total, items, invoice_date, status, created_at')
        .eq('consignment_of', order.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Order[]
    },
  })

  // How many of each product have already been invoiced. That, not a stock
  // count, is what limits the next period invoice.
  const invoiced = new Map<string, number>()
  for (const inv of settled ?? []) {
    for (const it of (inv.items ?? []) as QuoteItem[]) {
      invoiced.set(it.sku, (invoiced.get(it.sku) ?? 0) + it.qty)
    }
  }

  // What has physically gone out, per product. A delivery with no lines is a
  // whole-order run — every delivery from before migration 058 behaves that way.
  const delivered = new Map<string, number>()
  for (const d of order.deliveries ?? []) {
    const lines = (d.items ?? []) as QuoteItem[]
    const source = lines.length > 0 ? lines : contractItems
    for (const it of source) {
      delivered.set(it.sku, (delivered.get(it.sku) ?? 0) + it.qty)
    }
  }

  const rows = contractItems.map(i => ({
    ...i,
    delivered: delivered.get(i.sku) ?? 0,
    invoiced: invoiced.get(i.sku) ?? 0,
    open: i.qty - (invoiced.get(i.sku) ?? 0),
  }))

  const totalAgreed = rows.reduce((s, r) => s + r.qty, 0)
  const totalDelivered = rows.reduce((s, r) => s + r.delivered, 0)
  const totalInvoiced = rows.reduce((s, r) => s + r.invoiced, 0)
  const totalOpen = totalAgreed - totalInvoiced
  const closed = !!(order as any).consignment_closed_at

  /**
   * What the term means today. Counted in whole days from midnight so a
   * contract ending tomorrow never reads "0 days left" because of the hour.
   */
  const termNotice = (() => {
    const end = (order as any).consignment_end as string | null
    if (!end || closed) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const last = new Date(`${end}T00:00:00`)
    const days = Math.round((last.getTime() - today.getTime()) / 864e5)
    const pretty = last.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

    if (days < 0) {
      const over = Math.abs(days)
      return {
        tone: 'text-red-600 font-medium',
        text: `Term ended ${pretty} — ${over} ${over === 1 ? 'day' : 'days'} ago. `
          + 'The closing report was due within 7 days and the remaining stock is collected within 14.',
      }
    }
    if (days === 0) return { tone: 'text-red-600 font-medium', text: `Last day of the term — ends ${pretty}.` }
    if (days <= 14) return { tone: 'text-amber-600', text: `${days} days left — term ends ${pretty}.` }
    return { tone: 'text-muted-foreground', text: `${days} days left — term ends ${pretty}.` }
  })()

  /** Write one field on the consignment note itself. */
  async function save(values: Record<string, unknown>) {
    const { error } = await supabase.from('orders').update(values).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    queryClient.invalidateQueries({ queryKey: ['orders', order.id] })
  }

  function reset() {
    setMode('none')
    setQty({})
    setOutcome({})
  }

  async function createPeriodInvoice() {
    const lines = rows
      .filter(r => (qty[r.sku] ?? 0) > 0)
      .map(r => ({
        sku: r.sku,
        name: r.name,
        qty: qty[r.sku],
        unit_price: r.unit_price,
        discount: r.discount ?? 0,
        line_total: qty[r.sku] * r.unit_price,
        tht_date: r.tht_date,
      }))
    if (lines.length === 0) return

    setBusy(true)
    try {
      const { getNextOrderNumber } = await import('@/lib/order-number')
      const number = await getNextOrderNumber()
      const total = lines.reduce((s, l) => s + l.line_total, 0)

      const { error } = await supabase.from('orders').insert({
        order_number: number,
        customer_id: order.customer_id,
        order_type: 'consignment_invoice',
        consignment_of: order.id,
        // Not consignment itself: this one IS payable, so it belongs in the
        // chase with the customer's normal payment term.
        is_consignment: false,
        items: lines,
        total,
        status: 'invoice_ready',
        invoice_date: new Date().toISOString().slice(0, 10),
        assigned_to: order.assigned_to,
        delivery_notes: `Consignment period invoice for ${order.order_number}`,
      })
      if (error) throw error

      toast.success(`Invoice ${number} created for ${lines.reduce((s, l) => s + l.qty, 0)} units`)
      queryClient.invalidateQueries({ queryKey: ['consignment-invoices', order.id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the invoice')
    } finally {
      setBusy(false)
    }
  }

  async function closeContract() {
    // Only what comes back to us is credited. Taken over and lost stay
    // invoiced; our own defect is credited too but is a write-off, not stock.
    const credited = rows.filter(r => r.open > 0 && (outcome[r.sku] === 'returned' || outcome[r.sku] === 'our_defect'))

    setBusy(true)
    try {
      if (credited.length > 0) {
        const { getCreditNoteNumber } = await import('@/lib/order-number')
        const number = await getCreditNoteNumber(order.order_number)
        // Negative quantities and a negative total, exactly as migration 052
        // does it: every existing sum then corrects itself untouched.
        const items = credited.map(r => ({
          sku: r.sku,
          name: r.name,
          qty: -r.open,
          unit_price: r.unit_price,
          discount: r.discount ?? 0,
          line_total: -(r.open * r.unit_price),
          tht_date: r.tht_date,
        }))
        const total = items.reduce((s, l) => s + l.line_total, 0)

        const { error } = await supabase.from('orders').insert({
          order_number: number,
          customer_id: order.customer_id,
          order_type: 'credit_note',
          credit_note_of: order.id,
          items,
          total,
          status: 'paid',
          invoice_date: new Date().toISOString().slice(0, 10),
          assigned_to: order.assigned_to,
          delivery_notes: credited
            .map(r => `${r.open}x ${r.name} — ${OUTCOMES.find(o => o.value === outcome[r.sku])?.label}`)
            .join('; '),
        })
        if (error) throw error
      }

      // Art. 12.5: what comes back, comes back onto the batch it was picked
      // from. Only 'returned' — a defect of ours (Art. 4.3) is credited but
      // written off, so those bottles never become sellable stock again, and
      // 'taken over' and 'lost' never physically came back at all.
      const returned = rows.filter(r => r.open > 0 && outcome[r.sku] === 'returned')
      if (returned.length > 0) {
        const picks = await supabase
          .from('stock_movements')
          .select('sku, batch_id')
          .eq('order_id', order.id)
          .eq('reason', 'order')
        const batchOf = new Map((picks.data ?? []).map(p => [p.sku, p.batch_id]))
        const bookable = returned.filter(r => batchOf.has(r.sku))
        if (bookable.length > 0) {
          const { error: moveErr } = await supabase.from('stock_movements').insert(
            bookable.map(r => ({
              batch_id: batchOf.get(r.sku),
              sku: r.sku,
              qty: r.open,
              // Back where it went OUT from, not to Curaçao by default. Bottles
              // returned from a shop in Rotterdam are standing in Rotterdam;
              // booking them home would grow the island count by goods that are
              // three thousand miles away. Null is still Curaçao, which is what
              // a Curaçao order says (migration 114).
              location_id: (order as { warehouse_id?: string | null }).warehouse_id ?? null,
              reason: 'return',
              order_id: order.id,
              note: `Returned from consignment ${order.order_number}`,
            }))
          )
          if (moveErr) throw moveErr
        }
        // A line with no batch behind it cannot be put back anywhere. Say so
        // rather than swallow it — the count would silently be short.
        if (bookable.length < returned.length) {
          toast.warning(
            `${returned.length - bookable.length} returned line(s) had no batch chosen, so they were not put back into stock`
          )
        }
      }

      const { error: closeError } = await supabase
        .from('orders')
        .update({ consignment_closed_at: new Date().toISOString() })
        .eq('id', order.id)
      if (closeError) throw closeError

      toast.success(credited.length > 0 ? 'Contract closed and credited' : 'Contract closed')
      queryClient.invalidateQueries({ queryKey: ['orders', order.id] })
      queryClient.invalidateQueries({ queryKey: ['consignment-invoices', order.id] })
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not close the contract')
    } finally {
      setBusy(false)
    }
  }

  const everyOpenDecided = rows.filter(r => r.open > 0).every(r => !!outcome[r.sku])

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          📦 Consignment contract
          {closed && <Badge className="text-xs bg-slate-200 text-slate-700">Closed</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* The term. Art. 12.4 gives the customer 7 days after it ends to report
            the last sales, and art. 12.5 gives us 14 days to collect what is
            left — deadlines nobody can watch for if the app does not know when
            the contract ends. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Term starts</Label>
            <Input type="date" className="h-8"
              defaultValue={(order as any).consignment_start ?? ''}
              onBlur={e => save({ consignment_start: e.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Term ends</Label>
            <Input type="date" className="h-8"
              defaultValue={(order as any).consignment_end ?? ''}
              onBlur={e => save({ consignment_end: e.target.value || null })} />
          </div>
        </div>
        {termNotice && (
          <p className={`text-xs ${termNotice.tone}`}>{termNotice.text}</p>
        )}

        {/* Progress per product — agreed, invoiced, still open */}
        <div className="space-y-1">
          {rows.map(r => (
            <div key={r.sku} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex-1 min-w-0 truncate">{r.name}</span>
              <span className="text-xs shrink-0 w-24 text-right">
                <span className={r.delivered < r.qty ? 'text-amber-600' : ''}>{r.delivered}</span>
                <span className="text-muted-foreground">/{r.qty} delivered</span>
              </span>
              <span className="text-xs shrink-0 w-24 text-right text-muted-foreground">
                {r.invoiced}/{r.qty} invoiced
              </span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-semibold border-t pt-1.5">
            <span>Total</span>
            <span>
              {totalDelivered} of {totalAgreed} delivered · {totalInvoiced} invoiced
            </span>
          </div>
        </div>

        {/* The period invoices raised so far */}
        {(settled ?? []).length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Period invoices</p>
            {(settled ?? []).map(inv => (
              <Link key={inv.id} href={`/orders/${inv.id}`}
                className="flex items-center justify-between gap-2 px-3 py-0.5 leading-tight rounded-xl border bg-card hover:bg-accent transition-colors">
                <span className="font-mono text-sm">{inv.order_number}</span>
                <span className="text-xs text-muted-foreground">
                  {((inv.items ?? []) as QuoteItem[]).reduce((s, i) => s + i.qty, 0)} units
                </span>
                <span className="text-sm font-semibold">{formatCurrency(Number(inv.total), currency)}</span>
              </Link>
            ))}
          </div>
        )}

        {!closed && mode === 'none' && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={totalOpen === 0}
              onClick={() => setMode('invoice')}>
              <Plus className="h-3.5 w-3.5" />
              Period invoice
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode('close')}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Close contract
            </Button>
          </div>
        )}

        {/* Period invoice — what was reported sold this period */}
        {mode === 'invoice' && (
          <div className="rounded-lg border p-3 space-y-2.5">
            <p className="text-sm font-medium">Quantities reported sold this period</p>
            {rows.map(r => (
              <div key={r.sku} className="flex items-center justify-between gap-2">
                <span className="text-sm flex-1 min-w-0 truncate">{r.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">max {r.open}</span>
                <Input type="number" min="0" max={r.open} className="h-7 w-20 text-sm text-right px-2"
                  value={qty[r.sku] ?? ''}
                  onChange={e => {
                    const v = Math.min(Number(e.target.value) || 0, r.open)
                    setQty(q => ({ ...q, [r.sku]: v }))
                  }} />
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold border-t pt-1.5">
              <span>Invoice total</span>
              <span>{formatCurrency(rows.reduce((s, r) => s + (qty[r.sku] ?? 0) * r.unit_price, 0), currency)}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={busy}
                onClick={createPeriodInvoice}>
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Create invoice
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Closing — what happens to everything still out there */}
        {mode === 'close' && (
          <div className="rounded-lg border p-3 space-y-2.5">
            <p className="text-sm font-medium">What happens to the remaining {totalOpen} units?</p>
            {totalOpen === 0 ? (
              <p className="text-sm text-muted-foreground">Everything has been invoiced. Nothing left to settle.</p>
            ) : rows.filter(r => r.open > 0).map(r => (
              <div key={r.sku} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm flex-1 min-w-0 truncate">{r.name}</span>
                  <span className="text-xs font-semibold shrink-0">{r.open} left</span>
                </div>
                <Select value={outcome[r.sku] ?? ''} onValueChange={v => v && setOutcome(o => ({ ...o, [r.sku]: v as Outcome }))}>
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue placeholder="Choose what happened…" />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTCOMES.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {outcome[r.sku] && (
                  <p className="text-[11px] text-muted-foreground">
                    {OUTCOMES.find(o => o.value === outcome[r.sku])?.hint}
                  </p>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-0.5">
              <Button size="sm" className="bg-red-600 hover:bg-red-700"
                disabled={busy || !everyOpenDecided} onClick={closeContract}>
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Close contract
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
            </div>
            {!everyOpenDecided && totalOpen > 0 && (
              <p className="text-xs text-muted-foreground">
                Decide on every product before closing — that choice decides what is credited.
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <FileText className="h-3 w-3 mt-0.5 shrink-0" />
          This note states the value of the stock and is not payable itself. Only the period
          invoices above are.
        </p>
      </CardContent>
    </Card>
  )
}
