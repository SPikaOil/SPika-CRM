'use client'

import { useState } from 'react'
import { AlertTriangle, Camera, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  DefectReason, QuoteItem,
  VISIBLE_DEFECT_REASONS, HIDDEN_DEFECT_REASONS, DEFECT_REASON_LABELS,
} from '@/types'

/**
 * A customer reporting something wrong with what they received.
 *
 * Reported per DELIVERY, not per order: that is how we know which batch it came
 * from — the customer cannot be expected to find a batch number on a bottle,
 * but we know which batch went out on which run.
 *
 * The 48-hour rule: they sign for receipt, so anything you can see when the box
 * is opened is settled at that moment (art. 2.4). After two days only hidden
 * defects remain reportable — a leaking bottle, a broken seal, dirt, off
 * quality — because those only show when a bottle is actually handled (art.
 * 2.5). The window is deliberately enforced by hiding the reasons, not by
 * blocking the form: there is always something they can report.
 */

const WINDOW_HOURS = 48

export function ReportProblem({
  orderId,
  customerId,
  delivery,
  fallbackItems,
}: {
  orderId: string
  customerId: string
  delivery: { id: string; delivered_at: string; items?: QuoteItem[]; batch_number?: string | null }
  fallbackItems: QuoteItem[]
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sku, setSku] = useState('')
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState<DefectReason | ''>('')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')

  const lines = (delivery.items ?? []).length > 0 ? delivery.items! : fallbackItems
  const hoursSince = (Date.now() - new Date(delivery.delivered_at).getTime()) / 36e5
  const withinWindow = hoursSince <= WINDOW_HOURS

  // Inside 48 hours everything is reportable. After that, only what could not
  // have been spotted at handover.
  const reasons: DefectReason[] = withinWindow
    ? [...VISIBLE_DEFECT_REASONS, ...HIDDEN_DEFECT_REASONS]
    : HIDDEN_DEFECT_REASONS

  const needsNote = reason === 'other'
  const noteTooShort = needsNote && note.trim().length < 10
  const canSubmit = !!sku && qty > 0 && !!reason && !noteTooShort && !busy

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function reset() {
    setOpen(false)
    setSku('')
    setQty(1)
    setReason('')
    setNote('')
    setPhoto(null)
    setPhotoPreview('')
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      // The photo goes to storage first; the report keeps the PATH, never a
      // public URL, so it is served through a signed link like every other
      // proof document here.
      let photoPath: string | null = null
      if (photo) {
        const key = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const ext = (photo.name.split('.').pop() ?? 'jpg').toLowerCase()
        const path = `defect-reports/${key}.${ext}`
        const { error } = await supabase.storage.from('pod-files').upload(path, photo)
        if (error) throw error
        photoPath = path
      }

      const { error } = await supabase.from('defect_reports').insert({
        order_id: orderId,
        customer_id: customerId,
        delivery_id: delivery.id,
        sku,
        qty,
        // Recorded from the delivery, because the customer cannot find it.
        batch_number: delivery.batch_number ?? '',
        reason,
        note: note.trim(),
        photo_url: photoPath,
        status: 'open',
      })
      if (error) throw error

      toast.success('Thank you — we have received your report and will come back to you.')
      reset()
    } catch (err) {
      // Never silent: a report that vanishes is worse than one that fails loudly.
      toast.error(err instanceof Error ? err.message : 'Could not send the report')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-red-600 hover:underline pt-1"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Report a problem with this delivery
      </button>
    )
  }

  return (
    <div className="rounded-lg border p-3 space-y-2.5 mt-1">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Report a problem</p>
        <button onClick={reset} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!withinWindow && (
        <p className="text-xs text-muted-foreground">
          This delivery was signed for more than 48 hours ago. Damage and shortages are
          checked at handover, so those can no longer be reported — but anything you could
          not have seen then still can.
        </p>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Which product?</Label>
        <Select value={sku} onValueChange={v => v && setSku(v)}>
          <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Select a product" /></SelectTrigger>
          <SelectContent>
            {lines.map(l => (
              <SelectItem key={l.sku} value={l.sku}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">How many bottles?</Label>
        <Input
          type="number"
          min="1"
          className="h-8 w-24"
          value={qty}
          onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">What is wrong?</Label>
        <Select value={reason} onValueChange={v => v && setReason(v as DefectReason)}>
          <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Select a reason" /></SelectTrigger>
          <SelectContent>
            {reasons.map(r => (
              <SelectItem key={r} value={r}>{DEFECT_REASON_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          {needsNote ? 'Describe what is wrong *' : 'Anything else you want to tell us'}
        </Label>
        <Textarea
          rows={2}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={needsNote ? 'Please describe the problem' : 'Optional'}
        />
        {noteTooShort && (
          <p className="text-xs text-red-600">
            Please describe the problem in a few words so we can act on it.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Photo</Label>
        {photoPreview ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="" className="h-16 w-16 object-cover rounded border" />
            <button onClick={() => { setPhoto(null); setPhotoPreview('') }}
              className="text-xs text-red-600 hover:underline">
              Remove
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Camera className="h-4 w-4" />
            <span className="hover:underline">Add a photo</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} />
          </label>
        )}
        <p className="text-[11px] text-muted-foreground">
          A photo helps us settle this quickly. Please keep the bottles — we may want to look at them.
        </p>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={!canSubmit} onClick={submit}>
          {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Send report
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
      </div>
    </div>
  )
}
