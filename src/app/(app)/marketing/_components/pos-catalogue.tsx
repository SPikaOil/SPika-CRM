'use client'

import { useState } from 'react'
import { Package, Plus, Pencil, Trash2, Link2, PackageX } from 'lucide-react'
import { POS_KINDS, posKindLabel } from '@/lib/pos'
import {
  usePosItems, useSavePosItem, useDeletePosItem, type PosItem,
} from '@/hooks/use-pos-items'
import { useMarketingAssets } from '@/hooks/use-marketing-assets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const EMPTY = {
  name: '', kind: 'display' as string, sku: '', asset_id: '',
  is_available: true, notes: '', sort_order: 0,
}

/**
 * The catalogue of things we physically ship.
 *
 * Its own list rather than a ninth category on the asset grid, because these
 * rows have no file: no thumbnail, no download button, no Drive link. A rack
 * has no artwork at all — which is why it could never have been an asset,
 * marketing_assets.file_ref being NOT NULL.
 */
export function PosCatalogue({ canManage }: { canManage: boolean }) {
  const { data: items, isLoading } = usePosItems()
  const { data: assets } = useMarketingAssets(true)
  const saveItem = useSavePosItem()
  const deleteItem = useDeletePosItem()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PosItem | null>(null)
  const [form, setForm] = useState(EMPTY)

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setDialogOpen(true)
  }

  function openEdit(item: PosItem) {
    setEditing(item)
    setForm({
      name: item.name,
      kind: item.kind,
      sku: item.sku ?? '',
      asset_id: item.asset_id ?? '',
      is_available: item.is_available,
      notes: item.notes ?? '',
      sort_order: item.sort_order,
    })
    setDialogOpen(true)
  }

  function handleSave() {
    if (!form.name.trim()) return
    saveItem.mutate(
      {
        id: editing?.id,
        name: form.name.trim(),
        kind: form.kind as PosItem['kind'],
        // Empty means "let the name decide" — the €0 line falls back to a slug.
        sku: form.sku.trim() || null,
        asset_id: form.asset_id || null,
        is_available: form.is_available,
        notes: form.notes.trim(),
        sort_order: form.sort_order,
      },
      { onSuccess: () => setDialogOpen(false) },
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-lg">
          What we put in a box and send. A reseller does not download these — they
          ask for them, and they ride along on the next order as a €0 line.
        </p>
        {canManage && (
          <Button onClick={openNew} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            Add POS item
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (items ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Package className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Nothing in the catalogue yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Add a display, a wobbler or a shelf talker. Once it is here you can
              record which resellers have it, and put it on an order.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 gap-0">
          <CardContent className="p-0 divide-y">
            {(items ?? []).map(item => {
              const artwork = (assets ?? []).find(a => a.id === item.asset_id)
              return (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                    item.is_available ? 'bg-muted' : 'bg-muted/50'
                  }`}>
                    {item.is_available
                      ? <Package className="h-4 w-4" />
                      : <PackageX className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${!item.is_available ? 'text-muted-foreground' : ''}`}>
                      {item.name}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{posKindLabel(item.kind)}</span>
                      {artwork && (
                        <span className="flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          {artwork.title}
                        </span>
                      )}
                      {item.notes && <span className="truncate">· {item.notes}</span>}
                    </p>
                  </div>
                  {!item.is_available && (
                    <Badge variant="outline" className="text-[10px] shrink-0">Out of stock</Badge>
                  )}
                  {canManage && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(item)}
                        className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-accent"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Remove "${item.name}" from the catalogue? It also disappears from every reseller's register.`)) return
                          deleteItem.mutate(item.id)
                        }}
                        className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit POS item' : 'New POS item'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. SPika stand — 12 bottles (one side)"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={v => setForm(f => ({ ...f, kind: v ?? f.kind }))}>
                <SelectTrigger>
                  <SelectValue>{(v: string) => posKindLabel(v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {POS_KINDS.map(k => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {POS_KINDS.find(k => k.key === form.kind)?.hint}
              </p>
            </div>

            {/* Optional, and only meaningful for the ones that have a print
                file. A rack has none, which is the whole reason this catalogue
                is not part of the asset list. */}
            <div className="space-y-1.5">
              <Label>Print file <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Select
                value={form.asset_id || 'none'}
                onValueChange={v => setForm(f => ({ ...f, asset_id: !v || v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="No file" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No file</SelectItem>
                  {(assets ?? []).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs font-normal">(internal)</span></Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Supplier, dimensions, anything worth remembering"
                rows={2}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-red-600"
                checked={form.is_available}
                onChange={e => setForm(f => ({ ...f, is_available: e.target.checked }))}
              />
              <span className="text-sm">
                In stock
                <span className="text-muted-foreground"> — switch off when the print run is out</span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveItem.isPending}>
              {editing ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
