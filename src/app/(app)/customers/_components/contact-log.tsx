'use client'

import { useState } from 'react'
import { Plus, X, Phone, MessageCircle, MapPin, Mail, CircleDot } from 'lucide-react'
import { ContactLogEntry } from '@/types'
import { useAddContactLog, useDeleteContactLog } from '@/hooks/use-customers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'phone',    label: 'Phone',    icon: Phone },
  { value: 'visit',    label: 'Visit',    icon: MapPin },
  { value: 'email',    label: 'Email',    icon: Mail },
  { value: 'other',    label: 'Other',    icon: CircleDot },
] as const

const channelMeta = (v: string) => CHANNELS.find(c => c.value === v) ?? CHANNELS[4]
const today = () => new Date().toISOString().slice(0, 10)

// Contact log — touchpoints (who / when / how / note) for any customer or lead.
export function ContactLog({ customerId, log }: { customerId: string; log: ContactLogEntry[] }) {
  const add = useAddContactLog()
  const del = useDeleteContactLog()

  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today())
  const [who, setWho] = useState('')
  const [channel, setChannel] = useState<string>('whatsapp')
  const [note, setNote] = useState('')

  const entries = [...(log ?? [])].sort((a, b) => (b.contacted_at || '').localeCompare(a.contacted_at || ''))

  async function save() {
    if (!note.trim() && !who.trim()) return
    await add.mutateAsync({
      customerId,
      entry: { contacted_at: date || today(), contacted_by: who.trim(), channel, note: note.trim() },
    })
    setWho(''); setNote(''); setChannel('whatsapp'); setDate(today()); setOpen(false)
  }

  return (
    <Card className="py-0">
      <CardHeader className="pt-3 pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Contact log</CardTitle>
        {!open && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Log contact
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {/* Add form */}
        {open && (
          <div className="rounded-lg border p-3 space-y-2.5 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8" max={today()} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Channel</Label>
                <Select value={channel} onValueChange={v => v && setChannel(v)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Spoke with <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={who} onChange={e => setWho(e.target.value)} placeholder="e.g. Maria (owner)" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="What was discussed, next steps…" rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setOpen(false) }}>Cancel</Button>
              <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700" disabled={add.isPending || (!note.trim() && !who.trim())} onClick={save}>
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Entries */}
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">No contact logged yet.</p>
        ) : (
          <div className="space-y-2.5">
            {entries.map((e) => {
              const cm = channelMeta(e.channel)
              const Icon = cm.icon
              return (
                <div key={e.id} className="flex gap-2.5 group">
                  <div className="mt-0.5 shrink-0 h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">
                        {e.contacted_at ? new Date(e.contacted_at + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{cm.label}{e.contacted_by ? ` · ${e.contacted_by}` : ''}</span>
                    </div>
                    {e.note && <p className="text-sm whitespace-pre-wrap leading-snug mt-0.5">{e.note}</p>}
                  </div>
                  <button
                    type="button"
                    title="Remove entry"
                    onClick={() => del.mutate({ customerId, entryId: e.id })}
                    className="shrink-0 h-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
