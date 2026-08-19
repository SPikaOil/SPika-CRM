'use client'

import { useState } from 'react'
import { Package, Plus, Trash2, X } from 'lucide-react'
import { posKindLabel } from '@/lib/pos'
import { driveThumbnail } from '@/lib/marketing'
import {
  usePosItems, useCustomerPosItems, useSaveCustomerPosItem, useDeleteCustomerPosItem,
} from '@/hooks/use-pos-items'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

/**
 * What this reseller has standing in their shop.
 *
 * The register the rest of it reads: the picker on an order and the picker on a
 * delivery run both offer what is listed here. Filling it in is part of editing
 * the customer, so it follows customers.edit.
 *
 * The bottle racks that used to live in customers.spika_stands were carried in
 * here by migration 088 — 28 of them across 14 resellers.
 */
export function PosRegister({ customerId, canEdit }: { customerId: string; canEdit: boolean }) {
  const { data: catalogue } = usePosItems()
  const { data: register } = useCustomerPosItems(customerId)
  const saveRow = useSaveCustomerPosItem()
  const deleteRow = useDeleteCustomerPosItem()

  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('1')

  const available = (catalogue ?? []).filter(
    i => !(register ?? []).some(r => r.pos_item_id === i.id),
  )

  function add() {
    if (!pick) return
    saveRow.mutate(
      {
        customer_id: customerId,
        pos_item_id: pick,
        qty: Math.max(1, Number(qty) || 1),
        since: new Date().toISOString().slice(0, 10),
      },
      { onSuccess: () => { setPick(''); setQty('1'); setAdding(false) } },
    )
  }

  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" />
            POS material at this reseller
          </p>
          {canEdit && !adding && available.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          )}
        </div>

        {adding && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2.5">
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs">Item</Label>
              <Select value={pick || 'none'} onValueChange={v => setPick(!v || v === 'none' ? '' : v)}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pick one</SelectItem>
                  {available.map(i => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 w-20">
              <Label className="text-xs">How many</Label>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="h-8"
              />
            </div>
            <Button size="sm" onClick={add} disabled={!pick}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setPick('') }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {(register ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing recorded yet. Add what is standing in their shop, and it becomes
            pickable on their orders.
          </p>
        ) : (
          <div className="divide-y">
            {(register ?? []).map(row => (
              <div key={row.id} className="flex items-center gap-2 py-1.5">
                {/* On screen only. The €0 line that reaches a packing slip
                    carries a name and a quantity and nothing else. */}
                {(row.item?.photos ?? []).length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={driveThumbnail(row.item!.photos[0], 100)}
                    alt={row.item?.name ?? ''}
                    className="h-9 w-9 rounded-md object-cover border shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-md border bg-muted flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <span className="text-sm font-medium w-8 shrink-0">{row.qty}×</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{row.item?.name ?? 'Unknown item'}</p>
                  <p className="text-xs text-muted-foreground">
                    {posKindLabel(row.item?.kind)}
                    {row.since && ` · since ${new Date(row.since).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`}
                  </p>
                </div>
                {canEdit && (
                  <button
                    onClick={() => {
                      if (!confirm(`Remove ${row.qty}× ${row.item?.name} from this reseller?`)) return
                      deleteRow.mutate({ id: row.id, customerId })
                    }}
                    className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600 shrink-0"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Pick POS material to send along — on an order, or on one delivery run.
 *
 * Offers what is registered on this reseller. Everything picked becomes a €0
 * line, which is why it lands on the packing slip without anything extra: the
 * delivery note PDF prints the lines it is given.
 *
 * The photo stays here on screen. Her instruction of 2026-08-16: photos are for
 * the app, never for an invoice or a packing slip. posOrderLineFor() returns
 * six fields and none of them is an image, so a document could not carry one
 * even if somebody tried.
 */
export function PosPicker({
  customerId, value, onChange, label = 'POS material with this delivery',
}: {
  customerId?: string | null
  value: Record<string, number>
  onChange: (next: Record<string, number>) => void
  label?: string
}) {
  const { data: register } = useCustomerPosItems(customerId)

  if (!customerId || (register ?? []).length === 0) return null

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="rounded-lg border divide-y">
        {(register ?? []).map(row => {
          const id = row.pos_item_id
          const picked = value[id] ?? 0
          return (
            <div key={row.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-red-600 shrink-0"
                checked={picked > 0}
                onChange={e => {
                  const next = { ...value }
                  if (e.target.checked) next[id] = row.qty
                  else delete next[id]
                  onChange(next)
                }}
              />
              {(row.item?.photos ?? []).length > 0 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={driveThumbnail(row.item!.photos[0], 80)}
                  alt=""
                  className="h-7 w-7 rounded object-cover border shrink-0"
                />
              )}
              <span className="text-sm flex-1 truncate">{row.item?.name ?? 'Unknown item'}</span>
              <span className="text-xs text-muted-foreground shrink-0">has {row.qty}</span>
              {picked > 0 && (
                <Input
                  type="number"
                  min={1}
                  value={picked}
                  onChange={e => onChange({ ...value, [id]: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-7 w-16 shrink-0"
                />
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Goes on as a €0 line, so it shows up on the packing slip.
      </p>
    </div>
  )
}
