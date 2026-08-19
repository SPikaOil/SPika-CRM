'use client'

import { useMemo, useState } from 'react'
import { Package, Plus, MapPin, ArrowDownToLine, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import { usePosItems } from '@/hooks/use-pos-items'
import { usePosStock, useRecordPosMovement, POS_REASONS, type PosReason } from '@/hooks/use-pos-stock'
import { useTransportLocations } from '@/hooks/use-transports'
import { posKindLabel } from '@/lib/pos'
import { driveThumbnail } from '@/lib/marketing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

/** Curaçao is location_id NULL, exactly as it is for bottles. */
const HOME = 'curacao'

/**
 * POS material on stock, per location.
 *
 * Her requirement of 2026-08-16: displays are received somewhere, they sit
 * there, and they go out to a reseller. Which is what the bottles already do,
 * so this reads the same way — plus in, minus out, Curaçao is the location with
 * no name.
 *
 * The number is a sum of movements and never a stored total. You cannot type a
 * new stock level here; you record what happened and the number follows. That
 * is the rule stock_movements set and the reason a count and a screen can never
 * quietly disagree.
 */
export function PosStockPanel() {
  const { can, isAdmin } = useAuth()
  const canReceive = isAdmin || can('warehouse.receive')

  const { data: items } = usePosItems()
  const { data: stock } = usePosStock()
  const { data: locations } = useTransportLocations()
  const record = useRecordPosMovement()

  const [open, setOpen] = useState(false)
  const [item, setItem] = useState('')
  const [qty, setQty] = useState('')
  const [where, setWhere] = useState(HOME)
  const [reason, setReason] = useState<PosReason>('received')
  const [note, setNote] = useState('')

  const locationName = (id: string | null) =>
    id === null ? 'Curaçao' : (locations ?? []).find(l => l.id === id)?.name ?? 'Unknown location'

  /** Grouped by place, because that is the question being asked: what is here? */
  const byLocation = useMemo(() => {
    const map = new Map<string, { name: string; rows: typeof stock }>()
    for (const row of stock ?? []) {
      const key = row.location_id ?? HOME
      if (!map.has(key)) map.set(key, { name: locationName(row.location_id), rows: [] })
      map.get(key)!.rows!.push(row)
    }
    return [...map.entries()].sort((a, b) => (a[0] === HOME ? -1 : b[0] === HOME ? 1 : a[1].name.localeCompare(b[1].name)))
  }, [stock, locations])

  function save() {
    if (!item) { toast.error('Pick an item'); return }
    const n = Math.abs(Number(qty) || 0)
    if (n === 0) { toast.error('How many?'); return }
    record.mutate(
      {
        pos_item_id: item,
        qty: n,
        reason,
        location_id: where === HOME ? null : where,
        note: note.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Recorded')
          setItem(''); setQty(''); setNote(''); setOpen(false)
        },
      },
    )
  }

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />
          POS material on stock
        </CardTitle>
        {canReceive && !open && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Record a movement
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {open && (
          <div className="rounded-lg border p-3 space-y-2.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">What</Label>
                <Select value={item || 'none'} onValueChange={v => setItem(!v || v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick an item" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pick an item</SelectItem>
                    {(items ?? []).map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">What happened</Label>
                <Select value={reason} onValueChange={v => v && setReason(v as PosReason)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue>{(v: string) => POS_REASONS.find(r => r.key === v)?.label ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {POS_REASONS.filter(r => r.key !== 'adjustment').map(r => (
                      <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">How many</Label>
                <Input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className="h-8 text-xs" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Where</Label>
                <Select value={where} onValueChange={v => v && setWhere(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue>{(v: string) => v === HOME ? 'Curaçao' : ((locations ?? []).find(l => l.id === v)?.name ?? 'Pick one')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={HOME}>Curaçao</SelectItem>
                    {(locations ?? []).map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Note — where it came from, who signed for it"
              className="h-8 text-xs"
            />

            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={save} disabled={record.isPending}>
                <ArrowDownToLine className="h-3.5 w-3.5 mr-1" />
                Record
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {(stock ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing on stock yet. Record what arrived and it appears here, per location.
          </p>
        ) : (
          byLocation.map(([key, group]) => (
            <div key={key} className="space-y-1">
              <p className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {group.name}
              </p>
              <div className="rounded-lg border divide-y">
                {(group.rows ?? []).map(row => {
                  const photo = ((items ?? []).find(i => i.id === row.pos_item_id)?.photos ?? [])[0]
                  return (
                    <div key={row.pos_item_id} className="flex items-center gap-2 px-2.5 py-1.5">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={driveThumbnail(photo, 80)} alt="" className="h-7 w-7 rounded object-cover border shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded border bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{row.item_name}</p>
                        <p className="text-[11px] text-muted-foreground">{posKindLabel(row.item_kind)}</p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ${row.qty < 0 ? 'text-red-600' : ''}`}>
                        {row.qty}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
