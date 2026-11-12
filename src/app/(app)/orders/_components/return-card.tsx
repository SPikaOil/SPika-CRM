'use client'

import { useState } from 'react'
import { Undo2, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { QtyInput } from '@/components/ui/qty-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/auth-context'
import { useUpdateOrder } from '@/hooks/use-orders'
import { SPIKA_PRODUCTS } from '@/lib/products'
import type { Order, QuoteItem, OrderEditLogEntry } from '@/types'

/**
 * Goods the customer hands back, settled on THIS order.
 *
 * Danique, 2026-11-12: during a delivery she checks what is still on the
 * reseller's shelf. She found a lot of old stock, some of it past its date,
 * from several earlier deliveries. She took all of it back and gives part of
 * the value back, not all of it.
 *
 * So the return rides on the order she is delivering right now, rather than on
 * the invoices the goods originally came from: one visit, one document, one
 * net amount. The reference to those older invoices is a note on the line.
 *
 * The lines are NEGATIVE, exactly as the table-bottle return has always been.
 * That matters in three places and all three already behave:
 *   - the invoice prints line_total, so a negative line reads as a credit;
 *   - the order total drops, so revenue corrects itself in this month;
 *   - delivery planning filters on qty > 0, so nobody is ever asked to deliver
 *     minus forty bottles.
 *
 * NO stock movement is written. The bottles left stock when they were
 * delivered, and they are destroyed rather than put back on the shelf, so
 * booking them in and out again would be two movements cancelling each other —
 * and every movement needs a batch, which nobody has to hand for goods that
 * came off a delivery months ago. Her decision of 2026-11-12.
 */
type Row = { sku: string; qty: number; unit: number; note: string }

const EMPTY: Row = { sku: '', qty: 0, unit: 0, note: '' }

export function ReturnCard({ order }: { order: Order }) {
  const { isAdmin, can, profile } = useAuth()
  const updateOrder = useUpdateOrder()

  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY }])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Admin always; anyone else only when the permission is ticked for their
  // role, so this can be handed over later without touching the code.
  if (!(isAdmin || can('orders.return'))) return null

  const currency = (order as any).currency ?? 'XCG'
  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`

  const items = (order.items ?? []) as QuoteItem[]
  const existing = items.filter(i => i.is_return)
  const filled = rows.filter(r => r.sku && r.qty > 0)
  const total = filled.reduce((s, r) => s + r.qty * r.unit, 0)

  function patch(i: number, part: Partial<Row>) {
    setRows(prev => prev.map((r, k) => (k === i ? { ...r, ...part } : r)))
  }

  async function save() {
    if (filled.length === 0) { toast.error('Nothing to take back yet'); return }
    if (!reason.trim()) { toast.error('A reason is required'); return }
    for (const r of filled) {
      if (r.unit <= 0) {
        toast.error(`${SPIKA_PRODUCTS.find(p => p.sku === r.sku)?.name ?? r.sku}: fill in what you give back per unit`)
        return
      }
    }

    setSaving(true)
    try {
      const newLines: QuoteItem[] = filled.map(r => ({
        sku: r.sku,
        name: SPIKA_PRODUCTS.find(p => p.sku === r.sku)?.name ?? r.sku,
        qty: -r.qty,
        unit_price: r.unit,
        discount: 0,
        line_total: -parseFloat((r.qty * r.unit).toFixed(2)),
        is_return: true,
        return_note: r.note.trim(),
      }))

      const newItems = [...items, ...newLines]
      const newTotal = parseFloat(newItems.reduce((s, i) => s + (Number(i.line_total) || 0), 0).toFixed(2))

      const entry: OrderEditLogEntry = {
        edited_by: profile?.name ?? 'Admin',
        edited_at: new Date().toISOString(),
        reason: `Goods taken back: ${reason.trim()}`,
        old_items: items,
        new_items: newItems,
        old_total: Number(order.total),
        new_total: newTotal,
      }

      await updateOrder.mutateAsync({
        id: order.id,
        values: { items: newItems, total: newTotal, edit_log: [...(order.edit_log ?? []), entry] } as any,
      })

      toast.success(`${filled.reduce((s, r) => s + r.qty, 0)} taken back — ${fmt(total)} credited`)
      setRows([{ ...EMPTY }])
      setReason('')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the return')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Undo2 className="h-4 w-4" />
          Goods taken back
          {existing.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {existing.length} line{existing.length === 1 ? '' : 's'} on this order
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Old or expired stock you took back on this visit, from any earlier delivery.
          It becomes a negative line on this order, so the customer pays the balance.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* What is already on the order, so nothing is entered twice. */}
        {existing.map((i, k) => (
          <div key={`e${k}`} className="flex items-start justify-between gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{Math.abs(i.qty)}× {i.name}</p>
              {i.return_note ? <p className="text-xs text-muted-foreground truncate">{i.return_note}</p> : null}
            </div>
            <span className="text-sm font-semibold text-red-600 shrink-0">− {fmt(Math.abs(i.line_total))}</span>
          </div>
        ))}

        {!open ? (
          <Button variant="outline" size="sm" className="gap-1 w-full sm:w-auto" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Take goods back
          </Button>
        ) : (
          <>
            {rows.map((r, i) => (
              <div key={i} className="rounded-lg border p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <Select value={r.sku} onValueChange={v => patch(i, { sku: v ?? '' })}>
                    <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Pick a product…" /></SelectTrigger>
                    <SelectContent>
                      {SPIKA_PRODUCTS.map(p => (
                        <SelectItem key={p.sku} value={p.sku}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rows.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 shrink-0"
                      onClick={() => setRows(prev => prev.filter((_, k) => k !== i))}
                      aria-label="Remove this line"
                      title="Remove this line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">How many came back</label>
                    <QtyInput value={r.qty} onChange={qty => patch(i, { qty })} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">You give back ({currency})</label>
                    <PriceInput value={r.unit} onChange={unit => patch(i, { unit })} className="h-8 text-sm" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Which invoice it came off</label>
                  <Input
                    value={r.note}
                    onChange={e => patch(i, { note: e.target.value })}
                    placeholder="e.g. 729134 and 729147, expired Feb 2026"
                    className="h-8 text-sm"
                  />
                </div>

                {r.qty > 0 && r.unit > 0 && (
                  <p className="text-xs text-muted-foreground text-right">
                    {r.qty} × {fmt(r.unit)} = <span className="font-semibold text-red-600">− {fmt(r.qty * r.unit)}</span>
                  </p>
                )}
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-8 w-full sm:w-auto"
              onClick={() => setRows(prev => [...prev, { ...EMPTY }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Another product
            </Button>

            <div className="space-y-1 pt-1">
              <label className="text-xs text-muted-foreground">Reason — kept on the order for later</label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. old stock found on the shelf, partly expired"
                className="h-8 text-sm"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t">
              <span className="text-sm font-semibold">Credited</span>
              <span className="text-sm font-bold text-red-600">− {fmt(total)}</span>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 gap-2" onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Take back
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setOpen(false); setRows([{ ...EMPTY }]); setReason('') }}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
