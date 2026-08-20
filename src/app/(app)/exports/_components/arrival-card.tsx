'use client'

import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { PackageCheck, Loader2, Warehouse, AlertTriangle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useUpdateTransport } from '@/hooks/use-transports'
import { useAuth } from '@/contexts/auth-context'
import { transportColli } from '@/lib/transport-cargo'
import { isPosLine } from '@/lib/pos'
import { Colli, Transport } from '@/types'
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
  sku: string
  name: string
  expected: number
  received: number
  reason: string
}

/**
 * What actually went wrong, in words.
 *
 * A Supabase error is a plain object with a `message`, NOT an Error — so
 * `err instanceof Error` is false for every failure this screen can have, and
 * the catch fell through to a fixed sentence that told Danique nothing on
 * 2026-08-20. That is the silent-failure trap this codebase has been bitten by
 * before; the rule is that every failure says what it was.
 *
 * The step is named too. Three different things can fail here — the signature
 * upload, the stock booking and the transport itself — and "which one" is half
 * the answer.
 */
function why(step: string, err: unknown): string {
  const e = err as { message?: string; code?: string; details?: string } | null
  const msg = e?.message || e?.details || String(err)
  return `${step}: ${msg}${e?.code ? ` (${e.code})` : ''}`
}

/**
 * Goods receipt at the warehouse — one COLLI at a time.
 *
 * Danique, 2026-08-19: "zo hebben we 3 colli verscheept 3 weken geleden en 1
 * colli hebben we na 20 dagen ontvangen de andere pas na 23 dagen en de andere
 * is nog steeds zoek", and then plainly: "dit betekent tevens ook dat inslag per
 * colli zal gaan."
 *
 * She is right, and one signature for a whole load could never have said it.
 * Every box gets its own count, its own signature and its own day, and a box
 * still at sea simply has none of the three — which is the truth, not a gap.
 *
 * WAREHOUSE ONLY. A customer does not sign goods in; a transport that goes
 * straight to them is signed for on the delivery note, and the delivery IS the
 * arrival. That is why this card is not rendered at all for those.
 *
 * Two things happen at a warehouse and both occur:
 *   stays as stock  → the counted bottles of that box are booked IN here
 *   only forwarded  → nothing is booked; the goods are sold and travelling on.
 *                     The count and the signature are still recorded, because a
 *                     shortage has to be provable either way.
 *
 * There is deliberately no 'left Curaçao' booking here — that happened when the
 * load was picked, on the transport (migration 100 and the load screen).
 */
export function ArrivalCard({ transport }: { transport: Transport }) {
  const update = useUpdateTransport()
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  const t = transport
  const stores = t.stores_at_warehouse ?? false
  const colli = transportColli(t)

  // Read once, when the card mounts. "How long has this box been out" needs a
  // clock, and reading one while rendering makes the render impure — the same
  // component would draw two different numbers from the same data.
  const [now] = useState(() => Date.now())

  /** Which box is being counted right now, by index. Null = none. */
  const [counting, setCounting] = useState<number | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [notes, setNotes] = useState('')
  const [ata, setAta] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sigPadRef = useRef<SignaturePad | null>(null)

  useEffect(() => {
    if (counting === null || !canvasRef.current) return
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
  // no goods receipt here — the customer signs the delivery note instead.
  if (t.ship_to !== 'warehouse') return null

  const isIn = (c: Colli) => !!c.ata
  const arrivedCount = colli.filter(isIn).length

  /** The contents of one box, counted as expected until somebody says otherwise. */
  function startCounting(index: number) {
    const box = colli[index]
    setLines((box?.items ?? []).map(i => ({
      sku: i.sku,
      name: i.name,
      expected: i.qty,
      received: i.qty,
      reason: '',
    })))
    setNotes(box?.ata_note ?? '')
    // ATA defaults to today, because most boxes are booked in on the day they
    // land. It is editable, because some are not — a box found on a Monday can
    // have arrived on the Saturday, and the day it really landed is what the
    // transit time is measured from.
    setAta(box?.ata ?? new Date().toISOString().slice(0, 10))
    setCounting(index)
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  const differences = lines.filter(l => l.received !== l.expected)
  const missingReason = differences.filter(l => !l.reason)

  async function receiveBox(index: number) {
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
      const box = colli[index]

      // The signature is stored as a PATH: pod-files is private, so a public URL
      // would be a dead link the moment anyone opens it. A FRESH key every time,
      // because the bucket is effectively append-only — an overwrite is refused,
      // and a re-sign that silently failed would leave the wrong signature on a
      // proof document.
      const dataUrl = sigPadRef.current.toDataURL('image/png')
      const blob = await (await fetch(dataUrl)).blob()
      const path = `transport/${t.id}-colli${index + 1}-${crypto.randomUUID()}.png`
      const { error: upErr } = await supabase.storage
        .from('pod-files')
        .upload(path, blob, { contentType: 'image/png' })
      if (upErr) throw new Error(why('Signature', upErr))

      if (stores) {
        // Book in what was COUNTED in THIS box, out of the batch it left Curaçao
        // on. Read off the transport since 2026-08-19; the order picks stay
        // behind it so a load sent under the old rule can still be booked in.
        const { data: loaded, error: loadErr } = await supabase
          .from('stock_movements')
          .select('sku, batch_id')
          .eq('transport_id', t.id)
          .eq('reason', 'transport_out')
        if (loadErr) throw new Error(why('Reading the load', loadErr))

        const orderIds = (t.orders ?? []).map(o => o.id)
        const { data: picks, error: pickErr } = orderIds.length > 0
          ? await supabase
              .from('stock_movements')
              .select('sku, batch_id, order_id')
              .in('order_id', orderIds)
              .eq('reason', 'order')
          : { data: [], error: null }
        if (pickErr) throw new Error(why('Reading the picks', pickErr))

        const rows = lines
          .filter(l => l.received > 0)
          .map(l => {
            const pick = (loaded ?? []).find(p => p.sku === l.sku)
              ?? (picks ?? []).find(p => p.sku === l.sku)
            return pick ? {
              batch_id: pick.batch_id,
              sku: l.sku,
              qty: l.received,
              location_id: t.location_id,
              reason: 'received',
              // The order this box was packed for, when it was packed for one.
              order_id: box?.for_order_id ?? null,
              transport_id: t.id,
              note: l.received === l.expected
                ? `Colli ${index + 1} received at ${t.location?.name ?? 'the warehouse'}`
                : `Colli ${index + 1} received at ${t.location?.name ?? 'the warehouse'} — counted ${l.received} of ${l.expected}`,
            } : null
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)

        // Only bottles are missing a batch. POS material never has one — a
        // stand does not come out of a filling run — so a box holding nothing
        // but display material is not a problem and must not be reported as
        // one. Her point of 2026-08-20.
        const bottlesInBox = lines.some(l => l.received > 0 && !isPosLine(l))
        if (rows.length === 0 && bottlesInBox) {
          toast.warning('Nothing booked into stock — no batch was chosen for these products')
        } else if (rows.length > 0) {
          const { error } = await supabase.from('stock_movements').insert(rows)
          if (error) throw new Error(why('Booking stock in', error))
        }
      }

      // The box itself: its day, its count, its signature.
      const day = ata || new Date().toISOString().slice(0, 10)
      const nextColli = colli.map((c, i) => i === index ? {
        ...c,
        ata: day,
        ata_note: notes,
        received_items: lines,
        received_by: profile?.id ?? null,
        receipt_signature_url: path,
      } : c)

      // And the same lines on the transport, where the shortage panel reads
      // them. Kept per order so crediting a customer still knows whose bottles
      // came up short; a loose box has no order and simply says so.
      const orderOf = (t.orders ?? []).find(o => o.id === box?.for_order_id)
      const recorded = [
        ...((t.receipt_lines ?? []) as Record<string, unknown>[]),
        ...lines.map(l => ({
          order_id: orderOf?.id ?? '',
          order_number: orderOf?.order_number ?? `Colli ${index + 1}`,
          colli: index + 1,
          sku: l.sku,
          name: l.name,
          expected: l.expected,
          received: l.received,
          reason: l.reason,
        })),
      ]

      const allIn = nextColli.every(c => !!c.ata)
      await update.mutateAsync({
        id: t.id,
        values: {
          colli_contents: nextColli,
          receipt_lines: recorded,
          // The load counts as landed from the FIRST box: there is stock here
          // now, and uitslag has to be able to give it out.
          arrived_at: t.arrived_at ?? new Date().toISOString(),
          received_by: t.received_by ?? profile?.id ?? null,
          receipt_signature_url: t.receipt_signature_url ?? path,
          // Only when every box is in is the transport itself done.
          ...(allIn ? { status: 'delivered' } : {}),
        } as never,
      })
      queryClient.invalidateQueries({ queryKey: ['batch_stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      setCounting(null)
      toast.success(
        differences.length > 0
          ? `Colli ${index + 1} received with ${differences.length} difference${differences.length === 1 ? '' : 's'}`
          : `Colli ${index + 1} received`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : why('Goods receipt', err), { duration: 12000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Warehouse className="h-4 w-4" />
          Goods receipt at {t.location?.name ?? 'the warehouse'}
          {colli.length > 0 && (
            <span className={`ml-auto text-xs font-normal ${
              arrivedCount === colli.length ? 'text-green-700' : 'text-amber-600'
            }`}>
              {arrivedCount} of {colli.length} received
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-red-600"
            checked={stores}
            disabled={arrivedCount > 0}
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
              Locked once the first box is in — it decides what was booked.
            </span>
          </span>
        </label>

        {colli.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No colli on this transport yet. Intake is per box, so pack the load
            first — under Packing above.
          </p>
        ) : colli.map((c, index) => {
          const recorded = (c.received_items ?? []) as Line[]
          const diffs = recorded.filter(l => l.received !== l.expected)
          const inside = c.items.map(i => `${i.qty}× ${i.name}`).join(', ')

          return (
            <div key={index} className="rounded-lg border p-2.5 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">Colli {index + 1}</p>
                {isIn(c) ? (
                  <span className="text-xs text-green-700 flex items-center gap-1">
                    <PackageCheck className="h-3.5 w-3.5" />
                    {new Date(`${c.ata}T12:00:00`).toLocaleDateString('en', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    still out
                    {t.etd && ` · ${Math.max(0, Math.round(
                      (now - Date.parse(`${t.etd}T12:00:00`)) / 86400000
                    ))} days`}
                  </span>
                )}
                {!isIn(c) && counting === null && (
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-red-600 hover:bg-red-700 gap-1.5 ml-auto"
                    onClick={() => startCounting(index)}
                    disabled={c.items.length === 0}
                  >
                    <PackageCheck className="h-3.5 w-3.5" />
                    Goods receipt
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {inside || 'Empty box — nothing to count'}
              </p>

              {/* What was counted stays visible. A difference nobody can look up
                  afterwards is the same as no difference at all. */}
              {isIn(c) && diffs.length > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-2 space-y-0.5">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {diffs.length} difference{diffs.length === 1 ? '' : 's'}
                  </p>
                  {diffs.map((l, i) => (
                    <p key={i} className="text-xs">
                      {l.name} — counted {l.received} of {l.expected}
                      <span className="text-muted-foreground">
                        {' · '}{REASONS.find(r => r.value === l.reason)?.label ?? l.reason}
                      </span>
                    </p>
                  ))}
                </div>
              )}
              {isIn(c) && c.ata_note ? (
                <p className="text-xs text-muted-foreground">{c.ata_note}</p>
              ) : null}

              {counting === index && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-sm font-medium">What was actually in this box?</p>

                  <div className="space-y-1.5">
                    {lines.map((l, i) => {
                      const diff = l.received - l.expected
                      return (
                        <div key={l.sku} className="space-y-1 border-b pb-1.5 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="flex-1 min-w-0 text-sm truncate">{l.name}</span>
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
                                  <SelectValue placeholder="Why?" />
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

                  {/* ATA — the day this box really landed. It lives here rather
                      than in the packing (her call, 2026-08-20): you know it
                      while you are standing in front of the box counting it,
                      not weeks earlier while you are filling it. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground shrink-0">ATA</span>
                    <Input
                      type="date"
                      value={ata}
                      onChange={e => setAta(e.target.value)}
                      className="h-8 w-40 text-sm"
                    />
                    {ata && t.etd && (
                      <span className="text-xs text-muted-foreground">
                        {Math.max(0, Math.round(
                          (Date.parse(`${ata}T12:00:00`) - Date.parse(`${t.etd}T12:00:00`)) / 86400000
                        ))} days in transit
                      </span>
                    )}
                  </div>

                  <Input
                    placeholder="Note about this box — optional"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="h-8 text-sm"
                  />

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Signature — whoever received this box
                    </p>
                    <canvas
                      ref={canvasRef}
                      className="w-full h-28 rounded-lg border bg-white touch-none"
                    />
                    <button
                      className="text-xs text-muted-foreground underline mt-1"
                      onClick={() => sigPadRef.current?.clear()}
                    >
                      Clear
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 gap-1.5"
                      disabled={busy}
                      onClick={() => receiveBox(index)}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                      Receive colli {index + 1}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCounting(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {colli.length > 0 && arrivedCount < colli.length && (
          <p className="text-xs text-muted-foreground">
            A box that never turns up simply stays open. Nothing is booked for it,
            and the shortage is settled from what did arrive.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
