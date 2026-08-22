'use client'

import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { PackageCheck, Loader2, Plus, Minus, Check, Clock, X, Trash2, Eye, FileSpreadsheet } from 'lucide-react'
import { downloadCsv, csvDate } from '@/lib/csv-export'
import { useAuth } from '@/contexts/auth-context'
import { useUsers } from '@/hooks/use-users'
import { handoverBatchFor } from '@/lib/intake-batch'
import { createClient } from '@/lib/supabase/client'
import { openPrivateFile } from '@/lib/storage'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { SPIKA_PRODUCTS } from '@/lib/products'
import { BatchSelect } from '@/components/batch-select'
import { useBatches, useBatchStock } from '@/hooks/use-batches'
import { useTransportLocations, useWarehouseMemberships } from '@/hooks/use-transports'

// Only physical bottle products can be handed over
const HANDOVER_SKUS = SPIKA_PRODUCTS.filter(p => !p.sku.includes('return')).map(p => p.sku)

// A Select item cannot carry an empty value. Null keeps meaning Curaçao.
const CURACAO = '__curacao__'

/**
 * Handing back what you are still carrying.
 *
 * Her rule of 2026-08-21 for a return: "terug naar Curacao, via dezelfde
 * handover maar dan de andere kant op" — one mechanism, both directions, so a
 * person is somewhere you can send FROM as well as to.
 */
const MY_OWN = '__mine__'

/** Why a counted number is not the one that was sent. */
const RECEIPT_REASONS = [
  { value: 'broken',  label: 'Broken in transit' },
  { value: 'missing', label: 'Missing / short' },
  { value: 'extra',   label: 'More than sent' },
  { value: 'other',   label: 'Other' },
] as const

interface CountLine { sku: string; name: string; expected: number; received: number; reason: string }

interface Batch {
  id: string
  /** Free text from before batches were real records. Kept for old rows only. */
  batch_number: string | null
  /** The batch these bottles came off. Chosen, never typed. */
  batch_id: string | null
  handover_date: string | null
  member_id: string | null
  /** Where it left from. Null = Curaçao. */
  from_location_id: string | null
  /** Where it is going, when that is a place rather than a person (mig 117). */
  to_location_id: string | null
  /** The person handing it back, for a return (mig 117). */
  from_holder_id: string | null
  /** When it really left. Null = ordered, still on the sending shelf (mig 117). */
  sent_at: string | null
  /** Set when it travelled by post instead of hand to hand. */
  tracking_number: string | null
  tracking_carrier: string | null
  /** What the receiver counted. Empty until it is signed for. */
  receipt_lines?: CountLine[]
  items: { sku: string; name: string; qty: number }[]
  notes: string
  signature_url: string | null
  signed_at: string | null
  signer_name: string | null
  created_at: string
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function HandoverPage() {
  const { isAdmin, profile, can } = useAuth()
  const supabase = createClient()
  const { data: users } = useUsers()
  const { data: stockBatches } = useBatches()
  const { data: locations } = useTransportLocations()
  // Which shelves this person actually works at. A warehouse member may hand
  // stock over from their own place and from nowhere else.
  const { data: memberships } = useWarehouseMemberships()
  const myLocationIds = (memberships ?? [])
    .filter(m => m.user_id === profile?.id)
    .map(m => m.location_id)

  const { data: allStock } = useBatchStock()
  const iAmCarrying = (allStock ?? []).some(r => r.holder_id === profile?.id && r.qty > 0)

  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)

  // New batch form
  const [batchId, setBatchId] = useState<string | null>(null)
  /** Where the bottles leave from. Null = Curaçao. */
  const [fromLocationId, setFromLocationId] = useState<string | null>(null)
  /** Handing back your own stock instead of taking it off a shelf. */
  const [fromMine, setFromMine] = useState(false)
  /** To a colleague, or to another warehouse. Both are hers, neither replaces the other. */
  const [destination, setDestination] = useState<'person' | 'warehouse'>('person')
  const [toLocationId, setToLocationId] = useState<string | null>(null)
  /** A warehouse handover can be ordered now and packed later. */
  const [sendImmediately, setSendImmediately] = useState(true)
  const [tracking, setTracking] = useState('')
  const [trackingCarrier, setTrackingCarrier] = useState('')
  const [handoverDate, setHandoverDate] = useState(todayStr())
  const [memberId, setMemberId] = useState('')
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)

  // Signing
  const [signBatch, setSignBatch] = useState<Batch | null>(null)
  const [signing, setSigning] = useState(false)
  const [countLines, setCountLines] = useState<CountLine[]>([])

  // Delete (reconciliation after delivery)
  const [deleteBatch, setDeleteBatch] = useState<Batch | null>(null)
  const [deleting, setDeleting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sigPadRef = useRef<SignaturePad | null>(null)

  async function loadBatches() {
    let q = supabase.from('handover_batches').select('*').order('created_at', { ascending: false })
    /**
     * Yours: the ones addressed to you, and the ones your warehouse is sending
     * or expecting (migration 117).
     *
     * It used to be only "addressed to me", which meant a warehouse-to-warehouse
     * handover was invisible to both warehouses — the very thing she wanted to
     * stop having to ring somebody about.
     */
    if (!isAdmin && profile?.id) {
      const places = myLocationIds.filter((l): l is string => !!l)
      const clauses = [`member_id.eq.${profile.id}`, `from_holder_id.eq.${profile.id}`]
      if (places.length > 0) {
        clauses.push(`from_location_id.in.(${places.join(',')})`)
        clauses.push(`to_location_id.in.(${places.join(',')})`)
      }
      q = q.or(clauses.join(','))
    }
    const { data } = await q
    setBatches((data as Batch[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { if (profile) loadBatches() /* eslint-disable-next-line */ }, [profile?.id, isAdmin])

  // Opening the dialog starts the count at what was sent; the receiver corrects
  // it where reality differs.
  useEffect(() => {
    setCountLines((signBatch?.items ?? []).map(i => ({
      sku: i.sku, name: i.name, expected: i.qty, received: i.qty, reason: '',
    })))
  }, [signBatch])

  useEffect(() => {
    if (signBatch && canvasRef.current) {
      sigPadRef.current = new SignaturePad(canvasRef.current, { backgroundColor: 'rgba(255,255,255,0)', penColor: '#1a1a1a' })
      const canvas = canvasRef.current
      const ratio = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext('2d')?.scale(ratio, ratio)
      sigPadRef.current.clear()
    }
    return () => { sigPadRef.current?.off() }
  }, [signBatch])

  // Anyone internal can be handed bottles — listing roles individually meant a
  // new role (Manager) silently disappeared from this dropdown.
  const INTERNAL_ROLES = ['admin', 'manager', 'sales', 'staff']
  const salesTeam = (users ?? []).filter(u => INTERNAL_ROLES.includes(u.role) && (u as any).is_active !== false)
  // A handover shows the batch it came off. Rows from before batches were real
  // records fall back to whatever text was typed at the time.
  const batchNumberOf = (b: Batch) =>
    (stockBatches ?? []).find(x => x.id === b.batch_id)?.batch_number ?? b.batch_number
  // Where a person's stock lands. One person, one place — migration 068 makes
  // sure of that, so this find can only ever match once.
  const placeOf = (userId: string | null) => (userId ? (locations ?? []).find(l => l.user_id === userId) : null) ?? null
  /**
   * Who this handover is FOR, in one word.
   *
   * A colleague or a warehouse since migration 117. Every place that used to
   * print the member's name now asks this instead — otherwise a handover to a
   * warehouse reads as 'Unknown', which is what happens when a screen assumes
   * there is always a person.
   */
  const forWhom = (b: { to_location_id: string | null; member_id: string | null }) =>
    b.to_location_id ? placeName(b.to_location_id) : memberName(b.member_id)
  const placeName = (id: string | null) =>
    id ? ((locations ?? []).find(l => l.id === id)?.name ?? 'a warehouse') : 'Curaçao'
  /**
   * From → to, in plain words.
   *
   * Either end can be a place or a person now (migration 117): bottles going to
   * a warehouse, bottles going to a colleague, and a colleague handing what is
   * left back to Curaçao.
   */
  const routeOf = (b: Batch) => {
    const from = b.from_holder_id ? memberName(b.from_holder_id) : placeName(b.from_location_id)
    const to = forWhom(b)
    return `${from} → ${to}`
  }
  /** How many bottles went missing between sending and signing. */
  const shortOf = (b: Batch) =>
    (b.receipt_lines ?? []).reduce((sum, l) => sum + Math.max(0, l.expected - l.received), 0)
  const memberName = (id: string | null) => (id ? users?.find(u => u.id === id)?.name : null) ?? 'Unknown'

  function adjust(sku: string, delta: number) {
    setQtys(prev => ({ ...prev, [sku]: Math.max(0, (prev[sku] ?? 0) + delta) }))
  }

  /**
   * Hand bottles over, or order that they be handed over.
   *
   * Two kinds of destination since 2026-08-21, both hers and neither replacing
   * the other: a colleague who takes fifty bottles and works through them, and
   * a warehouse that needs stock from another warehouse.
   *
   * SENT NOW or ORDERED. Handing something to somebody standing in front of you
   * is one act, so that goes straight out. Telling a warehouse on another island
   * to send a load is not: the goods are still on their shelf until they
   * actually pack them, and booking them off before that would empty a shelf
   * that is still full. Her words — "admin stelt dit in, zodra warehouse a dit
   * gaat regelen en alles invoert".
   */
  async function createBatch() {
    const toPerson = destination === 'person'
    if (toPerson && !memberId) { toast.error('Select a team member'); return }
    if (!toPerson && !toLocationId) { toast.error('Select the warehouse it goes to'); return }
    if (!toPerson && toLocationId === fromLocationId) {
      toast.error('It has to go somewhere else than where it is')
      return
    }
    const items = HANDOVER_SKUS
      .filter(sku => (qtys[sku] ?? 0) > 0)
      .map(sku => ({ sku, name: SPIKA_PRODUCTS.find(p => p.sku === sku)!.name, qty: qtys[sku] }))
    if (items.length === 0) { toast.error('Add at least one bottle'); return }
    // No batch, no handover: you cannot give away bottles that were never
    // filled — the rule migration 055 was written for.
    if (!batchId) { toast.error('Choose the batch these bottles come from'); return }

    // Ordering one for somebody else to arrange is only for whoever may do
    // that. Handing bottles to a colleague yourself needs nothing extra.
    if (!toPerson && !can('handover.send')) {
      toast.error('Only an admin or manager sends stock between warehouses')
      return
    }

    setCreating(true)
    const sendNow = toPerson || sendImmediately
    const { data: created, error } = await supabase.from('handover_batches').insert({
      batch_id: batchId,
      from_location_id: fromMine ? null : fromLocationId,
      from_holder_id: fromMine ? profile?.id ?? null : null,
      to_location_id: toPerson ? null : toLocationId,
      tracking_number: tracking.trim(),
      tracking_carrier: trackingCarrier.trim(),
      handover_date: handoverDate || null,
      sent_at: sendNow ? new Date().toISOString() : null,
      member_id: toPerson ? memberId : null,
      items, notes, created_by: profile?.id,
    }).select('id').single()
    if (error) { setCreating(false); toast.error(error.message); return }

    if (sendNow) {
      const moveErr = await bookOut(created.id as string, batchId, items, fromMine ? profile?.id ?? null : null)
      setCreating(false)
      if (moveErr) { toast.error(`Handover saved, but the stock was not booked: ${moveErr}`); return }
      toast.success('Handover created')
    } else {
      setCreating(false)
      toast.success('Asked for — the bottles stay on the shelf until it is sent')
    }

    setBatchId(null); setHandoverDate(todayStr()); setMemberId(''); setQtys({}); setNotes('')
    setFromLocationId(null); setFromMine(false); setToLocationId(null); setTracking(''); setTrackingCarrier('')
    loadBatches()
  }

  /**
   * The bottles leave the shelf.
   *
   * At SENDING, not at signing: they are physically gone the moment they are
   * handed over — in the post, in a car, in somebody's hands — and the place
   * they left has to say so.
   */
  async function bookOut(
    handoverId: string,
    fromBatch: string,
    items: { sku: string; name: string; qty: number }[],
    fromHolder: string | null = null,
  ): Promise<string | null> {
    const { error } = await supabase.from('stock_movements').insert(
      items.map(i => ({
        batch_id: fromBatch,
        sku: i.sku,
        qty: -i.qty,
        location_id: fromHolder ? null : fromLocationId,
        holder_id: fromHolder,
        reason: 'handover',
        handover_batch_id: handoverId,
        note: 'Handed over',
        created_by: profile?.id,
      }))
    )
    return error ? error.message : null
  }

  /**
   * An ordered handover that is now really going.
   *
   * This is the moment warehouse A packs the boxes and fills in the carrier and
   * the tracking number. Only then do the bottles come off their shelf, and only
   * then does it appear on the other warehouse's dashboard as on its way.
   */
  async function sendBatch(b: Batch) {
    setCreating(true)
    const { error } = await supabase
      .from('handover_batches')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', b.id)
    if (error) { setCreating(false); toast.error(error.message); return }
    const moveErr = b.batch_id ? await bookOut(b.id, b.batch_id, b.items, b.from_holder_id) : null
    setCreating(false)
    if (moveErr) { toast.error(`Sent, but the stock was not booked: ${moveErr}`); return }
    toast.success('On its way')
    loadBatches()
  }

  async function confirmDelete() {
    if (!deleteBatch) return
    setDeleting(true)
    try {
      // Remove the signature file too, if any
      const path = `handover/${deleteBatch.id}.png`
      await supabase.storage.from('pod-files').remove([path]).catch(() => {})
      // Removing a handover puts the bottles back on the batch. The handover
      // never happened, so the stock must not stay deducted.
      const { error: moveErr } = await supabase
        .from('stock_movements')
        .delete()
        .eq('handover_batch_id', deleteBatch.id)
        .eq('reason', 'handover')
      if (moveErr) throw moveErr
      const { error } = await supabase.from('handover_batches').delete().eq('id', deleteBatch.id)
      if (error) throw error
      toast.success('Handover record removed')
      setDeleteBatch(null)
      loadBatches()
    } catch (err: any) {
      toast.error(err.message ?? 'Could not delete')
    } finally {
      setDeleting(false)
    }
  }

  async function confirmSign() {
    if (!signBatch || !sigPadRef.current || sigPadRef.current.isEmpty()) {
      toast.error('Please capture a signature'); return
    }
    setSigning(true)
    try {
      // Every difference needs a reason. A shortage nobody explained is a
      // shortage nobody can chase with the carrier afterwards.
      const shortWithoutReason = countLines.filter(l => l.received !== l.expected && !l.reason)
      if (shortWithoutReason.length > 0) {
        toast.error('Say why the count differs — every difference needs a reason')
        setSigning(false)
        return
      }

      const dataUrl = sigPadRef.current.toDataURL('image/png')
      const blob = await (await fetch(dataUrl)).blob()
      const path = `handover/${signBatch.id}.png`
      const { error: upErr } = await supabase.storage.from('pod-files').upload(path, blob, { upsert: true, contentType: 'image/png' })
      if (upErr) throw upErr
      // The PATH, not a public URL: pod-files is private. See lib/storage.ts.
      const signedAt = new Date().toISOString()
      const { error } = await supabase.from('handover_batches').update({
        signature_url: path, signer_name: signBatch.to_location_id ? (profile?.name ?? memberName(signBatch.member_id)) : memberName(signBatch.member_id), signed_at: signedAt,
        receipt_lines: countLines,
      }).eq('id', signBatch.id)
      if (error) throw error

      /**
       * Signing is the moment the bottles land — in the hands of the person who
       * signed, and on a batch of their own.
       *
       * It used to book them onto the warehouse that person happened to be
       * ticked at, which for Djamy is Curaçao: the fifty bottles went straight
       * back where they came from and the island count never moved. Somebody
       * ticked nowhere had nothing booked at all, so the bottles left the books
       * entirely. Migration 112 gives a person a place of their own; her
       * question of 2026-08-21, "dat de app bijhoudt hoeveel flessen hij nog
       * over heeft".
       *
       * What they COUNTED, never what was sent.
       */
      if (signBatch.batch_id) {
        const rows = []
        for (const l of countLines.filter(l => l.received > 0)) {
          // A warehouse or a pair of hands — both are a place to stand stock
          // (migrations 112 and 117), and both open a batch of their own out of
          // the one it came from.
          const toPlace = signBatch.to_location_id ?? null
          const toPerson = toPlace ? null : signBatch.member_id
          const landedOn = await handoverBatchFor(supabase, {
            parentBatchId: signBatch.batch_id,
            handoverId: signBatch.id,
            locationId: toPlace,
            holderId: toPerson,
            sku: l.sku,
            on: signBatch.handover_date ?? new Date().toISOString().slice(0, 10),
          })
          const whom = toPlace ? placeName(toPlace) : memberName(toPerson)
          rows.push({
            batch_id: landedOn,
            sku: l.sku,
            qty: l.received,
            location_id: toPlace,
            holder_id: toPerson,
            reason: 'received',
            handover_batch_id: signBatch.id,
            note: l.received === l.expected
              ? `Received by ${whom}`
              : `Received by ${whom} — counted ${l.received} of ${l.expected}`,
            created_by: profile?.id,
          })
        }
        if (rows.length > 0) {
          const { error: moveErr } = await supabase.from('stock_movements').insert(rows)
          if (moveErr) throw moveErr
        }
      }

      // Email the member a receipt of what they took (fire-and-forget)
      fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'handover_receipt',
          payload: {
            memberId: signBatch.member_id,
            batchNumber: signBatch.batch_number,
            handoverDate: signBatch.handover_date
              ? new Date(signBatch.handover_date + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
              : null,
            items: signBatch.items,
            signedAt: new Date(signedAt).toLocaleString('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            notes: signBatch.notes,
          },
        }),
      }).catch(() => {})

      toast.success('Signed — receipt e-mailed to the team member')
      setSignBatch(null)
      loadBatches()
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save signature')
    } finally {
      setSigning(false)
    }
  }

  if (!profile) return null // wait for auth; both admin and sales may view this page

  const pending = batches.filter(b => !b.signed_at)
  const done = batches.filter(b => b.signed_at)

  return (
    <div className="p-3 lg:p-6 space-y-3 max-w-2xl mx-auto w-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-red-600" /> Handover Btls
          </h1>
          <p className="text-muted-foreground text-sm">
            {isAdmin ? 'Bottles ready for pick-up, allocated to the sales team' : 'Bottles allocated to you — sign to confirm receipt'}
          </p>
        </div>
        <Button variant="outline" size="icon" title="Export CSV"
          disabled={!batches.length}
          onClick={() => downloadCsv(
            'handover-batches',
            ['Batch #', 'Handover date', 'Member', 'Total bottles', 'Items', 'Signed by', 'Signed at', 'Notes', 'Created'],
            batches.map(b => [
              batchNumberOf(b) ?? '',
              b.handover_date ?? '',
              forWhom(b),
              (b.items ?? []).reduce((s, i) => s + (i.qty ?? 0), 0),
              (b.items ?? []).map(i => `${i.qty}x ${i.sku}`).join('; '),
              b.signer_name ?? '',
              b.signed_at ? csvDate(b.signed_at) : '',
              b.notes,
              csvDate(b.created_at),
            ])
          )}>
          <FileSpreadsheet className="h-4 w-4" />
        </Button>
      </div>

      {/* Making a handover. Admin, or somebody who works at a shelf —
          her instruction of 2026-08-20. The From list above is narrowed to the
          places they are a member of, so they can move their own stock and
          nobody else's. */}
      {(isAdmin || myLocationIds.length > 0) && (
      <Card size="sm" className="py-3 gap-2">
        <CardHeader><CardTitle className="text-sm">New handover</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">From</Label>
              {/* The same batch can be lying on Curaçao and in Rotterdam at
                  once, so the shelf it leaves has to be named. Null = Curaçao,
                  the same convention the stock movements use. */}
              <Select value={fromMine ? MY_OWN : (fromLocationId ?? CURACAO)}
                onValueChange={v => {
                  if (!v) return
                  setFromMine(v === MY_OWN)
                  setFromLocationId(v === MY_OWN || v === CURACAO ? null : v)
                  setBatchId(null)
                }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue>
                    {(v: string) => v === MY_OWN
                      ? 'My own stock'
                      : v === CURACAO
                        ? 'Curaçao'
                        : (locations ?? []).find(l => l.id === v)?.name ?? 'Curaçao'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* Only offered while you are really carrying something.
                      Handing back nothing is not a thing anybody needs to do. */}
                  {iAmCarrying && <SelectItem value={MY_OWN}>My own stock</SelectItem>}
                  {/* Only shelves you actually work at, unless you are the
                      admin. Danique, 2026-08-20: a warehouse member has to be
                      able to hand stock over to another warehouse — but from
                      THEIR shelf, not from one they have never stood in. */}
                  {(isAdmin || myLocationIds.includes(null)) && (
                    <SelectItem value={CURACAO}>Curaçao</SelectItem>
                  )}
                  {(locations ?? [])
                    .filter(l => isAdmin || myLocationIds.includes(l.id))
                    .map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={handoverDate} onChange={e => setHandoverDate(e.target.value)} className="h-9 w-40" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Batch</Label>
            {/* Chosen, never typed. The number is entered once, at Stock, when
                the batch is created — Danique, 2026-08-14. The list shows what
                is left at the place it is leaving from, not the grand total. */}
            <BatchSelect
              className="[&>button]:h-9 [&>button]:text-sm"
              value={batchId}
              onChange={setBatchId}
              locationId={fromLocationId}
              holderId={fromMine ? profile?.id ?? null : null}
              placeholder="Choose batch"
            />
          </div>
          {/* Two kinds of destination, both hers and neither replacing the
              other (2026-08-21): a colleague who takes bottles with them, and
              another warehouse that needs stock. */}
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <div className="flex gap-2">
              {(['person', 'warehouse'] as const).map(kind => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setDestination(kind)}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm ${
                    destination === kind
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/20 font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  {kind === 'person' ? 'A colleague' : 'Another warehouse'}
                </button>
              ))}
            </div>
          </div>

          {destination === 'person' ? (
            <div className="space-y-1">
              <Label className="text-xs">Team member</Label>
              <Select value={memberId} onValueChange={v => setMemberId(v ?? '')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent>
                  {salesTeam.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Since migration 112 the bottles land with the PERSON, not on
                  the warehouse they happen to be ticked at. Djamy carrying fifty
                  bottles used to book them straight back onto Curaçao, so the
                  island count never moved. */}
              {memberId && (
                <p className="text-xs text-muted-foreground">
                  Lands with {memberName(memberId)}, on their own batch. Their
                  dashboard counts down as they deliver.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Warehouse</Label>
              <Select
                value={toLocationId ?? CURACAO}
                onValueChange={v => v && setToLocationId(v === CURACAO ? null : v)}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CURACAO}>Curaçao</SelectItem>
                  {(locations ?? []).map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Ordered now, packed later. Her case: "admin stelt dit in, zodra
                  warehouse a dit gaat regelen en alles invoert". Until it is
                  sent the bottles are still standing where they are, so nothing
                  comes off that shelf yet. */}
              <label className="flex items-start gap-2 text-sm pt-1">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-red-600"
                  checked={!sendImmediately}
                  onChange={e => setSendImmediately(!e.target.checked)}
                />
                <span>
                  Ask them to send it
                  <span className="block text-xs text-muted-foreground">
                    The bottles stay on their shelf until they pack it and press
                    send. Both warehouses see it in the list until then.
                  </span>
                </span>
              </label>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Track &amp; trace / label</Label>
              {/* Handed over in person, or posted. When it goes by post the
                  number belongs here so it can be followed while it is away. */}
              <Input className="h-9" placeholder="e.g. 3SABCD1234567"
                value={tracking} onChange={e => setTracking(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Carrier</Label>
              <Input className="h-9" placeholder="e.g. PostNL"
                value={trackingCarrier} onChange={e => setTrackingCarrier(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            {HANDOVER_SKUS.map(sku => {
              const p = SPIKA_PRODUCTS.find(x => x.sku === sku)!
              const q = qtys[sku] ?? 0
              return (
                <div key={sku} className="flex items-center gap-2">
                  <p className="flex-1 text-sm truncate">{p.name}</p>
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => adjust(sku, -1)}><Minus className="h-3 w-3" /></Button>
                  <Input type="number" value={q} onChange={e => setQtys(prev => ({ ...prev, [sku]: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="h-7 w-14 text-center px-1" />
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => adjust(sku, 1)}><Plus className="h-3 w-3" /></Button>
                </div>
              )
            })}
          </div>
          <Input placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} className="h-9" />
          <Button className="bg-red-600 hover:bg-red-700 w-full" onClick={createBatch} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Create handover</>}
          </Button>
        </CardContent>
      </Card>
      )}

      {/* Pending signature */}
      {loading ? <Skeleton className="h-20 rounded-xl" /> : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Awaiting signature</p>
              {pending.map(b => (
                <Card key={b.id} className="py-0">
                  <CardContent className="py-2.5 px-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{forWhom(b)}</p>
                        {batchNumberOf(b) && <span className="font-mono text-xs text-muted-foreground shrink-0">{batchNumberOf(b)}</span>}
                        {b.handover_date && <span className="text-xs text-muted-foreground shrink-0">{new Date(b.handover_date + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.items.map(i => `${i.qty}× ${i.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}`).join(' · ')}
                      </p>
                      {/* Where it went and, when it travelled by post, how to
                          follow it while it is away. */}
                      <p className="text-xs text-muted-foreground truncate">
                        {routeOf(b)}
                        {b.tracking_number ? ` · ${b.tracking_carrier || 'tracking'} ${b.tracking_number}` : ''}
                        {shortOf(b) > 0 ? ` · ${shortOf(b)} short at intake` : ''}
                      </p>
                    </div>
                    {/* Three states since migration 117: asked for, on its way,
                        signed for. A handover that has not been sent yet cannot
                        be signed for — the bottles are still on the shelf it is
                        supposed to leave. */}
                    {b.sent_at ? (
                      <>
                        <Badge className="bg-orange-500 text-white text-xs shrink-0"><Clock className="h-3 w-3 mr-1" />On its way</Badge>
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 shrink-0" onClick={() => setSignBatch(b)}>Sign</Button>
                      </>
                    ) : (
                      <>
                        <Badge className="bg-slate-200 text-slate-700 text-xs shrink-0">Asked for</Badge>
                        <Button
                          size="sm" variant="outline" className="shrink-0" disabled={creating}
                          onClick={() => sendBatch(b)}
                        >
                          Send it
                        </Button>
                      </>
                    )}
                    {isAdmin && <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600" onClick={() => setDeleteBatch(b)} title="Delete"><Trash2 className="h-4 w-4" /></Button>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Handed over</p>
              {done.map(b => (
                <Card key={b.id} className="py-0 opacity-80">
                  <CardContent className="py-2.5 px-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{forWhom(b)}</p>
                        {batchNumberOf(b) && <span className="font-mono text-xs text-muted-foreground shrink-0">{batchNumberOf(b)}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.items.map(i => `${i.qty}× ${i.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}`).join(' · ')}
                      </p>
                      {/* Where it went and, when it travelled by post, how to
                          follow it while it is away. */}
                      <p className="text-xs text-muted-foreground truncate">
                        {routeOf(b)}
                        {b.tracking_number ? ` · ${b.tracking_carrier || 'tracking'} ${b.tracking_number}` : ''}
                        {shortOf(b) > 0 ? ` · ${shortOf(b)} short at intake` : ''}
                      </p>
                    </div>
                    {/* A plain href to pod-files is a dead link — the bucket is
                        private. The URL is signed at the moment of the click. */}
                    {b.signature_url && (
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="View signature"
                        onClick={async () => {
                          const ok = await openPrivateFile('pod-files', b.signature_url)
                          if (!ok) toast.error('Could not open the signature')
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    <Badge className="bg-green-600 text-white text-xs shrink-0"><Check className="h-3 w-3 mr-1" />
                      {b.signed_at ? new Date(b.signed_at).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : 'Signed'}
                    </Badge>
                    {isAdmin && <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600" onClick={() => setDeleteBatch(b)} title="Delete after reconciliation"><Trash2 className="h-4 w-4" /></Button>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Signature dialog */}
      {signBatch && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <p className="font-semibold text-sm">Sign for receipt — {forWhom(signBatch)}</p>
                <p className="text-xs text-muted-foreground">
                  {signBatch.items.map(i => `${i.qty}× ${i.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}`).join(' · ')}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSignBatch(null)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                By signing, {forWhom(signBatch)} confirms receipt of these bottles.
              </p>

              {/* Count first, sign after. A handover that travels by post can
                  arrive short, and signing for what was SENT would make that
                  shortage disappear the moment it is discovered. */}
              <div className="space-y-1.5">
                <Label className="text-xs">What actually arrived?</Label>
                {countLines.map((l, i) => {
                  const diff = l.received - l.expected
                  return (
                    <div key={l.sku} className="space-y-1 border-b pb-1.5 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-sm truncate">{l.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">of {l.expected}</span>
                        <Input type="number" min="0"
                          className={`h-7 w-20 text-sm text-right px-2 ${diff !== 0 ? 'border-orange-400' : ''}`}
                          value={l.received}
                          onChange={e => setCountLines(rows => rows.map((r, idx) =>
                            idx === i ? { ...r, received: Math.max(0, Number(e.target.value) || 0) } : r))} />
                      </div>
                      {diff !== 0 && (
                        <div className="flex items-center gap-2 pl-1">
                          <span className={`text-xs shrink-0 ${diff < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                          <Select value={l.reason || undefined}
                            onValueChange={v => v && setCountLines(rows => rows.map((r, idx) =>
                              idx === i ? { ...r, reason: v } : r))}>
                            <SelectTrigger className={`h-7 text-xs px-2 flex-1 ${!l.reason ? 'border-red-300' : ''}`}>
                              <SelectValue placeholder="Why?">
                                {(v: string) => RECEIPT_REASONS.find(r => r.value === v)?.label ?? 'Why?'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {RECEIPT_REASONS.map(r => (
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

              <canvas ref={canvasRef} className="w-full h-40 rounded-lg border bg-white touch-none" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => sigPadRef.current?.clear()}>Clear</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={confirmSign} disabled={signing}>
                  {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Confirm</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation — reconciliation after delivery */}
      {deleteBatch && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl p-4 space-y-3">
            <p className="font-semibold flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" /> Remove handover record?
            </p>
            <p className="text-sm text-muted-foreground">
              Only remove {batchNumberOf(deleteBatch) ? `batch ${batchNumberOf(deleteBatch)}` : 'this handover'} for{' '}
              {forWhom(deleteBatch)} once all deliveries are done and there are no discrepancies.
              This deletes the record and its signature permanently.
            </p>
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {deleteBatch.items.map(i => `${i.qty}× ${i.name.replace('SPika Oil - ', '').replace('SPika2Go - ', '')}`).join(' · ')}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteBatch(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={confirmDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-1" /> Delete</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
