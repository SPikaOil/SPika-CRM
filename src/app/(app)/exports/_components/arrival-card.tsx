'use client'

import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { PackageCheck, Loader2, Warehouse, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useUpdateTransport } from '@/hooks/use-transports'
import { useAuth } from '@/contexts/auth-context'
import { Transport, QuoteItem } from '@/types'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/** Why a counted number is not the expected one. */
const REASONS = [
  { value: 'broken',  label: 'Broken in transit' },
  { value: 'missing', label: 'Missing / short' },
  { value: 'extra',   label: 'More than expected' },
  { value: 'other',   label: 'Other' },
] as const

interface Line {
  order_id: string
  order_number: string
  sku: string
  name: string
  expected: number
  received: number
  reason: string
}

/**
 * Signing a transport in at the other end, counting what really arrived.
 *
 * Danique, 2026-08-14: "bij warehouse kunnen bij inslag ook verschillen zijn,
 * voeg dit hier ook in toe voor desbetreffende sales personen van de warehouse".
 *
 * So intake works like a delivery to a customer: somebody counts, names the
 * difference, and signs for it. What goes into stock is the COUNTED number —
 * booking the expected one is how a shelf holding 198 keeps being called 200,
 * forever, with nothing to reconcile it against.
 *
 * Two things happen at a warehouse, and both occur:
 *   stays as stock  → the counted bottles are booked IN here ('received')
 *   only forwarded  → nothing is booked; the goods are already sold and on their
 *                     way. The count and the signature are still recorded,
 *                     because a shortage has to be provable either way.
 *
 * There is deliberately no 'left Curaçao' booking. Picking the batch on the
 * order already took those bottles off the shelf.
 */
export function ArrivalCard({ transport }: { transport: Transport }) {
  const update = useUpdateTransport()
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  const t = transport
  const orders = t.orders ?? []
  const stores = t.stores_at_warehouse ?? false
  const arrived = !!t.arrived_at

  const [counting, setCounting] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sigPadRef = useRef<SignaturePad | null>(null)

  useEffect(() => {
    if (!counting || !canvasRef.current) return
    const canvas = canvasRef.current
    sigPadRef.current = new SignaturePad(canvas, {
      backgroundColor: 'rgba(255,255,255,0)', penColor: '#1a1a1a',
    })
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext('2d')?.scale(ratio, ratio)
    sigPadRef.current.clear()
    return () => { sigPadRef.current?.off() }
  }, [counting])

  // Only a warehouse can hold stock. A transport straight to the customer has
  // nothing to sign in here — the customer signs the delivery note.
  if (t.ship_to !== 'warehouse') return null

  /** Everything on this transport, counted as expected until somebody says otherwise. */
  function startCounting() {
    const rows: Line[] = []
    for (const order of orders) {
      for (const item of (order.items ?? []) as QuoteItem[]) {
        if (item.qty <= 0) continue
        rows.push({
          order_id: order.id,
          order_number: order.order_number,
          sku: item.sku,
          name: item.name,
          expected: item.qty,
          received: item.qty,
          reason: '',
        })
      }
    }
    setLines(rows)
    setCounting(true)
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  const differences = lines.filter(l => l.received !== l.expected)
  const missingReason = differences.filter(l => !l.reason)

  async function signIn() {
    if (missingReason.length > 0) {
      toast.error('Say why the count differs — every difference needs a reason')
      return
    }
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      toast.error('Please capture a signature')
      return
    }

    setBusy(true)
    try {
      const supabase = createClient()

      // The signature is stored as a PATH. pod-files is private, so a public URL
      // would be a dead link the moment anyone tries to open it.
      const dataUrl = sigPadRef.current.toDataURL('image/png')
      const blob = await (await fetch(dataUrl)).blob()
      const path = `transport/${t.id}.png`
      const { error: upErr } = await supabase.storage
        .from('pod-files')
        .upload(path, blob, { upsert: true, contentType: 'image/png' })
      if (upErr) throw upErr

      if (stores) {
        // Book in what was COUNTED, out of the batch it LEFT CURAÇAO on.
        //
        // Read off the transport since 2026-08-19, not off the orders. The
        // bottles come off the shelf when they are loaded, so the batch is a
        // property of the load — and an order on two transports has no single
        // pick to read any more. Falls back to the order picks so a transport
        // loaded under the old rule can still be signed in.
        const { data: loaded, error: loadErr } = await supabase
          .from('stock_movements')
          .select('sku, batch_id')
          .eq('transport_id', t.id)
          .eq('reason', 'transport_out')
        if (loadErr) throw loadErr

        const { data: picks, error: pickErr } = await supabase
          .from('stock_movements')
          .select('sku, batch_id, order_id')
          .in('order_id', orders.map(o => o.id))
          .eq('reason', 'order')
        if (pickErr) throw pickErr

        const rows = lines
          .filter(l => l.received > 0)
          .map(l => {
            const pick = (loaded ?? []).find(p => p.sku === l.sku)
              ?? (picks ?? []).find(p => p.order_id === l.order_id && p.sku === l.sku)
            return pick ? {
              batch_id: pick.batch_id,
              sku: l.sku,
              qty: l.received,
              location_id: t.location_id,
              reason: 'received',
              order_id: l.order_id,
              transport_id: t.id,
              note: l.received === l.expected
                ? `Received at ${t.location?.name ?? 'the warehouse'}`
                : `Received at ${t.location?.name ?? 'the warehouse'} — counted ${l.received} of ${l.expected}`,
            } : null
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)

        if (rows.length === 0) {
          toast.warning('Nothing booked in — no batches were chosen on these orders')
        } else {
          const { error } = await supabase.from('stock_movements').insert(rows)
          if (error) throw error
        }
      }

      await update.mutateAsync({
        id: t.id,
        values: {
          arrived_at: new Date().toISOString(),
          status: 'delivered',
          received_by: profile?.id ?? null,
          receipt_signature_url: path,
          receipt_lines: lines,
          receipt_notes: notes,
        } as never,
      })
      queryClient.invalidateQueries({ queryKey: ['batch_stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      setCounting(false)
      toast.success(
        differences.length > 0
          ? `Signed in with ${differences.length} difference${differences.length === 1 ? '' : 's'}`
          : 'Signed in'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign this transport in')
    } finally {
      setBusy(false)
    }
  }

  const recorded = (t.receipt_lines ?? []) as Line[]
  const recordedDiffs = recorded.filter(l => l.received !== l.expected)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Warehouse className="h-4 w-4" />
          Arrival at {t.location?.name ?? 'the warehouse'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-red-600"
            checked={stores}
            disabled={arrived}
            onChange={e => update.mutate({
              id: t.id,
              values: { stores_at_warehouse: e.target.checked } as never,
            })}
          />
          <span>
            Stays here as stock
            <span className="block text-xs text-muted-foreground">
              Tick this when the bottles are stored here and shipped onward later.
              Leave it off when this place only forwards a load that is already sold.
            </span>
          </span>
        </label>

        {arrived ? (
          <div className="space-y-1.5">
            <p className="text-sm text-green-700 flex items-center gap-1.5">
              <PackageCheck className="h-4 w-4" />
              Signed in on {new Date(t.arrived_at!).toLocaleDateString('en', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
              {stores ? ' · booked into the warehouse' : ''}
            </p>
            {/* What was counted stays visible. A difference nobody can look up
                afterwards is the same as no difference at all. */}
            {recordedDiffs.length > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-2 space-y-0.5">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {recordedDiffs.length} difference{recordedDiffs.length === 1 ? '' : 's'} at intake
                </p>
                {recordedDiffs.map((l, i) => (
                  <p key={i} className="text-xs">
                    {l.name} — counted {l.received} of {l.expected}
                    <span className="text-muted-foreground">
                      {' · '}{REASONS.find(r => r.value === l.reason)?.label ?? l.reason}
                    </span>
                  </p>
                ))}
              </div>
            )}
            {t.receipt_notes ? (
              <p className="text-xs text-muted-foreground">{t.receipt_notes}</p>
            ) : null}
          </div>
        ) : !counting ? (
          <>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
              disabled={orders.length === 0} onClick={startCounting}>
              <PackageCheck className="h-3.5 w-3.5" />
              Count and sign in
            </Button>
            {orders.length === 0 && (
              <p className="text-xs text-muted-foreground">Put an order on this transport first</p>
            )}
          </>
        ) : (
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium">What actually arrived?</p>

            <div className="space-y-1.5">
              {lines.map((l, i) => {
                const diff = l.received - l.expected
                return (
                  <div key={`${l.order_id}-${l.sku}`} className="space-y-1 border-b pb-1.5 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-sm truncate">
                        {l.name}
                        <span className="text-xs text-muted-foreground"> · {l.order_number}</span>
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">of {l.expected}</span>
                      <Input
                        type="number" min="0"
                        className={`h-7 w-20 text-sm text-right px-2 ${diff !== 0 ? 'border-orange-400' : ''}`}
                        value={l.received}
                        onChange={e => setLine(i, { received: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </div>
                    {diff !== 0 && (
                      <div className="flex items-center gap-2 pl-1">
                        <span className={`text-xs shrink-0 ${diff < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                        <Select value={l.reason || undefined}
                          onValueChange={v => v && setLine(i, { reason: v })}>
                          <SelectTrigger className={`h-7 text-xs px-2 flex-1 ${!l.reason ? 'border-red-300' : ''}`}>
                            <SelectValue placeholder="Why?">
                              {(v: string) => REASONS.find(r => r.value === v)?.label ?? 'Why?'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {REASONS.map(r => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Input placeholder="Notes (optional)" className="h-8"
              value={notes} onChange={e => setNotes(e.target.value)} />

            <div className="space-y-1">
              <Label className="text-xs">Signature *</Label>
              <canvas ref={canvasRef}
                className="w-full h-28 rounded-lg border bg-white touch-none" />
              <button type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => sigPadRef.current?.clear()}>
                Clear
              </button>
            </div>

            {differences.length > 0 && (
              <p className="text-xs text-orange-700 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {differences.length} difference{differences.length === 1 ? '' : 's'} — only what you counted goes into stock
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
                disabled={busy} onClick={signIn}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                Sign in
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCounting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
