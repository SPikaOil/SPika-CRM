'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  DefectReport, DefectLiability, DEFECT_REASON_LABELS,
} from '@/types'

/**
 * Judging what a customer reported.
 *
 * The customer says what is wrong. Only here is it decided WHO carries it, and
 * that single choice is the whole financial consequence:
 *
 *   spika    — art. 4.3, a defect attributable to us. The customer owes
 *              nothing and the bottles are our loss.
 *   customer — art. 4.4, their risk. Damaged or unsellable goods count as sold
 *              and stay invoiced.
 *   carrier  — damaged in transit; claimed with the carrier.
 *
 * The database refuses to close a report without that choice, so it can never
 * be accepted "in general".
 */

const LIABILITY: { value: DefectLiability; label: string; hint: string }[] = [
  { value: 'spika',    label: 'Our defect',        hint: 'Art. 4.3 — customer owes nothing, we write it off' },
  { value: 'customer', label: 'Their risk',        hint: 'Art. 4.4 — counts as sold, stays invoiced' },
  { value: 'carrier',  label: 'Damaged in transit', hint: 'Claimed with the carrier' },
]

export function DefectReportsPanel({ orderId }: { orderId: string }) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [liability, setLiability] = useState<Record<string, DefectLiability>>({})
  const [resolution, setResolution] = useState<Record<string, string>>({})

  const { data: reports } = useQuery({
    queryKey: ['defect_reports', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('defect_reports')
        .select('*')
        .eq('order_id', orderId)
        .order('reported_at', { ascending: false })
      if (error) throw error
      return data as DefectReport[]
    },
  })

  if (!reports || reports.length === 0) return null

  async function openPhoto(path: string) {
    // Photos live in the private bucket, so they are opened through a
    // short-lived signed URL — never a public link.
    if (/^https?:\/\//i.test(path)) { window.location.href = path; return }
    const { data, error } = await supabase.storage.from('pod-files').createSignedUrl(path, 600)
    if (error || !data?.signedUrl) { toast.error('Could not open the photo'); return }
    window.location.href = data.signedUrl
  }

  async function judge(report: DefectReport, status: 'accepted' | 'rejected') {
    const chosen = liability[report.id]
    if (!chosen) { toast.error('Choose who carries this first'); return }
    setBusy(report.id)
    try {
      const { error } = await supabase.from('defect_reports').update({
        status,
        liability: chosen,
        resolution: (resolution[report.id] ?? '').trim(),
        reviewed_at: new Date().toISOString(),
      }).eq('id', report.id)
      if (error) throw error
      toast.success(status === 'accepted' ? 'Report accepted' : 'Report rejected')
      queryClient.invalidateQueries({ queryKey: ['defect_reports', orderId] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the decision')
    } finally {
      setBusy(null)
    }
  }

  const open = reports.filter(r => r.status === 'open')

  return (
    <Card size="sm" className={open.length > 0 ? 'border-amber-300' : undefined}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Reported problems
          {open.length > 0 && (
            <Badge className="text-xs bg-amber-100 text-amber-700">{open.length} open</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {reports.map(r => (
          <div key={r.id} className="rounded-lg border p-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {r.qty}× {DEFECT_REASON_LABELS[r.reason]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.sku}
                  {r.batch_number ? ` · batch ${r.batch_number}` : ''}
                  {' · '}
                  {new Date(r.reported_at).toLocaleDateString('en', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              </div>
              <Badge className={`text-xs shrink-0 ${
                r.status === 'open' ? 'bg-amber-100 text-amber-700'
                : r.status === 'accepted' ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
              }`}>
                {r.status}
              </Badge>
            </div>

            {r.note && <p className="text-sm bg-muted/50 rounded p-2">{r.note}</p>}

            {r.photo_url && (
              <button
                onClick={() => openPhoto(r.photo_url!)}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:underline"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                View photo
              </button>
            )}

            {r.status === 'open' ? (
              <div className="space-y-2 pt-0.5">
                <div className="space-y-1">
                  <Label className="text-xs">Who carries this?</Label>
                  <Select
                    value={liability[r.id] ?? ''}
                    onValueChange={v => v && setLiability(l => ({ ...l, [r.id]: v as DefectLiability }))}
                  >
                    <SelectTrigger className="h-7 w-full text-xs">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      {LIABILITY.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {liability[r.id] && (
                    <p className="text-[11px] text-muted-foreground">
                      {LIABILITY.find(o => o.value === liability[r.id])?.hint}
                    </p>
                  )}
                </div>
                <Input
                  className="h-7 text-xs"
                  placeholder="What did we agree with the customer?"
                  value={resolution[r.id] ?? ''}
                  onChange={e => setResolution(s => ({ ...s, [r.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700"
                    disabled={busy === r.id} onClick={() => judge(r, 'accepted')}>
                    {busy === r.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    disabled={busy === r.id} onClick={() => judge(r, 'rejected')}>
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground space-y-0.5 pt-0.5">
                <p>
                  {LIABILITY.find(o => o.value === r.liability)?.label ?? r.liability}
                  {r.reviewed_at && ` · ${new Date(r.reviewed_at).toLocaleDateString('en', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}`}
                </p>
                {r.resolution && <p>{r.resolution}</p>}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
